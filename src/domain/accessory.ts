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
  /**
   * Répétitions à pré-remplir, une par série, dans l'ordre.
   *
   * `null` quand il n'y a rien à proposer — les tractions au poids du corps se notent
   * « maximum moins deux », un nombre que personne ne peut deviner à l'avance. Une
   * première version rendait `0` ici, ce qui fabriquait une performance nulle là où il
   * n'y avait qu'une absence : le parcours bout en bout l'a fait tomber à l'export.
   */
  reps: (number | null)[]
  outcome: AccessoryOutcome
}

/** Somme des répétitions d'une séance. À n'appeler que sur une séance complète. */
function total(performance: AccessoryPerformance): number {
  return performance.reps.reduce<number>((sum, reps) => sum + (reps ?? 0), 0)
}

/**
 * `true` si la séance porte **toutes** les séries prescrites, toutes renseignées.
 *
 * C'est la condition d'entrée de toute décision automatique. Une séance où Ugo a
 * validé une série sur trois — parce qu'il a terminé plus tôt, ou sauté le reste —
 * ne dit rien de ce qu'il aurait fait sur les autres. La prendre pour argent comptant
 * ferait monter une charge sur un tiers de l'effort prévu.
 */
function seanceComplete(performance: AccessoryPerformance, series: number): boolean {
  return performance.reps.length >= series && performance.reps.every((reps) => reps != null)
}

function repeat(value: number | null, count: number): (number | null)[] {
  return Array.from({ length: count }, () => value)
}

/**
 * L'historique avec les charges non notées **reportées de la séance précédente**.
 *
 * Arbitrage d'Ugo, 13.09.2026 : quand il oublie de noter le poids, « elle part du
 * principe que j'ai fait pareil que la dernière fois ». C'est ce qui se passe en
 * salle — il recharge les mêmes disques et ne l'écrit pas.
 *
 * Deux lectures plus pauvres ont été écartées. **Ignorer** la séance revenait à ne pas
 * compter un entraînement qui a bien eu lieu : trois passages à 24 kg dont un non noté
 * ne déclenchaient aucun blocage. **Repartir de la charge de départ** effaçait des
 * kilos durement gagnés — le défaut que Codex a trouvé.
 *
 * Le report ne concerne que la **charge**. Une répétition non notée reste inconnue, et
 * une séance aux répétitions incomplètes ne prouve toujours aucun blocage : deviner ce
 * qu'Ugo a chargé est raisonnable, deviner ce qu'il a réussi ne l'est pas.
 *
 * Les séances antérieures à toute charge connue restent sans charge : rien d'où inférer.
 */
function avecChargesReportees(
  history: readonly AccessoryPerformance[],
): readonly AccessoryPerformance[] {
  let derniere: number | null = null
  const duPlusAncien = [...history].reverse().map((performance) => {
    if (performance.weight != null) {
      derniere = performance.weight
      return performance
    }
    return derniere == null ? performance : { ...performance, weight: derniere }
  })
  return duPlusAncien.reverse()
}

/** Les séances dont la charge est connue, **après report**, la plus récente d'abord. */
function chargesConnues(history: readonly AccessoryPerformance[]): readonly AccessoryPerformance[] {
  return avecChargesReportees(history).filter((performance) => performance.weight != null)
}

