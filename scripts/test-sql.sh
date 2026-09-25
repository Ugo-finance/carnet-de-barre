#!/usr/bin/env bash
# Les garanties du schéma distant, vérifiées contre un vrai Postgres — CB-79c.
#
# **La base est remise à neuf depuis les migrations avant chaque exécution**, et c'est le
# point le plus important de ce script. Une première version se contentait de copier les
# assertions dans le conteneur : elle testait donc le schéma *déjà chargé*, pas celui du
# fichier. Codex l'a montré en cassant le contrôle de révision dans la migration — la
# commande restait verte. Un banc d'essai qui ne charge pas ce qu'il prétend tester ne
# prouve rien, et donne l'assurance du contraire.
#
# Hors de `npm run check` délibérément : ces tests exigent Docker et la pile locale, que
# la CI n'a pas. Les y mettre apprendrait à ignorer un rouge.
set -euo pipefail

CONTENEUR=supabase_db_carnet-de-barre
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTENEUR}$"; then
  echo "La base locale n'est pas démarrée. Lance : npx supabase start" >&2
  exit 1
fi

echo "→ remise à neuf depuis les migrations"
(cd "${RACINE}" && npx --no-install supabase db reset --local --no-seed >/dev/null)

echo "→ assertions sur une connexion"
docker cp "${RACINE}/supabase/tests/carnet.sql" "${CONTENEUR}:/tmp/carnet.sql" >/dev/null
docker exec "${CONTENEUR}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/carnet.sql

echo "→ scénarios à deux connexions"
bash "${RACINE}/scripts/test-sql-concurrence.sh"

echo "Schéma distant : toutes les garanties tiennent."
