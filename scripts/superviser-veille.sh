#!/usr/bin/env bash
# Superviseur de la veille de coordination — CB-08.
#
# Usage : scripts/superviser-veille.sh claude
#
# La veille est morte trois fois le 13.09.2026. La troisième fois, un verdict de
# Codex est resté vingt-six minutes sans lecteur, et c'est Ugo qui a dû demander
# pourquoi le projet n'avançait plus.
#
# Ce que la veille sait déjà faire, et qu'il ne faut pas refaire ici :
#
# - elle **alarme** pendant une panne réseau au lieu de se taire (CB-06) ;
# - elle **rattrape** les événements manqués au redémarrage, parce que son état ne
#   contient que ce qu'elle a réellement signalé. Vérifié : trois secondes après un
#   armement, elle a rejoué les trois verdicts publiés pendant son arrêt.
#
# Le défaut restant n'est donc ni le silence ni la perte : c'est que **rien ne la
# relance**. D'où ce fichier.
#
# La boucle vit à l'extérieur de `veille.sh` délibérément : une mort par erreur
# d'interprétation bash ne se rattraperait pas depuis l'intérieur du script mort.
#
# Et ceci ne remplace pas d'aller voir GitHub. L'état GitHub fait autorité ; une
# veille supervisée reste un confort.
set -u
ME="${1:?agent attendu : claude ou codex}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ATTENTE="${ATTENTE:-5}"

horodate() { date '+%d.%m.%Y %H:%M:%S'; }

# Un arrêt n'est jamais anodin : c'est une fenêtre pendant laquelle l'état GitHub
# n'était pas observé. Le message le dit, avec le code de sortie, et il n'est jamais
# filtré — contrairement aux événements, il n'a pas d'état « déjà vu ».
echo "$(horodate) superviseur $ME armé — relance la veille tant qu'on ne l'arrête pas"

while true; do
  bash "$RACINE/scripts/veille.sh" "$ME"
  code=$?
  echo "$(horodate) VEILLE ARRETEE (code $code) — relance dans ${ATTENTE} s. Les événements de cette fenêtre seront rejoués, mais l'état GitHub n'a pas été observé pendant ce temps."
  sleep "$ATTENTE"
done
