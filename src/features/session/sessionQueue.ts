import type { ExerciseDef } from '../../domain/program'
import type { Draft, SetLog } from '../../domain/types'
import { exercicesActifs } from '../../db/selectors'

export type SessionQueueItem = {
  exercise: ExerciseDef
  set: SetLog
  optional: boolean
  supersetPartner?: string
}

export type SessionQueueProgress = {
  completed: number
  total: number
}

type ExerciseSets = {
  exercise: ExerciseDef
  warmups: SetLog[]
  working: SetLog[]
}

function setsFor(exercise: ExerciseDef, draft: Pick<Draft, 'sets'>): ExerciseSets {
  const sets = draft.sets.filter((set) => set.exerciseId === exercise.id)
  return {
    exercise,
    warmups: sets.filter((set) => set.role === 'warmup'),
    working: sets.filter((set) => set.role !== 'warmup'),
  }
}

function queueItem(
  { exercise }: ExerciseSets,
  set: SetLog,
  supersetPartner?: string,
): SessionQueueItem {
  return {
    exercise,
    set,
    optional: exercise.optional ?? false,
    ...(supersetPartner ? { supersetPartner } : {}),
  }
}

function appendExercise(queue: SessionQueueItem[], member: ExerciseSets): void {
  for (const set of [...member.warmups, ...member.working]) {
    queue.push(queueItem(member, set))
  }
}

function appendSuperset(queue: SessionQueueItem[], members: ExerciseSets[]): void {
  const rounds = Math.max(0, ...members.map((member) => member.working.length))

  for (let round = 0; round < rounds; round += 1) {
    for (const member of members) {
      const partner = members
        .filter((candidate) => candidate.exercise.id !== member.exercise.id)
        .map((candidate) => candidate.exercise.label)
        .join(' · ')

      if (round === 0) {
        for (const warmup of member.warmups) {
          queue.push(queueItem(member, warmup, partner))
        }
      }

      const working = member.working[round]
      if (working) queue.push(queueItem(member, working, partner))
    }
  }
}

/**
 * Projette le brouillon dans l'ordre d'exécution sans créer de second état métier.
 * Les objets `SetLog` rendus sont ceux du brouillon ; leur statut reste la seule
 * source de vérité pour la série courante et l'avancement.
 */
export function buildSessionQueue(
  draft: Pick<Draft, 'type' | 'sets' | 'rushed'>,
): SessionQueueItem[] {
  const exercises = exercicesActifs(draft.type, draft.rushed)
  const queue: SessionQueueItem[] = []

  for (let index = 0; index < exercises.length;) {
    const exercise = exercises[index]!
    const group = exercise.supersetGroup

    if (!group) {
      appendExercise(queue, setsFor(exercise, draft))
      index += 1
      continue
    }

    const definitions: ExerciseDef[] = []
    while (index < exercises.length && exercises[index]?.supersetGroup === group) {
      definitions.push(exercises[index]!)
      index += 1
    }

    const members = definitions.map((member) => setsFor(member, draft))
    if (members.length === 1) appendExercise(queue, members[0]!)
    else appendSuperset(queue, members)
  }

  return queue
}

/** Première série encore à faire ou à confirmer après une saisie. */
export function currentSessionQueueItem(
  queue: readonly SessionQueueItem[],
): SessionQueueItem | null {
  return queue.find(({ set }) => set.status === 'planned' || set.status === 'entered') ?? null
}

/** Avancement d'interface, échauffements compris, sur la seule file active. */
export function sessionQueueProgress(queue: readonly SessionQueueItem[]): SessionQueueProgress {
  return {
    completed: queue.filter(({ set }) => set.status === 'validated' || set.status === 'skipped')
      .length,
    total: queue.length,
  }
}
