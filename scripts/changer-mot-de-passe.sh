#!/usr/bin/env bash
# Changer le mot de passe du compte de sauvegarde, sans e-mail — CB-87.
#
# Sans SMTP, Supabase ne peut pas envoyer de lien de réinitialisation. Ce script appelle
# l'API d'administration Auth (`PUT /auth/v1/admin/users/<UID>`, l'équivalent HTTP de
# `auth.admin.updateUserById`). Ugo le lance lui-même, depuis son terminal.
#
# Les deux secrets (clé `sb_secret_…` et nouveau mot de passe) ne passent **jamais** par
# les arguments d'un processus : `ps` et `/proc/<pid>/cmdline` les montreraient pendant la
# requête. Ils ne vont pas non plus dans l'environnement, un fichier ou l'historique. `read`
# et `printf` sont des commandes internes de Bash, sans processus. `curl` lit en-tête et
# corps dans sa configuration, sur son entrée standard (`-K -`).
#
# La ref du projet est écrite ici, en clair, comme dans `supabase-cible.sh`.
set -euo pipefail

ATTENDUE=rtxdtiysrdgzsomatwon
BASE="https://${ATTENDUE}.supabase.co"

refus() { echo "REFUS : $1" >&2; echo "Rien n'a été envoyé." >&2; exit 1; }

read -rp "UID du compte (Authentication → Users) : " uid
[[ "${uid}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] ||
  refus "ce n'est pas un UID."

read -rsp "Clé secrète sb_secret_… (masquée) : " cle; echo
[[ "${cle}" =~ ^sb_secret_[A-Za-z0-9_-]+$ ]] || refus "ce n'est pas une clé sb_secret_…."

read -rsp "Nouveau mot de passe (masqué) : " mdp; echo
read -rsp "Le même, une seconde fois : " mdp2; echo
[[ "${mdp}" == "${mdp2}" ]] || refus "les deux saisies diffèrent."
unset mdp2
[[ ${#mdp} -ge 12 ]] || refus "moins de 12 caractères."
# Le mot de passe est placé dans une chaîne JSON, elle-même dans une chaîne de la
# configuration curl : les guillemets, barres obliques inverses et caractères de contrôle
# y changeraient de sens.
[[ "${mdp}" != *'"'* && "${mdp}" != *'\'* && "${mdp}" != *[[:cntrl:]]* ]] ||
  refus "le mot de passe ne doit contenir ni \", ni \\, ni caractère de contrôle."

code="$(
  printf 'header = "apikey: %s"\nheader = "Content-Type: application/json"\ndata = "{\\"password\\": \\"%s\\"}"\n' \
    "${cle}" "${mdp}" |
    curl -sS -X PUT "${BASE}/auth/v1/admin/users/${uid}" -K - -o /dev/null -w '%{http_code}'
)" || code="échec réseau"
unset cle mdp

case "${code}" in
  200) echo "Mot de passe changé." ;;
  "échec réseau" | 000)
    echo "Aucune réponse reçue : le changement n'est pas confirmé." >&2
    echo "Relancer le script avec le même mot de passe." >&2
    exit 1 ;;
  *) echo "Refusé par Supabase (HTTP ${code}). Rien n'a changé." >&2; exit 1 ;;
esac
