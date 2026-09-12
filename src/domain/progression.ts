/**
 * Moteur de progression — CB-11.
 *
 * Fonctions pures : `(cible, réalisation) → (cible', événement)`. Aucun état global,
 * aucune mutation de l'entrée. C'est le cœur de l'app, et la seule pièce qui décide
 * ce qu'Ugo mettra sur la barre la fois suivante.
 *
 * Le prototype `carnet-de-barre.html` a servi de référence fonctionnelle, **pas
 * d'oracle** : il comptait un RPE 8,5 comme un échec, traitait des répétitions
 * inconnues comme manquées et raisonnait sur la cible plutôt que sur le poids
 * réellement soulevé. Les règles ci-dessous suivent SPEC.md et les arbitrages de
 * PLAN.md § 7.
 *
 * Règles :
 *
 * - tout se juge sur le **poids effectivement réalisé**, pas sur la cible affichée ;
 * - une valeur inconnue (RPE ou répétitions non notés) n'est **jamais** un échec ;
 * - succès = répétitions cibles atteintes **et** RPE ≤ 8 → cible = réalisé + incrément,
 *   à la lettre, y compris si cela fait redescendre une cible après un top set volontairement
 *   léger. Ugo peut alors corriger la cible à la main (CB-33). La question d'une règle de
 *   non-régression est posée dans UGO-179 : tant qu'elle n'est pas tranchée, la spec fait foi ;
 * - RPE 8,5 avec répétitions faites, ou RPE non noté avec répétitions faites → maintien ;
 * - répétitions manquées, ou RPE ≥ 9 → échec, avec mémoire de la charge en cause ;
 * - deuxième échec à la **même** charge → reset à −7,5 %, arrondi à 2,5 kg.
 */

import { LIFTS, type BackoffDef } from './program.ts'
import { formatLoad } from './format.ts'
import type { LiftKey, ProgressionEvent, Target } from './types.ts'

/** Le reset de la spec : −7,5 % de la charge qui a bloqué deux fois. */
export const RESET_RATIO = 0.925

/** Le matériel de la salle ne descend pas sous 1,25 kg par côté, soit 2,5 kg sur la barre. */
export const WEIGHT_STEP = 2.5

/** RPE au-delà duquel la série compte comme un échec. */
export const RPE_FAILURE_THRESHOLD = 9

/** RPE en deçà ou égal duquel la série compte comme réussie. */
export const RPE_SUCCESS_THRESHOLD = 8

/**
 * Arrondi au pas de charge disponible en salle.
 *
 * Réservé aux valeurs **calculées** : le reset de −7,5 % et les backoffs à −10 %
 * produisent des fractions arbitraires qu'il faut ramener sur du matériel réel.
 * Une progression d'un incrément n'y passe pas : l'incrément est déjà un pas
 * délibéré, et l'arrondir écraserait un pas plus fin choisi exprès.
 */
export function roundToStep(value: number, step: number = WEIGHT_STEP): number {
  return tidy(Math.round(value / step) * step)
}

