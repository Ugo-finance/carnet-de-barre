-- Le carnet distant — CB-79c.
--
-- Trois tables, un **seul chemin d'écriture**, et une enveloppe qui permet de relire
-- exactement ce qui a été sauvegardé.
--
-- ## La leçon qui a refait ce fichier
--
-- Une première version posait des règles d'accès `for all` et une fonction d'écriture
-- soigneuse — atomique, idempotente, refusant une révision périmée. Codex a montré que
-- ces trois propriétés **n'étaient pas des invariants du schéma** : avec les droits par
-- défaut de l'API, un client authentifié pouvait insérer directement dans `seance`, sans
-- passer par la fonction, avec la révision de son choix. Les garanties ne tenaient que
-- tant que l'appelant était poli.
--
-- C'est exactement le défaut qu'il m'avait déjà signalé sur le protocole local, un étage
-- plus haut : j'avais écrit qu'un invariant tenait « par construction » alors qu'il ne
-- tenait que par la correction de l'appelant. Ici la conséquence est plus lourde, parce
-- que l'appelant est le monde entier.
--
-- Donc : **aucune écriture directe**. Les tables ne donnent que la lecture, et tout ce
-- qui écrit passe par `appliquer_sauvegarde`.

-- ---------------------------------------------------------------------------
-- Les tables
-- ---------------------------------------------------------------------------

create table if not exists public.carnet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Entier strictement croissant. N'avance que si séances et cibles forment ensemble un
  -- état complet : un échec partiel ne la fait jamais bouger.
  revision bigint not null default 0,
  -- La dernière opération appliquée : c'est elle qui rend un réessai inoffensif après
  -- une réponse perdue.
  derniere_operation text,
  -- L'enveloppe, exigée par le contrat (docs/refonte/21-synchronisation.md § 4). Sans
  -- `schema_version`, une restauration devrait **inventer** la version du format au lieu
  -- de relire celle qui a été écrite.
  schema_version integer,
  ecrit_par text,
  ecrit_le timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.seance (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  contenu jsonb not null,
  revision_carnet bigint not null,
  operation text not null,
  ecrit_par text not null,
  ecrit_le timestamptz not null,
  primary key (user_id, id),
  constraint seance_contenu_objet check (jsonb_typeof(contenu) = 'object')
);

create table if not exists public.cibles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  contenu jsonb not null,
  revision_carnet bigint not null,
  operation text not null,
  ecrit_par text not null,
  ecrit_le timestamptz not null,
  constraint cibles_contenu_objet check (jsonb_typeof(contenu) = 'object')
);

-- ---------------------------------------------------------------------------
-- Lecture seule pour les clients, et rien d'autre
-- ---------------------------------------------------------------------------
--
-- La clé publishable est dans le paquet de l'app, donc publique. Elle ne protège rien.
-- Deux choses protègent le carnet, et il faut les deux :
--
-- 1. **les règles de ligne** : un compte ne voit que ses propres lignes ;
-- 2. **l'absence de droit d'écrire** : même autorisé à voir sa ligne, un client ne peut
--    pas la modifier sans passer par la fonction. Sinon la révision, l'idempotence et
--    l'atomicité ne seraient que des conventions.

alter table public.carnet enable row level security;
alter table public.seance enable row level security;
alter table public.cibles enable row level security;

-- Aucune politique d'écriture, délibérément : sans politique, l'écriture est refusée.
create policy "lire son carnet" on public.carnet
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lire ses séances" on public.seance
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lire ses cibles" on public.cibles
  for select to authenticated using (user_id = (select auth.uid()));

-- Et les droits eux-mêmes, en plus des politiques. Supabase accorde par défaut les
-- opérations d'écriture aux rôles de l'API ; les laisser reviendrait à faire reposer
-- toute la protection sur l'absence de politique.
revoke all on public.carnet from anon, authenticated;
revoke all on public.seance from anon, authenticated;
revoke all on public.cibles from anon, authenticated;
grant select on public.carnet to authenticated;
grant select on public.seance to authenticated;
grant select on public.cibles to authenticated;

-- ---------------------------------------------------------------------------
-- L'unique chemin d'écriture
-- ---------------------------------------------------------------------------
--
-- `security definer` parce que les tables n'accordent plus l'écriture à personne. La
-- fonction devient donc le seul écrivain, et sa correction n'est plus protégée par les
-- règles de ligne : **c'est elle qui doit cloisonner**. Elle ne reçoit aucun identifiant
-- d'utilisateur — il n'y a donc rien à falsifier — et filtre tout sur `auth.uid()`.
--
-- `search_path` est figé : sans cela, un schéma placé en tête par l'appelant pourrait
-- détourner un nom de table vers le sien.

