/**
 * Construction d'une séance à saisir — CB-31.
 *
 * Fabrique le brouillon d'une séance à partir des cibles courantes : chaque série
 * arrive **pré-remplie**, ce qui est la condition du « valider en un tap ». Rien
 * n'est saisi pour autant : toutes les séries partent en statut `planned`, et seul
 * `status` prouvera une réalisation.
 *
 * Fonction pure : elle ne touche ni la base ni l'horloge au-delà de l'horodatage
 * qu'on lui passe.
 */

import { SEANCES, type ExerciseDef } from '../domain/program.ts'
import { accessoryPlans } from './accessory-history.ts'
import { warmupPlan } from '../domain/warmup.ts'
import type { AccessoryPlan } from '../domain/accessory.ts'
import { backoffWeight } from '../domain/progression.ts'
import type { Draft, Seance, SeanceType, SetLog, Targets } from '../domain/types.ts'

/**
 * Identifiant de série, déterministe et unique dans la séance.
 *
 * Deux constructions du même brouillon donnent les mêmes identifiants : reprendre un
 * brouillon ne renumérote rien, et le schéma d'export exige justement l'unicité des
 * identifiants de série au sein d'une séance.
 */
export function setId(exerciseId: string, role: SetLog['role'], index: number): string {
  return `${exerciseId}:${role}:${index}`
}

/** Répétitions à proposer : la cible si elle existe, sinon le bas de la fourchette. */
function suggestedReps(exercise: ExerciseDef): number | null {
  if (exercise.reps != null) return exercise.reps
  if (exercise.repsRange) return exercise.repsRange[0]
  return null
}

function blankSet(
  exercise: ExerciseDef,
  role: SetLog['role'],
  index: number,
  weight: number | null,
  reps: number | null,
): SetLog {
  return {
    id: setId(exercise.id, role, index),
    exerciseId: exercise.id,
    role,
    index,
    status: 'planned',
    loadKind: exercise.loadKind,
    weight,
    reps,
    rpe: null,
    targetWeight: weight,
    targetReps: reps,
  }
}

/**
 * Les paliers d'échauffement d'un exercice, prêts à valider — CB-56.
 *
 * `workWeight` est la charge de la série de travail, celle-là même que porteront les
 * séries qui suivent : la cible du jour pour un lift, la charge proposée pour un
 * accessoire. Les paliers se dérivent donc **de ce qu'Ugo va réellement faire**, pas de
 * la table — un accessoire dont le moteur a fait monter la charge voit son échauffement
 * monter avec elle, sans qu'on ait à y penser.
 */
function warmupSetsFor(exercise: ExerciseDef, workWeight: number | null): SetLog[] {
  return warmupPlan(exercise.warmup, exercise.loadKind, workWeight).map((palier, index) =>
    blankSet(exercise, 'warmup', index, palier.weight, palier.reps),
  )
}

/** Les séries d'un exercice, dans l'ordre où elles seront faites. */
export function setsForExercise(
  exercise: ExerciseDef,
  targets: Targets,
  plan?: AccessoryPlan,
): SetLog[] {
  const target = exercise.lift ? targets[exercise.lift] : undefined

  if (exercise.kind === 'topset' && target) {
    const top = blankSet(exercise, 'top', 0, target.w, target.reps)
    const backoffs: SetLog[] = []
    if (exercise.backoff) {
      const charge = backoffWeight(target.w, exercise.backoff)
      for (let index = 0; index < exercise.backoff.count; index += 1) {
        backoffs.push(blankSet(exercise, 'backoff', index, charge, exercise.backoff.reps))
      }
    }
    return [...warmupSetsFor(exercise, target.w), top, ...backoffs]
  }

  if (exercise.kind === 'volume' && target) {
    const count = target.sets ?? exercise.sets
    return [
      ...warmupSetsFor(exercise, target.w),
      ...Array.from({ length: count }, (_, index) =>
        blankSet(exercise, 'volume', index, target.w, target.reps),
      ),
    ]
  }

  if (exercise.kind === 'accessory') {
    // La charge vient du **plan** quand on en a un — c'est-à-dire de ce qu'Ugo a fait,
    // pas de la table. Sans plan, on retombe sur la valeur de départ : c'est ce que
    // faisait l'app avant CB-45, et c'est le défaut qu'il a vu en salle, son incliné
    // affichant 20 kg pendant qu'il en tirait 24.
    //
    // Un exercice au poids du corps n'a pas de charge à porter, plan ou pas.
    const proposee = plan ? plan.weight : (exercise.suggestedWeight ?? null)
    const charge = exercise.loadKind === 'bodyweight' ? null : proposee
    return [
      ...warmupSetsFor(exercise, charge),
      ...Array.from({ length: exercise.sets }, (_, index) =>
        blankSet(
          exercise,
          'accessory',
          index,
          charge,
          plan?.reps[index] ?? suggestedReps(exercise),
        ),
      ),
    ]
  }

  // Les exercices optionnels se notent en texte libre, pas en séries.
  return []
}