/** Enlève le bruit des flottants sans rien arrondir de significatif. */
function tidy(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

/** Ce qu'Ugo a réellement fait sur une série. `null` signifie « non noté », pas « zéro ». */
export interface Attempt {
  weight: number | null
  reps: number | null
  rpe: number | null
}

export interface ProgressionOutcome {
  /** Nouvelle cible. L'entrée n'est jamais modifiée. */
  target: Target
  event: ProgressionEvent
}

function describe(
  lift: LiftKey,
  previous: number,
  next: number,
  outcome: ProgressionEvent['outcome'],
): ProgressionEvent {
  const label = LIFTS[lift].label
  const load = formatLoad(next, LIFTS[lift].loadKind)
  const phrases: Record<ProgressionEvent['outcome'], string> = {
    progresse: `${label} → ${load}`,
    ajuste: `${label} → ${load} (ajusté sous la cible précédente)`,
    maintien: `${label} → ${load} (on reste là)`,
    'second-essai': `${label} → ${load} (deuxième essai)`,
    reset: `${label} → ${load} (reset après deux échecs)`,
    inchange: `${label} → ${load}`,
  }
  return { lift, previous, next, outcome, message: phrases[outcome] }
}

/**
 * Applique la règle du top set.
 *
 * L'incrément vient de `target.inc`, pas des constantes du programme : c'est la cible
 * qui fait autorité, elle voyage dans l'export et un ajustement manuel peut la changer.
 *
 * Retourne `null` si rien n'a été soulevé : un exercice non fait ne fait pas avancer
 * la cible et ne compte pas non plus comme un échec.
 */
export function applyTopSet(
  lift: LiftKey,
  target: Target,
  attempt: Attempt,
): ProgressionOutcome | null {
  if (attempt.weight == null) return null

  const previous = target.w
  const done = attempt.weight
  const repsKnown = attempt.reps != null
  const repsMet = repsKnown && attempt.reps! >= target.reps
  const rpeKnown = attempt.rpe != null
  const rpeEasy = rpeKnown && attempt.rpe! <= RPE_SUCCESS_THRESHOLD
  const rpeHard = rpeKnown && attempt.rpe! >= RPE_FAILURE_THRESHOLD

  // Échec : répétitions manquées, ou RPE au plafond. Une valeur inconnue n'entre pas ici.
  if ((repsKnown && !repsMet) || rpeHard) {
    if (target.fail != null && target.fail === done) {
      const next = roundToStep(done * RESET_RATIO)
      return {
        target: { ...target, w: next, fail: null },
        event: describe(lift, previous, next, 'reset'),
      }
    }
    // Premier échec à cette charge : on la retente telle quelle la prochaine fois.
    return {
      target: { ...target, w: done, fail: done },
      event: describe(lift, previous, done, 'second-essai'),
    }
  }

  // Succès : répétitions cibles atteintes et RPE confortable.
  if (repsMet && rpeEasy) {
    const next = tidy(done + target.inc)
    const outcome = next === previous ? 'inchange' : next > previous ? 'progresse' : 'ajuste'
    return {
      target: { ...target, w: next, fail: null },
      event: describe(lift, previous, next, outcome),
    }
  }

  // Tout le reste est un maintien : RPE 8,5, RPE non noté, répétitions inconnues.
  // L'échec en attente est conservé : il ne s'efface que sur un succès, un reset
  // ou un ajustement manuel.
  return {
    target: { ...target },
    event: describe(lift, previous, previous, 'maintien'),
  }
}

/**
 * Applique la double progression d'un schéma à volume (développé couché 3×8).
 *
 * `sets` ne doit contenir que les séries **validées** : une série sautée ou seulement
 * pré-remplie ne déclenche jamais de progression.
 */
export function applyVolumeSets(
  lift: LiftKey,
  target: Target,
  sets: readonly Attempt[],
): ProgressionOutcome | null {
  const done = sets.filter((set): set is Attempt & { weight: number } => set.weight != null)
  if (done.length === 0) return null

  const previous = target.w

  // Sans nombre de séries configuré, on ne sait pas ce qui constitue une réussite.
  // Ne rien décider vaut mieux que faire progresser sur une seule série.
  if (target.sets == null) {
    return { target: { ...target }, event: describe(lift, previous, previous, 'maintien') }
  }

  const lightest = Math.min(...done.map((set) => set.weight))
  const allRepsMet = done.every((set) => set.reps != null && set.reps >= target.reps)

  if (done.length >= target.sets && allRepsMet && lightest >= previous) {
    const next = tidy(lightest + target.inc)
    return {
      target: { ...target, w: next, fail: null },
      event: describe(lift, previous, next, 'progresse'),
    }
  }

  return { target: { ...target }, event: describe(lift, previous, previous, 'maintien') }
}

/**
 * Charge des séries de délestage.
 *
 * −10 % du top set réellement réalisé, arrondi au pas de 2,5 kg. Les tractions font
 * exception : leurs backoffs sont fixés à +7,5 kg quelle que soit la charge du top set.
 */
export function backoffWeight(topWeight: number, backoff: BackoffDef): number {
  if (backoff.fixed != null) return backoff.fixed
  return roundToStep(topWeight * (backoff.ratio ?? 0.9))
}
