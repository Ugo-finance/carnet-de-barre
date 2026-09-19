#!/usr/bin/env bash
# Libérer un port **sans jamais tuer le travail de quelqu'un d'autre** — CB-81.
#
# Remplace `fuser -k <port>/tcp`, qui tue ce qu'il trouve sans regarder à qui c'est. Sur
# cette machine tournent au moins trois choses : ce dépôt, le worktree de Codex sur le
# même projet, et Portail Paie avec sa pile Supabase. Un `fuser -k` au mauvais moment
# interrompt la suite de tests d'un autre agent, et l'échec ressemble alors à un test
# instable plutôt qu'à un conflit.
#
# **Deux questions distinctes, et les confondre a produit un défaut.** Une première
# version demandait « quel processus tient ce port ? » et concluait « libre » quand elle
# n'en trouvait pas. Or un port publié par Docker n'expose pas son pid à un utilisateur
# ordinaire : le port était occupé, le script disait libre, et l'appelant allait se
# heurter à une erreur de liaison sans comprendre pourquoi.
#
# On demande donc d'abord **le port est-il pris ?**, ensuite seulement **par qui ?**. Un
# port pris dont on ne peut pas identifier le propriétaire est intouchable.
set -euo pipefail

PORT="${1:?usage: liberer-port.sh <port>}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. Le port est-il pris ? Sans `-p`, donc sans dépendre des permissions.
if [[ -z "$(ss -ltnH "sport = :${PORT}" 2>/dev/null)" ]]; then
  echo "Port ${PORT} libre."
  exit 0
fi

# 2. Pris. Par qui, si on peut le savoir ?
occupants="$(ss -ltnpH "sport = :${PORT}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)"

if [[ -z "${occupants}" ]]; then
  echo "REFUS : le port ${PORT} est occupé par un processus que je ne peux pas identifier." >&2
  echo "  C'est typiquement un conteneur Docker, dont le port est publié par root." >&2
  echo "  Rien n'a été tué. Arrête-le depuis le projet à qui il appartient." >&2
  exit 1
fi

refus=0
for pid in ${occupants}; do
  # Le répertoire de travail du processus dit de quel dépôt il vient. Un lien illisible
  # compte comme inconnu, donc comme intouchable : dans le doute, on ne tue pas.
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || echo inconnu)"
  commande="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null | cut -c1-80 || echo inconnue)"

  if [[ "${cwd}" == "${RACINE}" || "${cwd}" == "${RACINE}/"* ]]; then
    echo "Port ${PORT} : pid ${pid} vient d'ici (${cwd}), arrêt."
    kill "${pid}" 2>/dev/null || true
  else
    echo "REFUS : le port ${PORT} est tenu par le pid ${pid}, qui n'est pas d'ici." >&2
    echo "  répertoire : ${cwd}" >&2
    echo "  commande   : ${commande}" >&2
    refus=1
  fi
done

[[ "${refus}" -eq 0 ]] || { echo "" >&2; echo "Rien n'a été tué hors de ce dépôt." >&2; exit 1; }