/** Dernière charge réellement notée sur cet exercice, s'il y en a une. */
function derniereChargeConnue(history: readonly AccessoryPerformance[]): number | null {
  return chargesConnues(history)[0]?.weight ?? null
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
    // `exercise.reps` peut valoir `null` — les tractions au poids du corps se notent
    // « maximum moins deux ». On propage l'absence plutôt que d'inventer un zéro.
    return { weight: depart, reps: repeat(exercise.reps ?? null, exercise.sets), outcome: 'depart' }
  }

  const [bas, haut] = range
  // On raisonne sur les séances dont la charge est connue, **charges reportées** :
  // un poids non noté vaut celui de la séance précédente, comme Ugo l'a tranché.
  const connues = chargesConnues(history)
  const last = connues[0]
  if (!last || last.weight == null) {
    return { weight: depart, reps: repeat(bas, exercise.sets), outcome: 'depart' }
  }

  const charge = last.weight
  const pas = weightStepFor(exercise.loadKind)
  // Le nombre de séries vient **toujours** de la table, jamais de l'historique. Le
  // déduire de la dernière séance faisait rétrécir la séance suivante : une séance
  // écourtée à une série en aurait proposé une seule la fois d'après, définitivement.
  const series = exercise.sets

  // Montée : toutes les séries **prescrites**, toutes renseignées, toutes au haut de
  // la fourchette. Chacune de ces trois conditions a sa raison — sans la première,
  // une séance écourtée suffit à faire monter la charge.
  const toutesEnHaut =
    seanceComplete(last, series) && last.reps.every((reps) => reps != null && reps >= haut)
  if (toutesEnHaut) {
    // `'hold'` garde le haut de la fourchette après le saut — la règle d'Ugo pour les
    // dips et les tractions. Le défaut reste le retour au bas, règle du coach pour les
    // haltères, où le saut relatif est plus rude.
    const apres = exercise.repsAfterRise === 'hold' ? haut : bas
    return { weight: charge + pas, reps: repeat(apres, series), outcome: 'monte' }
  }

  // Blocage : le meilleur total atteint à cette charge n'a pas été battu depuis
  // `STALL_SESSIONS` séances **consécutives** à cette charge.
  //
  // Consécutives, et non « toutes celles de l'historique qui portent cette charge » :
  // un passage à 24, un allègement à 22, puis un retour à 24 ne font pas trois séances
  // bloquées à 24. Agréger sans regarder la suite faisait redescendre Ugo au moment
  // précis où il revenait sur la charge après l'avoir allégée.
  const suite: AccessoryPerformance[] = []
  for (const performance of connues) {
    if (performance.weight !== charge) break
    suite.push(performance)
  }

  // Une séance incomplète ne prouve **rien**. Règle dure du projet, déjà écrite dans
  // le moteur des cinq mouvements suivis : une valeur inconnue n'est jamais un échec.
  // Sans ce garde, trois séances notées `8/8/—` faisaient redescendre la charge, alors
  // qu'Ugo avait peut-être fait sa troisième série sans la noter.
  if (
    suite.length >= STALL_SESSIONS &&
    suite.slice(0, STALL_SESSIONS).every((performance) => seanceComplete(performance, series))
  ) {
    const recentes = suite.slice(0, STALL_SESSIONS)
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

/** Un exercice du groupe et son historique, pour une décision commune. */
export interface AccessoryGroupMember {
  exercise: ExerciseDef
  history: readonly AccessoryPerformance[]
}

/**
 * Décide d'une charge **commune** à plusieurs exercices — CB-45.
 *
 * Ugo enchaîne dips et tractions lestées avec les mêmes disques. Deux suggestions
 * divergentes l'obligeraient à recharger la ceinture au milieu du superset, ce qui
 * défait l'intérêt de l'enchaînement. Il a tranché le 13.09.2026 : **charge commune,
 * qui monte quand les deux passent**.
 *
 * Un seul principe gouverne le groupe : **il ne bouge que sur preuve unanime.**
 *
 * - monter dès qu'un seul mouvement le mérite imposerait à l'autre une charge qu'il
 *   n'a pas gagnée — c'est exactement ce qu'Ugo a écarté ;
 * - descendre dès qu'un seul bloque punirait celui qui progresse. Ugo n'a tranché que
 *   la montée ; la symétrie est **mon interprétation**, signalée comme telle, et se
 *   renverse en changeant `every` en `some`.
 *
 * Les répétitions, elles, restent **propres à chaque exercice** : il peut faire 10 aux
 * dips et 8 aux tractions à la même charge, et doit voir ces deux chiffres-là.
 */
export function planLinkedAccessories(
  members: readonly AccessoryGroupMember[],
): Map<string, AccessoryPlan> {
  const plans = members.map((member) => ({
    member,
    plan: planAccessory(member.exercise, member.history),
  }))

  // Le pas le plus fin du groupe : si deux matériels s'y mélangeaient, proposer le
  // saut du plus grossier ferait tomber l'autre sur une charge qui n'existe pas.
  const pas = Math.min(...members.map((member) => weightStepFor(member.exercise.loadKind)))

  // Charge de référence : la **plus petite** de celles que chaque membre a prouvées.
  // Réaligner vers le bas ne propose jamais à Ugo une charge qu'il n'a pas tenue sur
  // les deux mouvements.
  //
  // Un membre **sans historique** compte pour sa charge de départ, il ne disparaît pas
  // du calcul. L'ignorer faisait hériter les tractions jamais faites des 12,5 kg
  // atteints aux dips : l'absence de preuve redevenait une preuve, ce que ce fichier
  // refuse partout ailleurs.
  const references = members
    .map(
      (member) => derniereChargeConnue(member.history) ?? member.exercise.suggestedWeight ?? null,
    )
    .filter((weight): weight is number => weight != null)
  const base = references.length > 0 ? Math.min(...references) : null
  const aucunHistorique = members.every((member) => derniereChargeConnue(member.history) == null)

  const tousMontent = plans.every(({ plan }) => plan.outcome === 'monte')
  const tousBloquent = plans.every(({ plan }) => plan.outcome === 'blocage')

  let outcome: AccessoryOutcome = 'maintien'
  let commune = base
  // Aucune charge connue sur aucun membre : il n'y a rien à maintenir, on démarre.
  // Annoncer un « maintien » ici ferait passer une première séance pour une reprise.
  if (base == null || aucunHistorique) {
    outcome = 'depart'
  } else if (tousMontent) {
    outcome = 'monte'
    commune = base + pas
  } else if (tousBloquent) {
    outcome = 'blocage'
    commune = Math.max(0, base - pas)
  }

  // Les répétitions se redérivent du **résultat du groupe**, jamais du plan individuel :
  // un exercice qui montait seul doit se voir proposer un maintien, pas le
  // pré-remplissage d'une montée qui n'a pas lieu.
  return new Map(
    plans.map(({ member, plan }) => {
      const range = member.exercise.repsRange
      const series = member.exercise.sets
      if (!range || outcome === 'depart') return [member.exercise.id, { ...plan, weight: commune }]

      const [bas, haut] = range
      if (outcome === 'monte') {
        const apres = member.exercise.repsAfterRise === 'hold' ? haut : bas
        return [member.exercise.id, { weight: commune, reps: repeat(apres, series), outcome }]
      }
      if (outcome === 'blocage') {
        return [member.exercise.id, { weight: commune, reps: repeat(bas, series), outcome }]
      }
      const last = chargesConnues(member.history)[0]
      return [
        member.exercise.id,
        {
          weight: commune,
          reps: Array.from({ length: series }, (_, index) => last?.reps[index] ?? bas),
          outcome,
        },
      ]
    }),
  )
}
