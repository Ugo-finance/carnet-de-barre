-- Ce que le schéma distant doit garantir — CB-79c.
--
-- Exécuté contre un vrai Postgres, sur une base remise à neuf depuis les migrations.
-- Chaque bloc lève si la propriété n'est pas tenue : un script qui va au bout est vert.
--
-- L'identité est posée comme le fait PostgREST — `request.jwt.claims` porte le `sub` — et
-- **le rôle est réellement pris**. C'est indispensable depuis que la protection ne repose
-- plus seulement sur les politiques de ligne mais aussi sur les droits : rester `postgres`
-- testerait un monde où tout est permis.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ugo@example.test', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autre@example.test', '', now(), now());

-- `is not true`, et non `not` : une condition **nulle** n'est pas fausse, donc `if not`
-- ne s'y déclenche pas. Le piège est le même que celui du P1-1 — `revision <> null` vaut
-- `null` — mais il était ici dans le harnais de test, ce qui est pire : une assertion sur
-- une colonne non renseignée passait au vert. Une mutation retirant l'écriture de
-- `schema_version` ne faisait rougir personne.
create or replace function pg_temp.exiger(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'ÉCHEC : %', p_message; end if;
end $$;

create or replace function pg_temp.claims(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- Le parcours nominal
-- ---------------------------------------------------------------------------
select pg_temp.claims('11111111-1111-1111-1111-111111111111');
set local role authenticated;

do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:1', 0, 2, 'iphone-15-pro',
    '[{"id":"s1","date":"2026-09-15","type":"A"}]'::jsonb, '{"squat":{"w":77.5}}'::jsonb);
  perform pg_temp.exiger((r ->> 'applique')::boolean, 'le premier envoi doit être appliqué');
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'la première révision doit être 1');
end $$;

-- L'enveloppe, exigée par le contrat : sans elle une restauration inventerait la version.
do $$
begin
  perform pg_temp.exiger((select schema_version from public.carnet) = 2,
    'le carnet doit retenir la version du format sauvegardé');
  perform pg_temp.exiger((select ecrit_par from public.carnet) = 'iphone-15-pro',
    'le carnet doit dire quel appareil a écrit');
  perform pg_temp.exiger((select ecrit_le from public.carnet) is not null,
    'le carnet doit dire quand');
  perform pg_temp.exiger((select operation from public.seance where id = 's1') = 'iphone:1',
    'chaque séance porte l’opération qui l’a posée');
  perform pg_temp.exiger((select ecrit_par from public.cibles) = 'iphone-15-pro',
    'les cibles portent la même enveloppe');
end $$;

-- Idempotence.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:1', 0, 2, 'iphone-15-pro', '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger(r ->> 'motif' = 'deja-applique', 'un réessai ne doit pas réappliquer');
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'la révision ne doit pas bouger');
  perform pg_temp.exiger((select count(*) from public.seance) = 1,
    'un réessai ne doit pas écraser les séances par son corps vide');
end $$;

-- Révision périmée.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:2', 0, 2, 'iphone-15-pro', '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger(r ->> 'motif' = 'revision-perimee', 'une révision périmée doit être refusée');
  perform pg_temp.exiger((select count(*) from public.seance) = 1, 'un refus n’écrit rien');
end $$;

-- L'instantané remplace, il n'ajoute pas.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:2', 1, 2, 'iphone-15-pro',
    '[{"id":"s2","date":"2026-09-17","type":"B"}]'::jsonb, '{"squat":{"w":80}}'::jsonb);
  perform pg_temp.exiger((r ->> 'revision')::bigint = 2, 'la révision doit avancer à 2');
  perform pg_temp.exiger((select count(*) from public.seance where id = 's1') = 0,
    'une séance supprimée localement doit disparaître ici');
  perform pg_temp.exiger((select revision_carnet from public.cibles) = 2,
    'les cibles portent la révision du carnet');
end $$;

-- ---------------------------------------------------------------------------
-- Les paramètres absents, qui faisaient s'évaporer les gardes
-- ---------------------------------------------------------------------------
--
-- En SQL, `revision <> null` vaut `null`, donc le `if` ne se déclenche pas : une révision
-- absente **traversait** le contrôle de concurrence et l'écriture s'appliquait. Une
-- opération absente désactivait de même l'idempotence. P1 de Codex, reproduit chez lui.

create or replace function pg_temp.refuse(p_appel text, p_attendu text) returns void language plpgsql as $$
declare v_message text := '';
begin
  begin
    execute p_appel;
  exception when others then v_message := sqlerrm;
  end;
  perform pg_temp.exiger(v_message <> '', 'aucun refus pour : ' || p_appel);
  perform pg_temp.exiger(v_message like '%' || p_attendu || '%',
    'refus au mauvais motif pour ' || p_appel || ' : ' || v_message);
