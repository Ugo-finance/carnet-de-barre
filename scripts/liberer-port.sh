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

# Un entier entre 1 et 65535, et rien d'autre. P2 de Codex : `liberer-port.sh abc`
# répondait « Port abc libre. » avec le code 0, parce que `ss` rejetait le filtre en
# silence et qu'une réponse vide se lisait comme un port libre. Un filtre invalide ou
# élargi ne doit jamais pouvoir passer pour une vérification réussie.
if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "REFUS : « ${PORT} » n'est pas un numéro de port (1 à 65535)." >&2
  exit 2
fi

# Attend que le port cesse d'écouter, au plus deux secondes.
#
# P2 de Codex : le script sortait avec le code 0 juste après `kill`, alors que le port
# écoutait encore — un signal envoyé n'est pas un processus arrêté. Une commande
# enchaînée échouait alors de façon intermittente, ce qui ressemble à un test instable.
attendre_liberation() {
  for _ in $(seq 1 20); do
    [[ -z "$(ss -ltnH "sport = :${PORT}" 2>/dev/null)" ]] && return 0
    sleep 0.1
  done
  return 1
}

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
if ! attendre_liberation; then
  echo "ÉCHEC : le port ${PORT} écoute encore deux secondes après l'arrêt demandé." >&2
  exit 1
fi
echo "Port ${PORT} libéré."

