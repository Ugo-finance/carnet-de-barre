#!/usr/bin/env bash
# Ce qu'une seule connexion ne peut pas prouver — CB-79c.
#
# Deux propriétés du schéma ne se voient qu'en faisant **concourir deux sessions** :
#
# - le verrou de ligne. Retirer `for update` laissait toute la suite verte, parce
#   qu'aucune assertion ne partait de deux connexions sur la même révision. P1 de Codex,
#   fondé : un garde que personne ne peut faire rougir n'est pas un garde ;
# - le retour en arrière complet quand l'écriture échoue **après** la suppression des
#   séances. Une transaction partiellement appliquée laisserait un carnet amputé.
set -euo pipefail

CONTENEUR=supabase_db_carnet-de-barre
UGO=11111111-1111-1111-1111-111111111111

sql() { docker exec -i "${CONTENEUR}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq "$@"; }

echo "  · préparation"
sql -c "
delete from auth.users where id = '${UGO}';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${UGO}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'concurrence@example.test', '', now(), now());
" >/dev/null

# ---------------------------------------------------------------------------
# 1. Deux envois partis de la même révision : un seul doit passer.
# ---------------------------------------------------------------------------
echo "  · deux appareils sur la même révision"

# **Le carnet doit exister avant que les deux partent**, et ce détail décide de ce que le
# test prouve. Une première version laissait A le créer : les deux sessions se
# sérialisaient alors sur l'insertion de la ligne, pas sur le verrou, et retirer
# `for update` laissait le test vert. Il mesurait une sérialisation réelle, mais pas
# celle qu'il prétendait mesurer.
sql <<SQL >/dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${UGO}","role":"authenticated"}', true);
select public.appliquer_sauvegarde('amorce:1', 0, 2, 'amorce', '[]'::jsonb, '{}'::jsonb);
commit;
SQL

envoi() { # $1 = opération, $2 = pause avant commit
  sql <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${UGO}","role":"authenticated"}', true);
select clock_timestamp() || ' debut $1';
select public.appliquer_sauvegarde('$1', 1, 2, 'appareil-$1',
  '[{"id":"de-$1","date":"2026-09-19"}]'::jsonb, '{"marque":"$1"}'::jsonb) ->> 'motif';
select pg_sleep($2);
select clock_timestamp() || ' commit $1';
commit;
SQL
}

# A ouvre, applique, et garde sa transaction ouverte deux secondes. B part pendant ce
# temps, depuis la même révision 1. Avec le verrou, B attend puis constate que la révision
# a changé. Sans lui, B lit encore 1, passe le contrôle, et applique aussi : les deux
# réussissent, et l'écriture de A est perdue en silence.
# Marges larges : `docker exec` met près d'une seconde à ouvrir une connexion, et une
# course trop serrée faisait démarrer B **après** le commit de A. Le test passait alors
# sans jamais mettre deux sessions en concurrence — il mesurait une attente, pas un verrou.
envoi 'A:2' 6 > /tmp/concurrence-a.txt 2>&1 &
pid_a=$!
sleep 3
envoi 'B:2' 0 > /tmp/concurrence-b.txt 2>&1 || true
wait ${pid_a} 2>/dev/null || true

# Ce qui distingue n'est **pas** la révision finale : dans les deux cas elle vaut 2,
# puisque les deux partent de 1 et ajoutent un. Ce qui distingue, c'est le nombre
# d'envois qui se croient appliqués.
reussites=0
grep -qx 'applique' /tmp/concurrence-a.txt && reussites=$((reussites + 1))
grep -qx 'applique' /tmp/concurrence-b.txt && reussites=$((reussites + 1))

if [[ "${reussites}" -ne 1 ]]; then
  echo "ÉCHEC : ${reussites} envois se croient appliqués depuis la même révision, il en faut exactement un." >&2
  echo "  A : $(tr '\n' ' ' < /tmp/concurrence-a.txt)" >&2
  echo "  B : $(tr '\n' ' ' < /tmp/concurrence-b.txt)" >&2
  exit 1
fi

revision="$(sql -c "select revision from public.carnet where user_id = '${UGO}';")"
retenue="$(sql -c "select derniere_operation from public.carnet where user_id = '${UGO}';")"
# L'état doit être cohérent : la séance présente est celle de l'envoi retenu, pas celle
# du perdant restée en place.
seance="$(sql -c "select string_agg(id, ',') from public.seance where user_id = '${UGO}';")"
if [[ "${seance}" != "de-${retenue}" ]]; then
  echo "ÉCHEC : le carnet retient l'opération ${retenue} mais contient la séance ${seance}." >&2
  exit 1
fi
echo "    révision ${revision}, retenue : ${retenue}, un seul appliqué"

# ---------------------------------------------------------------------------
# 2. Une écriture qui échoue en plein milieu ne laisse rien derrière elle.
# ---------------------------------------------------------------------------
echo "  · panne entre la suppression des séances et leur réécriture"

sql <<SQL >/dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${UGO}","role":"authenticated"}', true);
select public.appliquer_sauvegarde('prep:1', ${revision}, 2, 'iphone',
  '[{"id":"s1","date":"2026-09-15"},{"id":"s2","date":"2026-09-17"}]'::jsonb, '{"squat":1}'::jsonb);
commit;
SQL

avant="$(sql -c "select count(*) from public.seance where user_id = '${UGO}';")"
revision_avant="$(sql -c "select revision from public.carnet where user_id = '${UGO}';")"

# Une séance sans `id` viole la clé primaire **après** que les anciennes ont été
# supprimées. Si la transaction ne revenait pas en arrière, le carnet serait vidé.
set +e
sql <<SQL >/dev/null 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${UGO}","role":"authenticated"}', true);
select public.appliquer_sauvegarde('panne:1', ${revision_avant}, 2, 'iphone',
  '[{"date":"2026-09-19"}]'::jsonb, '{"squat":2}'::jsonb);
commit;
SQL
code=$?
set -e

if [[ ${code} -eq 0 ]]; then
  echo "ÉCHEC : une séance sans identifiant a été acceptée." >&2
  exit 1
fi

apres="$(sql -c "select count(*) from public.seance where user_id = '${UGO}';")"
revision_apres="$(sql -c "select revision from public.carnet where user_id = '${UGO}';")"

if [[ "${apres}" != "${avant}" ]]; then
  echo "ÉCHEC : ${avant} séances avant la panne, ${apres} après — la suppression a survécu au rollback." >&2
  exit 1
fi
if [[ "${revision_apres}" != "${revision_avant}" ]]; then
  echo "ÉCHEC : la révision a avancé malgré l'échec (${revision_avant} → ${revision_apres})." >&2
  exit 1
fi
echo "    ${apres} séances intactes, révision toujours ${revision_apres}"

sql -c "delete from auth.users where id = '${UGO}';" >/dev/null
