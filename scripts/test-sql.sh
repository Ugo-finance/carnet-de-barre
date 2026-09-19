#!/usr/bin/env bash
# Les garanties du schéma distant, vérifiées contre un vrai Postgres — CB-79c.
#
# Hors de `npm run check` **délibérément** : ces tests exigent Docker et la pile Supabase
# locale, que la CI n'a pas. Les y mettre apprendrait à ignorer un rouge.
set -euo pipefail

CONTENEUR=supabase_db_carnet-de-barre

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTENEUR}$"; then
  echo "La base locale n'est pas démarrée. Lance : npx supabase start" >&2
  exit 1
fi

docker cp supabase/tests/carnet.sql "${CONTENEUR}:/tmp/carnet.sql" >/dev/null
docker exec "${CONTENEUR}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/carnet.sql
echo "Schéma distant : toutes les garanties tiennent."
