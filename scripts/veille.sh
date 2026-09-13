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

# Une panne ne doit jamais ressembler à du calme, ni à de l'activité.
#
# Le 13.09 au matin, une coupure reseau a fait ecrire le message d'erreur *dans le
# flux de sortie* : il a ete lu comme une cle d'evenement, inscrit dans l'etat, et
# sept notifications vides sont parties. Pire, la cle etant desormais « vue », toute
# panne suivante serait devenue silencieuse.
#
# Les appels n'ecrivent donc plus rien sur la sortie standard en cas d'echec : ils
# rendent un code non nul, et l'appelant emet une alarme *jamais inscrite dans
# l'etat*, donc repetee a chaque tour tant que la panne dure.
api() { gh api --paginate "$@" 2>>"$STATE_DIR/veille-$ME.err"; }
prs() { gh pr list --repo "$REPO" --state open "$@" 2>>"$STATE_DIR/veille-$ME.err"; }

degrade() {
  echo "$(horodate) VEILLE DEGRADEE — $1 injoignable. Verifier veille-$ME.err ; ne pas se fier au silence."
}

# Lit une source, puis signale les nouveautes. Le `<<<` evite le sous-shell d'un
# pipe : sans lui, un `return` ou un compteur ne remonterait pas jusqu'ici.
signaler() {
  etiquette="$1"; sortie="$2"
  while IFS=$'\t' read -r k msg; do
    # Une cle vide vient forcement d'une anomalie, jamais d'un evenement reel :
    # l'inscrire rendrait cette anomalie silencieuse pour toujours.
    [ -z "$k" ] && continue
    vu "$k" || { marquer "$k"; echo "$(horodate) $etiquette $msg"; }
  done <<< "$sortie"
}

echo "$(horodate) veille $ME armée sur $REPO — signale le marqueur $MARQUE (état : $STATE)"

while true; do
  # 1. PR ouvertes : nouvelle PR ou nouvelle tête (SHA)
  if liste=$(prs --json number,title,headRefName,headRefOid \
    --jq '.[] | "pr\(.number)@\(.headRefOid)\t#\(.number) \(.title) [\(.headRefName)] tête \(.headRefOid[0:10])"'); then
    signaler "PR" "$liste"
  else
    degrade "la liste des PR"
  fi

  if ! numeros=$(prs --json number --jq '.[].number'); then
    # Sans cet `else`, une coupure survenue entre les deux appels faisait sauter
    # revues et commentaires de diff en silence — le « faussement calme » que ce
    # script existe pour empêcher, reproduit à l'intérieur de son propre correctif.
    degrade "l'énumération des PR (revues et commentaires de diff non inspectés)"
    numeros=""
  fi

  for n in $numeros; do
    # 2. Revues soumises par l'autre agent
    if revues=$(api "repos/$REPO/pulls/$n/reviews" --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "r\(.id)\t#'"$n"' revue \(.state) sur \(.commit_id[0:10])"'); then
      signaler "REVUE" "$revues"
    else
      degrade "les revues de #$n"
    fi
    # 3. Commentaires de diff de l'autre agent
    if diffs=$(api "repos/$REPO/pulls/$n/comments" --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "d\(.id)@\(.updated_at)\t#'"$n"' \(.path):\(.line // .original_line // "?") — \(.body | split("\n")[0] | .[0:100])"'); then
      signaler "DIFF" "$diffs"
    else
      degrade "les commentaires de diff de #$n"
    fi
  done

  # 4. Commentaires de conversation (PR et issues) de l'autre agent, y compris édités
  if commentaires=$(api "repos/$REPO/issues/comments?per_page=100&sort=updated&direction=desc" \
    --jq '.[] | select((.body // "") | contains("'"$MARQUE"'")) | "c\(.id)@\(.updated_at)\t\(.issue_url | split("/") | last | "#" + .) — \(.body | split("\n")[0] | .[0:110])"'); then
    signaler "COMMENTAIRE" "$commentaires"
  else
    degrade "les commentaires"
  fi

  sleep "$INTERVALLE"
done
