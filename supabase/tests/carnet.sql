-- Ce que le schéma distant doit garantir — CB-79c.
--
-- Exécuté contre un vrai Postgres, pas contre une intention. Chaque bloc lève si la
-- propriété n'est pas tenue, donc un script qui va au bout est un script vert.
--
-- L'identité est simulée comme le fait PostgREST : `request.jwt.claims` porte le `sub`,
-- et `auth.uid()` le lit. C'est le mécanisme réel, pas un contournement des règles.

begin;

-- Deux comptes : Ugo, et quelqu'un d'autre.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ugo@example.test', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autre@example.test', '', now(), now());

create or replace function pg_temp.devenir(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.exiger(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if not p_condition then raise exception 'ÉCHEC : %', p_message; end if;
end $$;

-- ---------------------------------------------------------------------------
select pg_temp.devenir('11111111-1111-1111-1111-111111111111');

-- Premier envoi : le carnet n'existe pas encore, la révision part de 0.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde(
    'iphone:1', 0,
    '[{"id":"s1","date":"2026-09-15","type":"A"}]'::jsonb,
    '{"squat":{"w":77.5}}'::jsonb);
  perform pg_temp.exiger((r ->> 'applique')::boolean, 'le premier envoi doit être appliqué');
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'la première révision doit être 1');
end $$;

-- Idempotence : la même opération rejouée n'incrémente pas une seconde fois.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:1', 0, '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger(not (r ->> 'applique')::boolean, 'un réessai ne doit pas réappliquer');
  perform pg_temp.exiger(r ->> 'motif' = 'deja-applique', 'le motif doit dire déjà appliqué');
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'la révision ne doit pas bouger');
  perform pg_temp.exiger(
    (select count(*) from public.seance) = 1,
    'un réessai ne doit pas écraser les séances par son corps vide');
end $$;

-- Révision périmée : refusée, jamais appliquée.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('iphone:2', 0, '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger(not (r ->> 'applique')::boolean, 'une révision périmée doit être refusée');
  perform pg_temp.exiger(r ->> 'motif' = 'revision-perimee', 'le motif doit dire révision périmée');
  perform pg_temp.exiger((select count(*) from public.seance) = 1, 'un refus n’écrit rien');
end $$;

-- Envoi suivant : la révision attendue est la bonne, et l'instantané remplace vraiment.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde(
    'iphone:2', 1,
    '[{"id":"s2","date":"2026-09-17","type":"B"}]'::jsonb,
    '{"squat":{"w":80}}'::jsonb);
  perform pg_temp.exiger((r ->> 'applique')::boolean, 'un envoi à jour doit passer');
  perform pg_temp.exiger((r ->> 'revision')::bigint = 2, 'la révision doit avancer à 2');
  -- Une séance supprimée localement doit disparaître ici : un simple ajout la laisserait.
  perform pg_temp.exiger(
    (select count(*) from public.seance where id = 's1') = 0,
    'l’instantané remplace, il n’ajoute pas');
  perform pg_temp.exiger(
    (select contenu ->> 'squat' from public.cibles) is not null, 'les cibles doivent suivre');
  perform pg_temp.exiger(
    (select revision_carnet from public.cibles) = 2, 'les cibles portent la révision du carnet');
end $$;

-- ---------------------------------------------------------------------------
-- L'isolation : c'est elle, et pas la clé, qui protège le carnet.
select pg_temp.devenir('22222222-2222-2222-2222-222222222222');

do $$
begin
  perform pg_temp.exiger((select count(*) from public.seance) = 0, 'un autre compte ne voit aucune séance');
  perform pg_temp.exiger((select count(*) from public.cibles) = 0, 'un autre compte ne voit aucune cible');
  perform pg_temp.exiger((select count(*) from public.carnet) = 0, 'un autre compte ne voit aucun carnet');
end $$;

-- Il a son propre carnet, qui repart de zéro sans toucher à celui d'Ugo.
do $$
declare r jsonb;
begin
  r := public.appliquer_sauvegarde('macbook:1', 0, '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.exiger((r ->> 'revision')::bigint = 1, 'chaque compte a sa propre révision');
end $$;

-- Et il ne peut pas s'attribuer une ligne d'Ugo.
do $$
declare v_erreur boolean := false;
begin
  begin
    insert into public.seance (user_id, id, contenu, revision_carnet)
    values ('11111111-1111-1111-1111-111111111111', 'volée', '{}'::jsonb, 1);
  exception when others then v_erreur := true;
  end;
  perform pg_temp.exiger(v_erreur, 'écrire sous l’identifiant d’un autre doit être refusé');
end $$;

select pg_temp.devenir('11111111-1111-1111-1111-111111111111');
do $$
begin
  perform pg_temp.exiger((select revision from public.carnet) = 2,
    'le carnet d’Ugo est intact après le passage de l’autre compte');
  perform pg_temp.exiger((select count(*) from public.seance) = 1,
    'et ses séances aussi');
end $$;

-- ---------------------------------------------------------------------------
-- Sans session, rien ne passe — et **avec le bon message**.
--
-- Vérifier « une erreur quelconque » ne prouvait rien : sans session, l'insertion tombe
-- de toute façon sur une contrainte, donc le test passait même le garde retiré. Ce qui
-- distingue, c'est le message : un refus explicite se lit dans l'app, une violation de
-- contrainte s'affiche comme une panne de stockage et envoie chercher au mauvais endroit.
do $$
declare v_message text := '';
begin
  perform set_config('request.jwt.claims', null, true);
  begin
    perform public.appliquer_sauvegarde('anonyme:1', 0, '[]'::jsonb, '{}'::jsonb);
  exception when others then v_message := sqlerrm;
  end;
  perform pg_temp.exiger(v_message <> '', 'sans session, la sauvegarde doit être refusée');
  perform pg_temp.exiger(
    v_message like '%Aucune session%',
    'le refus doit dire qu''il manque une session, pas tomber sur une contrainte : ' || v_message);
end $$;

rollback;
