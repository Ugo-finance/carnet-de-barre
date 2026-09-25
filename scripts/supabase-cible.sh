#!/usr/bin/env bash
# Refuser toute opération distante qui ne vise pas le projet du carnet — CB-79c.
#
# Consigne d'Ugo le 25.09 : « fais gaffe à pas écrire sur l'autre projet Supabase ».
# L'autre projet est Portail Paie, la base de paie d'un cabinet fiduciaire. Une migration
# poussée au mauvais endroit y écrirait sans bruit, et rien dans la commande ne le
# signalerait : `supabase db push` pousse vers la ref liée, quelle qu'elle soit.
#
# Trois contrôles, et le premier qui échoue arrête tout :
#
# 1. **on est bien dans ce dépôt** — un `db push` lancé depuis `portail-paie-fg-fv`
#    partirait avec la ref de Portail Paie ;
# 2. **la ref liée est celle du carnet** — `supabase link` l'écrit dans
#    `supabase/.temp/project-ref`, et un lien refait à la main pourrait la changer ;
# 3. **l'URL de l'app vise la même ref** — sinon l'app et le schéma parleraient à deux
#    projets différents.
#
# La ref attendue est écrite ici, en clair, et nulle part ailleurs. Elle n'est pas un
# secret : c'est un identifiant de projet, présent dans l'URL publique de l'API.
set -euo pipefail

ATTENDUE=rtxdtiysrdgzsomatwon
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

refus() { echo "REFUS : $1" >&2; echo "Rien n'a été envoyé." >&2; exit 1; }

nom="$(node -p "require('${RACINE}/package.json').name" 2>/dev/null || echo inconnu)"
[[ "${nom}" == "carnet-de-barre" ]] || refus "ce dépôt s'appelle « ${nom} », pas carnet-de-barre."

fichier_ref="${RACINE}/supabase/.temp/project-ref"
[[ -f "${fichier_ref}" ]] || refus "aucun projet lié. Lance : npx supabase link --project-ref ${ATTENDUE}"
liee="$(tr -d '[:space:]' < "${fichier_ref}")"
[[ "${liee}" == "${ATTENDUE}" ]] || refus "le projet lié est « ${liee} », pas celui du carnet (${ATTENDUE})."

if [[ -f "${RACINE}/.env" ]]; then
  url="$(grep -E '^VITE_SUPABASE_URL=' "${RACINE}/.env" | cut -d= -f2- || true)"
  [[ -z "${url}" || "${url}" == "https://${ATTENDUE}.supabase.co" ]] ||
    refus "l'app vise « ${url} », pas le projet du carnet."
fi

echo "Cible vérifiée : carnet-de-barre · ${ATTENDUE}"
