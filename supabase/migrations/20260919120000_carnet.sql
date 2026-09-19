-- Le carnet distant — CB-79c.
--
-- Trois tables et une fonction. La fonction est le cœur : c'est elle qui rend une
-- écriture atomique, idempotente et refusable, les trois propriétés que le protocole
-- local suppose sans pouvoir les garantir seul.
--
-- Forme retenue : une ligne par séance, un document de cibles, et **une révision portée
-- par le carnet entier** (docs/refonte/21-synchronisation.md § 4). Une révision par
-- document ne définirait aucun état cohérent : l'ajout de séance réussit, les cibles
-- échouent, et une restauration recollerait une séance neuve avec d'anciennes cibles —
-- un carnet qui n'a jamais existé.

-- ---------------------------------------------------------------------------
-- Les tables
-- ---------------------------------------------------------------------------

-- Un carnet par compte. Porte la révision et la dernière opération appliquée.
create table if not exists public.carnet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Entier strictement croissant. N'avance que si séances et cibles forment ensemble
  -- un état complet : un échec partiel ne la fait jamais bouger.
  revision bigint not null default 0,
  -- L'identifiant de la dernière opération appliquée. C'est lui qui rend un réessai
  -- inoffensif après une réponse perdue.
  derniere_operation text,
  updated_at timestamptz not null default now()
);

create table if not exists public.seance (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  contenu jsonb not null,
  -- La révision du carnet à laquelle cette ligne appartient, en enveloppe et non dans
  -- le format d'export : le fichier téléchargé ne doit porter aucun compteur de transport.
  revision_carnet bigint not null,
  primary key (user_id, id)
);

create table if not exists public.cibles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  contenu jsonb not null,
  revision_carnet bigint not null
);

-- ---------------------------------------------------------------------------
-- Les règles d'accès
-- ---------------------------------------------------------------------------
--
-- La clé publishable est **dans le paquet de l'app**, donc lisible par quiconque ouvre
-- les outils du navigateur. Elle n'est pas un secret et ne protège rien. Ce qui protège
-- le carnet d'Ugo, c'est uniquement ce qui suit : chaque ligne appartient à un compte,
-- et personne d'autre ne la voit.

alter table public.carnet enable row level security;
alter table public.seance enable row level security;
alter table public.cibles enable row level security;

create policy "chacun son carnet" on public.carnet
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "chacun ses séances" on public.seance
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "chacun ses cibles" on public.cibles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- L'écriture, atomique et idempotente
-- ---------------------------------------------------------------------------

create or replace function public.appliquer_sauvegarde(
  p_operation text,
  p_revision_attendue bigint,
  p_seances jsonb,
  p_cibles jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_revision bigint;
  v_operation text;
begin
  if v_user is null then
    raise exception 'Aucune session : la sauvegarde exige un compte connecté.'
      using errcode = '42501';
  end if;

  -- Crée le carnet au premier envoi, puis **verrouille la ligne**. Sans ce verrou, deux
  -- appareils lisant la même révision passeraient tous deux le contrôle et le second
  -- écraserait le premier sans que rien ne le signale.
  insert into public.carnet (user_id) values (v_user)
  on conflict (user_id) do nothing;

  select revision, derniere_operation into v_revision, v_operation
  from public.carnet where user_id = v_user for update;

  -- Notre propre envoi, déjà appliqué : la réponse s'était perdue. On ne réapplique pas,
  -- et surtout on n'incrémente pas une seconde fois.
  if v_operation is not null and v_operation = p_operation then
    return jsonb_build_object('applique', false, 'motif', 'deja-applique', 'revision', v_revision);
  end if;

  -- Révision périmée : quelqu'un d'autre a écrit depuis la lecture. Refusée, jamais
  -- appliquée. C'est le contrôle dans la transaction, celui qu'un entier seul ne donne pas.
  if v_revision <> p_revision_attendue then
    return jsonb_build_object('applique', false, 'motif', 'revision-perimee', 'revision', v_revision);
  end if;

  v_revision := v_revision + 1;

  -- Le protocole envoie un instantané complet : le distant devient exactement ce qui a
  -- été figé. Une séance supprimée localement doit disparaître ici aussi, ce qu'un simple
  -- ajout ne ferait pas.
  delete from public.seance where user_id = v_user;
  insert into public.seance (user_id, id, contenu, revision_carnet)
  select v_user, element ->> 'id', element, v_revision
  from jsonb_array_elements(p_seances) as element;

  insert into public.cibles (user_id, contenu, revision_carnet)
  values (v_user, p_cibles, v_revision)
  on conflict (user_id) do update
    set contenu = excluded.contenu, revision_carnet = excluded.revision_carnet;

  update public.carnet
  set revision = v_revision, derniere_operation = p_operation, updated_at = now()
  where user_id = v_user;

  return jsonb_build_object('applique', true, 'motif', 'applique', 'revision', v_revision);
end;
$$;
