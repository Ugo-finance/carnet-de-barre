/**
 * De l'historique des séances vers ce que la progression des accessoires sait lire —
 * CB-45 lot B2.
 *
 * `planAccessory` raisonne sur des `AccessoryPerformance` : une date, une charge, des
 * répétitions. Les séances, elles, portent des séries hétérogènes de tous les
 * exercices. Ce fichier fait la traduction, et **c'est là que vivent les décisions
 * sur les données mal formées** — pas dans le moteur, qui doit rester une règle.
 */

import {
  planAccessory,
  planLinkedAccessories,
  type AccessoryPerformance,
} from '../domain/accessory.ts'
import type { AccessoryPlan } from '../domain/accessory.ts'
import type { ExerciseDef } from '../domain/program.ts'
import type { Seance } from '../domain/types.ts'

/**
 * Ce qu'Ugo a réellement fait sur cet exercice, de la séance la plus récente à la plus
 * ancienne.
 *
 * Trois filtres, chacun pour une raison.
 *
 * **Les séances du carnet papier sont ignorées.** Les douze séances de départ n'ont pas
 * de `sets` : il n'y a aucune série à lire, et en fabriquer depuis leurs lignes de texte
 * inventerait des données qu'Ugo n'a jamais saisies.
 *
 * **Seules les séries validées comptent.** Une série sautée ou restée pré-remplie ne
 * prouve rien ; la faire entrer ferait progresser une charge sur une intention.
 *
 * **Les séances sans aucune série validée pour cet exercice disparaissent.** Elles ne
 * sont pas « une séance à zéro répétition » — l'exercice n'a simplement pas été fait, et
 * le compter comme un passage stérile ferait redescendre une charge sans raison.
 */
export function accessoryHistory(
  seances: readonly Seance[],
  exerciseId: string,
): AccessoryPerformance[] {
  return (
    seances
      .filter((seance) => seance.sets != null)
      // Deux séances peuvent porter la **même date** — le contrat l'autorise, et une
      // reprise le même jour arrive. Sans départage, la plus ancienne pouvait passer
      // pour la dernière et le moteur raisonnait sur une charge périmée.
      //
      // `ts` départage. Une séance qui n'en porte pas est rangée en dernier dans sa
      // journée : c'est déterministe, et ça n'invente aucune chronologie — en pratique
      // les seules séances sans `ts` sont celles du carnet papier, déjà écartées
      // au-dessus faute de séries.
      .toSorted((a, b) => b.date.localeCompare(a.date) || (b.ts ?? 0) - (a.ts ?? 0))
      .flatMap<AccessoryPerformance>((seance) => {
        // Trié sur `index`, le rang **contractuel** de la série, et non sur la position
        // dans le tableau. Un import ou une correction peut rendre les séries dans un
        // autre ordre ; s'y fier reproposerait les répétitions sur les mauvaises lignes.
        //
        // Le rôle est filtré, et c'est vital : un accessoire peut être précédé d'un
        // palier d'échauffement, validé comme les autres, portant le **même**
        // `exerciseId` et bien plus léger. Sans ce filtre, les 14 kg du palier d'incliné
        // deviennent la charge de la séance — `Math.min` ci-dessous les choisit — et Ugo
        // se voit reproposer 14 kg au lieu des 24 qu'il a réellement tirés. C'est
        // exactement le défaut du 12.09, ressuscité par une autre porte.
        //
        // Atteignable dès ce lot par l'import d'un export v2, et systématiquement une
        // fois les paliers posés dans le brouillon (CB-56).
        const faites = (seance.sets ?? [])
          .filter(
            (set) =>
              set.exerciseId === exerciseId &&
              set.status === 'validated' &&
              set.role === 'accessory',
          )
          .toSorted((a, b) => a.index - b.index)
        if (faites.length === 0) return []

        // Charge de la séance quand les séries divergent : la **plus petite**. Ne jamais
        // proposer à Ugo une charge qu'il n'a pas tenue sur l'ensemble de l'exercice.
        // Une série au poids non noté ne tire pas la charge vers le bas : elle est
        // inconnue, pas nulle — c'est `planAccessory` qui décidera d'en reporter une.
        const charges = faites
          .map((set) => set.weight)
          .filter((weight): weight is number => weight != null)

        return [
          {
            date: seance.date,
            weight: charges.length > 0 ? Math.min(...charges) : null,
            reps: faites.map((set) => set.reps),
          },
        ]
      })
  )
}

/**
 * Le plan de chaque exercice d'une séance, groupes de charge commune compris.
 *
 * Les exercices liés par `loadGroup` — dips et tractions lestées — sont décidés
 * **ensemble**, sur preuve unanime. Les traiter un par un les ferait diverger, et Ugo
 * devrait recharger la ceinture au milieu de son superset.
 */
export function accessoryPlans(
  exercises: readonly ExerciseDef[],
  seances: readonly Seance[],
): Map<string, AccessoryPlan> {
  const plans = new Map<string, AccessoryPlan>()
  const groupes = new Map<string, ExerciseDef[]>()

  for (const exercise of exercises) {
    if (exercise.loadGroup) {
      const membres = groupes.get(exercise.loadGroup) ?? []
      membres.push(exercise)
      groupes.set(exercise.loadGroup, membres)
      continue
    }
    plans.set(exercise.id, planAccessory(exercise, accessoryHistory(seances, exercise.id)))
  }

  for (const membres of groupes.values()) {
    // Un groupe réduit à un seul exercice n'a personne avec qui s'accorder : le décider
    // « à l'unanimité de un » revient au cas simple, sans détour.
    if (membres.length === 1) {
      const seul = membres[0]
      plans.set(seul.id, planAccessory(seul, accessoryHistory(seances, seul.id)))
      continue
    }
    const commun = planLinkedAccessories(
      membres.map((exercise) => ({ exercise, history: accessoryHistory(seances, exercise.id) })),
    )
    for (const [id, plan] of commun) plans.set(id, plan)
  }

  return plans
}
