#!/usr/bin/env bash
# Veille de coordination entre agents sur Ugo-finance/carnet-de-barre.
# Usage : scripts/veille.sh claude   → signale ce que Codex publie (marqueur <!-- codex -->)
#         scripts/veille.sh codex    → signale ce que Claude publie (marqueur <!-- claude -->)
# Lecture seule via gh. Une ligne par événement nouveau : PR ouverte ou nouvelle tête, revue, commentaire marqué.
set -u
export PATH="$HOME/.local/bin:$PATH"
ME="${1:?agent attendu : claude ou codex}"
case "$ME" in claude) AUTRE=codex ;; codex) AUTRE=claude ;; *) echo "agent inconnu : $ME" >&2; exit 2 ;; esac
REPO="${REPO:-Ugo-finance/carnet-de-barre}"
INTERVALLE="${INTERVALLE:-60}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/carnet-de-barre"
mkdir -p "$STATE_DIR"
STATE="$STATE_DIR/veille-$ME.vus"
touch "$STATE"
MARQUE="<!-- $AUTRE -->"

vu() { grep -qxF "$1" "$STATE"; }
marquer() { echo "$1" >> "$STATE"; }
horodate() { date '+%d.%m.%Y %H:%M:%S'; }
api() { gh api --paginate "$@" 2>>"$STATE_DIR/veille-$ME.err" || { echo "$(horodate) erreur API sur $1" >&2; return 1; }; }

echo "$(horodate) veille $ME armée sur $REPO — signale le marqueur $MARQUE (état : $STATE)"

while true; do
  # 1. PR ouvertes : nouvelle PR ou nouvelle tête (SHA)
  gh pr list --repo "$REPO" --state open --json number,title,headRefName,headRefOid \
    --jq '.[] | "pr\(.number)@\(.headRefOid)\t#\(.number) \(.title) [\(.headRefName)] tête \(.headRefOid[0:10])"' 2>/dev/null \
  | while IFS=$'\t' read -r k msg; do vu "$k" || { marquer "$k"; echo "$(horodate) PR $msg"; }; done

  for n in $(gh pr list --repo "$REPO" --state open --json number --jq '.[].number' 2>/dev/null); do
    # 2. Revues soumises par l'autre agent
    api "repos/$REPO/pulls/$n/reviews" --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "r\(.id)\t#'"$n"' revue \(.state) sur \(.commit_id[0:10])"' \
    | while IFS=$'\t' read -r k msg; do vu "$k" || { marquer "$k"; echo "$(horodate) REVUE $msg"; }; done
    # 3. Commentaires de diff de l'autre agent
    api "repos/$REPO/pulls/$n/comments" --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "d\(.id)@\(.updated_at)\t#'"$n"' \(.path):\(.line // .original_line // "?") — \(.body | split("\n")[0] | .[0:100])"' \
    | while IFS=$'\t' read -r k msg; do vu "$k" || { marquer "$k"; echo "$(horodate) DIFF $msg"; }; done
  done

  # 4. Commentaires de conversation (PR et issues) de l'autre agent, y compris édités
  api "repos/$REPO/issues/comments?per_page=100&sort=updated&direction=desc" \
    --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "c\(.id)@\(.updated_at)\t\(.issue_url | split("/") | last | "#" + .) — \(.body | split("\n")[0] | .[0:110])"' \
  | while IFS=$'\t' read -r k msg; do vu "$k" || { marquer "$k"; echo "$(horodate) COMMENTAIRE $msg"; }; done

  sleep "$INTERVALLE"
done
