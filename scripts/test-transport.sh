#!/usr/bin/env bash
# Le transport contre la pile Supabase **locale** — CB-79d.
#
# Les adresses et clés viennent de `supabase status`, à l'exécution, et ne sont écrites
# nulle part. Ce sont celles de la pile locale ; le test refuse lui-même toute autre cible.
set -euo pipefail
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${RACINE}"

if ! docker ps --format '{{.Names}}' | grep -q '^supabase_db_carnet-de-barre$'; then
  echo "La pile locale n'est pas démarrée. Lance : npx --no-install supabase start" >&2
  exit 1
fi

echo "→ remise à neuf depuis les migrations"
npx --no-install supabase db reset --local --no-seed >/dev/null

etat="$(npx --no-install supabase status -o env 2>/dev/null)"
SUPABASE_LOCAL_URL="$(grep -E '^API_URL=' <<<"${etat}" | cut -d= -f2- | tr -d '"')"
SUPABASE_LOCAL_ANON="$(grep -E '^(PUBLISHABLE_KEY|ANON_KEY)=' <<<"${etat}" | head -1 | cut -d= -f2- | tr -d '"')"
export SUPABASE_LOCAL_URL SUPABASE_LOCAL_ANON

echo "→ transport contre ${SUPABASE_LOCAL_URL}"
npx vitest run --config vitest.integration.config.ts