end $$;

do $$
declare v_avant bigint := (select revision from public.carnet);
begin
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:1', null, 2, 'iphone', '[]'::jsonb, '{}'::jsonb)$q$,
    'Révision attendue absente');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde(null, 2, 2, 'iphone', '[]'::jsonb, '{}'::jsonb)$q$,
    'Opération absente');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('   ', 2, 2, 'iphone', '[]'::jsonb, '{}'::jsonb)$q$,
    'Opération absente');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:2', 2, null, 'iphone', '[]'::jsonb, '{}'::jsonb)$q$,
    'Version de schéma absente');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:3', 2, 2, null, '[]'::jsonb, '{}'::jsonb)$q$,
    'Appareil absent');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:4', 2, 2, 'iphone', null, '{}'::jsonb)$q$,
    'Séances absentes');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:5', 2, 2, 'iphone', '{}'::jsonb, '{}'::jsonb)$q$,
    'Séances absentes');
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('neuve:6', 2, 2, 'iphone', '[]'::jsonb, '[]'::jsonb)$q$,
    'Cibles absentes');

  perform pg_temp.exiger((select revision from public.carnet) = v_avant,
    'aucun de ces refus ne doit avoir écrit');
end $$;

-- ---------------------------------------------------------------------------
-- Aucune écriture directe : la fonction est le seul chemin
-- ---------------------------------------------------------------------------
--
-- Le P1 le plus lourd. Avec des droits d'écriture directs, l'atomicité, la révision et
-- l'idempotence ne sont pas des invariants du schéma : elles ne tiennent que tant que le
-- client veut bien passer par la fonction. Or le client, ici, c'est le monde entier.

do $$
begin
  perform pg_temp.refuse(
    $q$insert into public.seance (user_id, id, contenu, revision_carnet, operation, ecrit_par, ecrit_le)
       values (auth.uid(), 'directe', '{}'::jsonb, 999, 'x', 'x', now())$q$,
    'permission denied');
  perform pg_temp.refuse(
    $q$update public.carnet set revision = 999$q$, 'permission denied');
  perform pg_temp.refuse(
    $q$delete from public.seance$q$, 'permission denied');
  perform pg_temp.refuse(
    $q$update public.cibles set contenu = '{}'::jsonb$q$, 'permission denied');

  perform pg_temp.exiger((select revision from public.carnet) = 2,
    'aucune écriture directe ne doit avoir abouti');
  perform pg_temp.exiger((select count(*) from public.seance) = 1,
    'et l’historique est intact');
end $$;

-- La lecture, elle, reste permise : l'app doit pouvoir comparer avant de restaurer.
do $$
begin
  perform pg_temp.exiger((select count(*) from public.seance) = 1, 'lire ses séances reste permis');
end $$;

-- ---------------------------------------------------------------------------
-- L'isolation entre comptes
-- ---------------------------------------------------------------------------
select pg_temp.claims('22222222-2222-2222-2222-222222222222');

do $$
begin
  perform pg_temp.exiger((select count(*) from public.seance) = 0, 'un autre compte ne voit aucune séance');
  perform pg_temp.exiger((select count(*) from public.cibles) = 0, 'un autre compte ne voit aucune cible');
  perform pg_temp.exiger((select count(*) from public.carnet) = 0, 'un autre compte ne voit aucun carnet');
end $$;

do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('macbook:1', 0, 2, 'macbook', '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'chaque compte a sa propre révision');
end $$;

select pg_temp.claims('11111111-1111-1111-1111-111111111111');
do $$
begin
  perform pg_temp.exiger((select revision from public.carnet) = 2,
    'le carnet d’Ugo est intact après le passage de l’autre compte');
  perform pg_temp.exiger((select count(*) from public.seance) = 1, 'et ses séances aussi');
end $$;

-- ---------------------------------------------------------------------------
-- Sans session, rien ne passe — et avec le bon message
-- ---------------------------------------------------------------------------
--
-- Vérifier « une erreur quelconque » ne prouvait rien : sans session, l'écriture tombe de
-- toute façon. Ce qui distingue, c'est le message. Un refus explicite se lit dans l'app ;
-- une violation de contrainte s'affiche comme une panne et envoie chercher ailleurs.
do $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform pg_temp.refuse(
    $q$select public.appliquer_sauvegarde('anonyme:1', 0, 2, 'inconnu', '[]'::jsonb, '{}'::jsonb)$q$,
    'Aucune session');
end $$;

rollback;