create or replace function public.appliquer_sauvegarde(
  p_operation text,
  p_revision_attendue bigint,
  p_schema_version integer,
  p_appareil text,
  p_seances jsonb,
  p_cibles jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_revision bigint;
  v_operation text;
  v_maintenant timestamptz := now();
begin
  if v_user is null then
    raise exception 'Aucune session : la sauvegarde exige un compte connecté.'
      using errcode = '42501';
  end if;

  -- Les paramètres absents sont refusés **explicitement**, et ce n'est pas de la
  -- pédanterie. En SQL, `revision <> null` vaut `null`, donc un `if` ne s'y déclenche
  -- pas : une révision absente **traversait le contrôle de concurrence** et l'écriture
  -- s'appliquait. Une opération absente désactivait de même l'idempotence. Un garde qui
  -- s'évapore quand son entrée manque est pire qu'un garde absent.
  if p_operation is null or btrim(p_operation) = '' then
    raise exception 'Opération absente : un envoi doit porter une identité stable.'
      using errcode = '22023';
  end if;
  if p_revision_attendue is null or p_revision_attendue < 0 then
    raise exception 'Révision attendue absente ou négative : le contrôle de concurrence serait contourné.'
      using errcode = '22023';
  end if;
  if p_schema_version is null or p_schema_version < 1 then
    raise exception 'Version de schéma absente : une restauration devrait l''inventer.'
      using errcode = '22023';
  end if;
  if p_appareil is null or btrim(p_appareil) = '' then
    raise exception 'Appareil absent : l''enveloppe doit dire qui a écrit.'
      using errcode = '22023';
  end if;
  if p_seances is null or jsonb_typeof(p_seances) <> 'array' then
    raise exception 'Séances absentes ou mal formées : un tableau est attendu.'
      using errcode = '22023';
  end if;
  if p_cibles is null or jsonb_typeof(p_cibles) <> 'object' then
    raise exception 'Cibles absentes ou mal formées : un objet est attendu.'
      using errcode = '22023';
  end if;

  -- **Le verrou d'abord, la création ensuite**, et cet ordre n'est pas cosmétique.
  --
  -- La version précédente faisait l'inverse : `insert … on conflict do nothing`, puis
  -- `select … for update`. Elle sérialisait correctement — mais par l'insertion, pas par
  -- le verrou : une insertion spéculative attend la transaction qui détient la ligne en
  -- conflit. Le `for update` ne servait donc à rien, et aucune mutation ne pouvait le
  -- faire rougir. Un garde que personne ne peut casser n'est pas un garde : c'est du code
  -- mort portant le nom d'une protection, et le jour où l'insertion serait déplacée, la
  -- sérialisation partirait sans bruit.
  --
  -- Ici le verrou est le mécanisme réel. Sans lui, deux appareils lisant la même révision
  -- passeraient tous deux le contrôle et le second écraserait le premier en silence.
  loop
    select revision, derniere_operation into v_revision, v_operation
    from public.carnet where user_id = v_user for update;
    exit when found;

    -- Personne encore : on crée. Deux premières sauvegardes simultanées peuvent se
    -- croiser ici ; celle qui perd repasse par le verrou plutôt que d'échouer.
    begin
      insert into public.carnet (user_id) values (v_user);
      v_revision := 0;
      v_operation := null;
      exit;
    exception when unique_violation then
      -- Une autre session vient de le créer. On reboucle, et le `for update` l'attend.
    end;
  end loop;

  if v_operation is not null and v_operation = p_operation then
    return jsonb_build_object('applique', false, 'motif', 'deja-applique', 'revision', v_revision);
  end if;

  if v_revision <> p_revision_attendue then
    return jsonb_build_object('applique', false, 'motif', 'revision-perimee', 'revision', v_revision);
  end if;

  v_revision := v_revision + 1;

  -- Le protocole envoie un instantané complet : le distant devient exactement ce qui a
  -- été figé. Une séance supprimée localement doit disparaître ici aussi.
  delete from public.seance where user_id = v_user;
  insert into public.seance (user_id, id, contenu, revision_carnet, operation, ecrit_par, ecrit_le)
  select v_user, element ->> 'id', element, v_revision, p_operation, p_appareil, v_maintenant
  from jsonb_array_elements(p_seances) as element;

  insert into public.cibles (user_id, contenu, revision_carnet, operation, ecrit_par, ecrit_le)
  values (v_user, p_cibles, v_revision, p_operation, p_appareil, v_maintenant)
  on conflict (user_id) do update
    set contenu = excluded.contenu,
        revision_carnet = excluded.revision_carnet,
        operation = excluded.operation,
        ecrit_par = excluded.ecrit_par,
        ecrit_le = excluded.ecrit_le;

  update public.carnet
  set revision = v_revision,
      derniere_operation = p_operation,
      schema_version = p_schema_version,
      ecrit_par = p_appareil,
      ecrit_le = v_maintenant,
      updated_at = v_maintenant
  where user_id = v_user;

  return jsonb_build_object('applique', true, 'motif', 'applique', 'revision', v_revision);
end;
$$;

-- Exécutable par un compte connecté, et par personne d'autre.
revoke all on function public.appliquer_sauvegarde(text, bigint, integer, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.appliquer_sauvegarde(text, bigint, integer, text, jsonb, jsonb)
  to authenticated;
