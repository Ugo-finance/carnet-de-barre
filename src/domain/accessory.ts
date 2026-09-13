/**
 * Double progression des accessoires — CB-45.
 *
 * Jusqu'ici, un accessoire proposait une charge **constante**, écrite une fois dans la
 * table du programme. Ugo l'a constaté en salle le 12.09 : son développé incliné
 * affichait 20 kg par haltère pendant qu'il en tirait 24, et l'aurait affiché
 * indéfiniment.
 *
 * La règle vient de son coach, transmise le 13.09.2026 :
 *
 * - **monter** quand toutes les séries atteignent le haut de la fourchette ;
 * - **entre deux montées**, garder la charge et chercher des répétitions n'importe où
 *   (8/8/8 → 10/9/8 → … → 12/12/12) ;
 * - **débloquer** en redescendant d'un cran après trois séances stériles.
 *
 * Pas de RPE : le haut de fourchette suffit comme signal, le garde-fou d'effort est
 * implicite dedans. Ugo ne note que des répétitions sur ses accessoires, et une règle
 * qui en dépendrait serait inapplicable avec ses données.
 *
 * **Fonction pure, dérivée de l'historique.** Aucune écriture, aucune migration : la
 * suggestion se recalcule à chaque ouverture. Conséquence à assumer — corriger une
 * séance passée déplace la suggestion suivante. Ce n'est **pas** une entorse à D6 :
 * D6 protège les *cibles enregistrées* des cinq mouvements suivis, et une suggestion
 * d'accessoire n'en est pas une. Personne n'écrit rien ici.
 */

import { weightStepFor, type ExerciseDef } from './program.ts'

/** Trois séances à la même charge sans rien gagner : la charge est trop lourde. */
export const STALL_SESSIONS = 3

/** Une séance passée, réduite à ce que la progression d'un accessoire regarde. */
export interface AccessoryPerformance {
  /** Date civile de la séance, `AAAA-MM-JJ`. */
  date: string
  /** Charge portée par les séries de cet exercice. `null` si rien n'a été noté. */
  weight: number | null
  /** Répétitions réalisées, **dans l'ordre des séries**. `null` = non notée. */
  reps: readonly (number | null)[]
}

export type AccessoryOutcome =
  /** Aucun historique : la charge de départ de la table. */
  | 'depart'
  /** Haut de fourchette partout : la charge monte d'un pas. */
  | 'monte'
  /** Même charge, on vise plus de répétitions. */
  | 'maintien'
  /** Trois séances stériles : on redescend d'un cran. */
  | 'blocage'

export interface AccessoryPlan {
  weight: number | null
  /** Répétitions à pré-remplir, une par série, dans l'ordre. */
  reps: number[]
  outcome: AccessoryOutcome
}

/** Somme des répétitions notées d'une séance. Une série non notée compte pour zéro. */
function total(performance: AccessoryPerformance): number {
  return performance.reps.reduce<number>((sum, reps) => sum + (reps ?? 0), 0)
}

/** Nombre de séries que la table prévoit pour cet exercice. */
function setCount(exercise: ExerciseDef, last: AccessoryPerformance | undefined): number {
  return last && last.reps.length > 0 ? last.reps.length : exercise.sets
}

function repeat(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value)
}

/**
 * Ce que l'app doit proposer sur cet accessoire à la prochaine séance.
 *
 * `history` contient les séances où cet exercice a été **réalisé**, de la plus récente
 * à la plus ancienne. À l'appelant de ne transmettre que des séries validées : une
 * série sautée ou seulement pré-remplie ne prouve rien et ne doit rien déclencher.
 */
export function planAccessory(
  exercise: ExerciseDef,
  history: readonly AccessoryPerformance[],
): AccessoryPlan {
  const range = exercise.repsRange
  const depart = exercise.suggestedWeight ?? null

  // Sans fourchette, il n'existe pas de « haut » à atteindre : rien ne peut décider
  // d'une montée, et inventer un seuil reviendrait à écrire du programme.
  if (!range) {
    const reps = exercise.reps ?? 0
    return { weight: depart, reps: repeat(reps, exercise.sets), outcome: 'depart' }
  }

  const [bas, haut] = range
  const last = history[0]
  if (!last || last.weight == null) {
    return { weight: depart, reps: repeat(bas, setCount(exercise, last)), outcome: 'depart' }
  }

  const charge = last.weight
  const pas = weightStepFor(exercise.loadKind)
  const series = setCount(exercise, last)

  // Montée : **toutes** les séries au haut de la fourchette. Une série non notée n'y
  // suffit pas — on ne fait pas monter une charge sur une donnée absente.
  const toutesEnHaut =
    last.reps.length > 0 && last.reps.every((reps) => reps != null && reps >= haut)
  if (toutesEnHaut) {
    // `'hold'` garde le haut de la fourchette après le saut — la règle d'Ugo pour les
    // dips et les tractions. Le défaut reste le retour au bas, règle du coach pour les
    // haltères, où le saut relatif est plus rude.
    const apres = exercise.repsAfterRise === 'hold' ? haut : bas
    return { weight: charge + pas, reps: repeat(apres, series), outcome: 'monte' }
  }

  // Blocage : le meilleur total atteint à cette charge n'a pas été battu depuis
  // `STALL_SESSIONS` séances à cette charge. Formulation choisie parce qu'elle se
  // comporte bien aux limites — 8/8/8 trois fois bloque, 8/8/8 puis 9/8/8 non.
  const aCetteCharge = history.filter((performance) => performance.weight === charge)
  if (aCetteCharge.length >= STALL_SESSIONS) {
    const recentes = aCetteCharge.slice(0, STALL_SESSIONS)
    const meilleurAncien = total(recentes[STALL_SESSIONS - 1])
    const battu = recentes
      .slice(0, STALL_SESSIONS - 1)
      .some((performance) => total(performance) > meilleurAncien)
    if (!battu) {
      // On ne descend jamais sous zéro : un lest négatif n'existe pas, et sur une
      // charge déjà minimale mieux vaut rester que proposer une absurdité.
      const allege = Math.max(0, charge - pas)
      return { weight: allege, reps: repeat(bas, series), outcome: 'blocage' }
    }
  }

  // Maintien : même charge, et on **repropose ce qu'il a fait**, série par série.
  // Pré-remplir le bas de la fourchette lui ferait perdre le fil de sa propre
  // progression : il doit voir 10/9/8 pour savoir quoi battre.
  return {
    weight: charge,
    reps: Array.from({ length: series }, (_, index) => last.reps[index] ?? bas),
    outcome: 'maintien',
  }
}