/**
 * Un brouillon complet, prêt à être affiché et validé série par série.
 *
 * `rushed` n'enlève aucune série : le mode pressé replie et désactive l'affichage des
 * exercices au-delà du deuxième, mais une série déjà saisie ne doit jamais disparaître
 * parce qu'on a basculé un interrupteur.
 */
export function buildDraft(
  type: SeanceType,
  date: string,
  targets: Targets,
  options: { id: string; now?: number; seances?: readonly Seance[] } = {
    id: crypto.randomUUID(),
  },
): Draft {
  const now = options.now ?? Date.now()
  const seance = SEANCES[type]
  // Sans historique, les plans sont vides et chaque accessoire retombe sur la charge
  // de la table. Le défaut est donc le comportement d'avant CB-45, jamais une erreur.
  const plans = accessoryPlans(seance.exercises, options.seances ?? [])

  return {
    id: options.id,
    date,
    type,
    sets: seance.exercises.flatMap((exercise) =>
      setsForExercise(exercise, targets, plans.get(exercise.id)),
    ),
    accessories: seance.exercises
      .filter((exercise) => exercise.kind === 'optional')
      .map((exercise) => ({ exerciseId: exercise.id, done: false, note: '' })),
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    baseTargets: structuredClone(targets),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Un brouillon tel qu'il a pu être **écrit par une version antérieure** de l'app.
 *
 * Les brouillons ne passent par aucun schéma : ils sont relus tels qu'écrits. Un champ
 * ajouté est donc absent de toute ligne déjà en base, y compris celle d'une séance
 * ouverte au moment de la mise à jour.
 */
export type StoredDraft = Omit<Draft, 'keepAwake'> & Partial<Pick<Draft, 'keepAwake'>>

/**
 * Complète une ligne relue avec les champs apparus depuis qu'elle a été écrite.
 *
 * Le défaut est appliqué **au point de lecture**, une fois, plutôt que déclaré optionnel
 * dans le contrat : sinon chaque lecteur devrait penser à l'absence, et le premier qui
 * l'oublierait traiterait `undefined` comme une valeur. Après cette fonction, le type
 * `Draft` dit la vérité pour tout le monde en aval.
 */
export function hydrateDraft(row: StoredDraft): Draft {
  return { ...row, keepAwake: row.keepAwake ?? false }
}

/**
 * Un brouillon **jamais touché** : aucune série saisie, validée ou sautée, aucun
 * accessoire coché ou annoté, aucune note, aucun chrono lancé.
 *
 * Il ne porte donc aucune information. C'est ce qui autorise à le reconstruire sur
 * de nouvelles cibles sans rien perdre — la distinction entre « une séance est en
 * cours » et « l'app a ouvert un brouillon toute seule à l'affichage ».
 *
 * Le chrono compte : il n'est lancé que par la validation d'une série, donc un chrono
 * en cours prouve qu'une séance a commencé même si tout a été remis à `planned`
 * depuis. Mieux vaut refuser à tort que reconstruire une séance réelle.
 */
export function isBlankDraft(draft: Draft): boolean {
  return (
    draft.sets.every((set) => set.status === 'planned') &&
    draft.accessories.every((accessory) => !accessory.done && accessory.note.trim() === '') &&
    draft.notes.trim() === '' &&
    draft.timerEndsAt === null
  )
}
