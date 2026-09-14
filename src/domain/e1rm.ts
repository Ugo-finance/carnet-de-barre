/**
 * Maximum estimé et records — CB-13.
 *
 * La maquette montre une carte record avec un e1RM en gros chiffres. Elle est restée
 * masquée jusqu'ici parce que ses données existent mais que sa **formule** n'était pas
 * arrêtée — arbitrage 4 de `00-contrat.md`. Ce module l'arrête, et documente ce qu'elle
 * refuse de calculer, ce qui est la partie importante.
 *
 * ## La formule
 *
 * Epley sur les répétitions **effectives** : `charge × (1 + (reps + RIR) / 30)`, où le
 * RIR — répétitions en réserve — vaut `10 − RPE`.
 *
 * Epley nu traiterait un top set @8 comme un effort maximal alors qu'Ugo s'arrête deux
 * répétitions avant l'échec. Sur ses vraies séances, l'écart n'est pas cosmétique : son
 * soulevé du 06.09, 87,5 kg × 3 @8, donne **96,3 kg** sans le RIR et **102,1 kg** avec.
 * Un maximum estimé qui ignore le RPE mesure sa prudence, pas sa force.
 *
 * Le choix entre Epley + RIR et une table RPE se joue à moins de 3 kg sur toutes ses
 * séances — 98,8 contre 102,1 sur ce même soulevé, et moins d'un kilo ailleurs. Epley
 * l'emporte parce qu'il tient en une ligne vérifiable plutôt qu'en une table de
 * coefficients qu'il faudrait justifier ligne à ligne.
 *
 * ## Ce qu'il refuse de calculer, et pourquoi
 *
 * **Sans RPE, pas d'e1RM.** Six des quatorze top sets à la barre de l'historique n'en
 * portent pas. Retomber sur Epley nu pour ceux-là mélangerait deux échelles : un
 * « record » pourrait alors être battu par un changement de formule plutôt que par un
 * progrès, et la carte annoncerait un exploit qui n'a pas eu lieu. L'absence se propage,
 * comme partout ailleurs dans ce projet.
 *
 * **Pas d'e1RM hors charge à la barre.** Les tractions lestées se notent en lest ajouté :
 * « +20 kg » n'est le maximum de rien tant que l'app ignore le poids de corps d'Ugo, et
 * elle l'ignore. Cinq top sets de plus qui n'en auront pas.
 *
 * **Le record de charge, lui, n'a aucune de ces limites** et couvre tout l'historique.
 * C'est volontairement deux mesures distinctes : la première répond à « ai-je soulevé
 * plus lourd ? », la seconde à « suis-je plus fort ? », et elles ne se battent pas les
 * mêmes jours.
 */

import type { LiftKey, SetLog } from './types.ts'

/** Ce qu'il faut d'une série pour en tirer quoi que ce soit. */
export interface PerformanceTop {
  weight: number | null
  reps: number | null
  rpe: number | null
  loadKind: SetLog['loadKind']
}

/**
 * Le maximum estimé d'une série, ou `null` quand il n'est pas calculable.
 *
 * `null` n'est pas un échec : c'est la réponse exacte. Voir l'en-tête pour les trois
 * cas — charge hors barre, répétitions inconnues, RPE absent.
 */
export function e1rm(performance: PerformanceTop): number | null {
  const { weight, reps, rpe, loadKind } = performance
  if (loadKind !== 'barTotal') return null
  if (weight == null || weight <= 0) return null
  if (reps == null || reps <= 0) return null
  if (rpe == null) return null

  // Le RIR d'un RPE : à 8, il reste deux répétitions. Un RPE supérieur à 10 n'existe
  // pas, mais s'il arrivait par un import, il ne doit pas retrancher des répétitions.
  const rir = Math.max(0, 10 - rpe)
  const estime = weight * (1 + (reps + rir) / 30)
  return Math.round(estime * 10) / 10
}

/** Une performance passée, réduite à ce que les records regardent. */
export interface TopPasse extends PerformanceTop {
  /** Date civile de la séance, `AAAA-MM-JJ`. */
  date: string
  lift: LiftKey
}

export interface Record {
  /** La valeur du record. */
  valeur: number
  /** La date où il a été établi. La **première** en cas d'égalité : un record se tient. */
  date: string
}

/**
 * Le meilleur maximum estimé de ce lift, ou `null` si aucune série n'en permet un.
 *
 * En cas d'égalité, la **plus ancienne** date gagne. Un record égalé n'est pas un
 * record battu, et réafficher la date du jour ferait croire à un progrès.
 */
export function recordE1RM(tops: readonly TopPasse[], lift: LiftKey): Record | null {
  return meilleur(tops, lift, (top) => e1rm(top))
}

/**
 * Le meilleur poids de top set de ce lift.
 *
 * Sans limite de RPE ni de nature de charge : « ai-je soulevé plus lourd » se répond
 * sur toutes les séries, y compris les tractions lestées où le lest fait foi.
 */
export function recordCharge(tops: readonly TopPasse[], lift: LiftKey): Record | null {
  return meilleur(tops, lift, (top) => (top.weight != null && top.weight > 0 ? top.weight : null))
}

function meilleur(
  tops: readonly TopPasse[],
  lift: LiftKey,
  mesure: (top: TopPasse) => number | null,
): Record | null {
  let record: Record | null = null

  for (const top of tops) {
    if (top.lift !== lift) continue
    const valeur = mesure(top)
    if (valeur == null) continue
    if (record === null || valeur > record.valeur || egaliteAncienne(valeur, top.date, record)) {
      record = { valeur, date: top.date }
    }
  }

  return record
}

/**
 * Une égalité départagée par la **date**, et non par l'ordre d'arrivée — P1 de Codex.
 *
 * Une première version se contentait de `>` strict, en comptant sur un historique trié
 * du plus ancien au plus récent. Les deux magasins rendent `listSeances()` dans l'ordre
 * **inverse** : le record d'un squat à 80 kg fait le 01.09 puis le 08.09 portait donc la
 * date du 08, c'est-à-dire exactement le contraire de la règle annoncée. Le test le
 * masquait, sa fixture étant écrite dans l'ordre chronologique.
 *
 * Un record égalé n'est pas un record battu : réafficher la date du jour ferait croire
 * à un progrès qui n'a pas eu lieu.
 */
function egaliteAncienne(valeur: number, date: string, record: Record): boolean {
  return valeur === record.valeur && date < record.date
}

/**
 * Cette performance bat-elle le record **établi avant elle** ?
 *
 * Le record se calcule sur l'historique **hors** la séance en cours : se comparer à
 * soi-même rendrait toujours faux. L'appelant passe donc les tops antérieurs.
 */
export function batLeRecord(
  anterieurs: readonly TopPasse[],
  candidat: TopPasse,
): { charge: boolean; e1rm: boolean } {
  const chargeRecord = recordCharge(anterieurs, candidat.lift)
  const e1rmRecord = recordE1RM(anterieurs, candidat.lift)
  const chargeCandidat = candidat.weight
  const e1rmCandidat = e1rm(candidat)

  return {
    charge:
      chargeCandidat != null &&
      chargeCandidat > 0 &&
      (chargeRecord === null || chargeCandidat > chargeRecord.valeur),
    // Un premier e1RM calculable n'est pas un record : il n'y a rien à battre. Annoncer
    // un exploit au premier RPE noté serait une donnée de démonstration, pas un fait.
    e1rm: e1rmCandidat != null && e1rmRecord !== null && e1rmCandidat > e1rmRecord.valeur,
  }
}
