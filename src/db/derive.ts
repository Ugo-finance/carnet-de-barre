/**
 * Du brouillon à la séance — CB-31.
 *
 * Deux opérations, toutes deux **pures**, ce qui permet de les tester sans base :
 *
 * - `deriveSeance` transforme un brouillon en séance enregistrable, en fabriquant les
 *   `lines` lisibles et les `tops` que consomment l'historique et l'export vers Claude ;
 * - `applyProgression` fait passer les réalisations dans le moteur et rend les
 *   nouvelles cibles avec les événements à afficher.
 *
 * Une seule règle gouverne les deux : **seules les séries `validated` comptent**. Une
 * série restée pré-remplie ou explicitement sautée n'entre ni dans le résumé, ni dans
 * la progression. C'est ce qui empêche une valeur suggérée de devenir une performance.
 */

import { LIFTS, findExercise } from '../domain/program.ts'
import { applyTopSet, applyVolumeSets, type Attempt } from '../domain/progression.ts'
import { formatNumber, formatRpe } from '../domain/format.ts'
import type {
  Draft,
  LiftKey,
  ProgressionEvent,
  Seance,
  SetLog,
  Targets,
  TopRecord,
} from '../domain/types.ts'

/** Les séries réellement faites, dans l'ordre de la séance. */
export function validatedSets(draft: Draft): SetLog[] {
  return draft.sets.filter((set) => set.status === 'validated' && set.weight != null)
}

function asAttempt(set: SetLog): Attempt {
  return { weight: set.weight, reps: set.reps, rpe: set.rpe }
}

/** Regroupe les séries validées par exercice, en gardant l'ordre du programme. */
function groupByExercise(sets: SetLog[]): Map<string, SetLog[]> {
  const groups = new Map<string, SetLog[]>()
  for (const set of sets) {
    const existing = groups.get(set.exerciseId)
    if (existing) existing.push(set)
    else groups.set(set.exerciseId, [set])
  }
  return groups
}

/**
 * Charge en notation compacte, celle des lignes historiques du seed : « 75 », « +15 »,
 * « 20 kg/haltère ». Le « kg » est sous-entendu sur la barre, comme Ugo l'écrivait à la
 * main, et c'est cette notation que la tâche Outlook relit.
 */
function compactLoad(weight: number | null, loadKind: SetLog['loadKind']): string {
  if (weight == null) return '?'
  if (loadKind === 'added') return `+${formatNumber(weight)}`
  if (loadKind === 'perDumbbell') return `${formatNumber(weight)} kg/haltère`
  return formatNumber(weight)
}

/** « Squat : 75×4 @8 | 67,5×5 | 67,5×5 » — le format de l'historique et de l'export. */
function lineFor(exerciseId: string, sets: SetLog[]): string | null {
  const exercise = findExercise(exerciseId)
  if (!exercise || sets.length === 0) return null

  const label = exercise.lift ? LIFTS[exercise.lift].label : exercise.label
  const parts = sets.map((set) => {
    const reps = set.reps == null ? '?' : formatNumber(set.reps)
    const base =
      set.loadKind === 'bodyweight'
        ? `${reps} reps`
        : `${compactLoad(set.weight, set.loadKind)}×${reps}`
    return set.rpe == null ? base : `${base} @${formatRpe(set.rpe)}`
  })
  return `${label} : ${parts.join(' | ')}`
}

/**
 * Le top set d'un lift sur cette séance : la série de rôle `top`, ou à défaut la
 * plus lourde des séries validées. Pour un schéma à volume, c'est la plus légère qui
 * fait foi, puisque la progression exige que les trois séries tiennent la charge.
 */
function topRecordFor(lift: LiftKey, sets: SetLog[]): TopRecord | null {
  if (sets.length === 0) return null

  if (lift === 'benchVol') {
    const lightest = sets.reduce((min, set) => (set.weight! < min.weight! ? set : min))
    return { w: lightest.weight, reps: lightest.reps, rpe: lightest.rpe }
  }

  const top = sets.find((set) => set.role === 'top')
  const chosen = top ?? sets.reduce((max, set) => (set.weight! > max.weight! ? set : max))
  return { w: chosen.weight, reps: chosen.reps, rpe: chosen.rpe }
}

export interface DerivedSeance {
  lines: string[]
  tops: Partial<Record<LiftKey, TopRecord>>
}

/** Fabrique le résumé lisible et les tops, à partir des seules séries validées. */
export function deriveSeance(draft: Draft): DerivedSeance {
  const groups = groupByExercise(validatedSets(draft))
  const lines: string[] = []
  const tops: Partial<Record<LiftKey, TopRecord>> = {}

  // L'ordre du programme, pas l'ordre de saisie : le résumé doit se relire comme la séance.
  for (const [exerciseId, sets] of groups) {
    const line = lineFor(exerciseId, sets)
    if (line) lines.push(line)

    const exercise = findExercise(exerciseId)
    if (!exercise?.lift) continue
    const record = topRecordFor(exercise.lift, sets)
    if (record) tops[exercise.lift] = record
  }

  for (const accessory of draft.accessories) {
    if (!accessory.done && accessory.note.trim() === '') continue
    const exercise = findExercise(accessory.exerciseId)
    const label = exercise?.label ?? accessory.exerciseId
    lines.push(accessory.note.trim() === '' ? `${label} ✓` : `${label} : ${accessory.note.trim()}`)
  }

  return { lines, tops }
}

export interface ProgressionResult {
  targets: Targets
  events: ProgressionEvent[]
}

/**
 * Passe les réalisations dans le moteur.
 *
 * Part des cibles **courantes**, pas de `baseTargets` : si Ugo a ajusté une cible à la
 * main pendant la séance, c'est son ajustement qui fait foi, pas l'état figé à
 * l'ouverture du brouillon.
 */
export function applyProgression(draft: Draft, current: Targets): ProgressionResult {
  const groups = groupByExercise(validatedSets(draft))
  let targets = structuredClone(current)
  const events: ProgressionEvent[] = []

  for (const [exerciseId, sets] of groups) {
    const exercise = findExercise(exerciseId)
    if (!exercise?.lift) continue
    const lift = exercise.lift

    if (exercise.kind === 'volume') {
      const outcome = applyVolumeSets(lift, targets[lift], sets.map(asAttempt))
      if (!outcome) continue
      targets = { ...targets, [lift]: outcome.target }
      events.push(outcome.event)
      continue
    }

    if (exercise.kind !== 'topset') continue

    // Seul le top set pilote la progression. Les backoffs sont une conséquence de la
    // charge du jour, jamais une cause : les faire entrer dans la règle ferait
    // régresser la cible à chaque séance.
    const top = sets.find((set) => set.role === 'top')
    if (!top) continue

    const outcome = applyTopSet(lift, targets[lift], asAttempt(top))
    if (!outcome) continue
    targets = { ...targets, [lift]: outcome.target }
    events.push(outcome.event)
  }

  if (events.length > 0) targets = { ...targets, updatedAt: draft.date }
  return { targets, events }
}

/** Assemble la séance définitive. L'identifiant est celui du brouillon : voir `finalizeSeance`. */
export function draftToSeance(draft: Draft, now = Date.now()): Seance {
  const { lines, tops } = deriveSeance(draft)
  return {
    id: draft.id,
    date: draft.date,
    type: draft.type,
    lines,
    tops,
    notes: draft.notes.trim(),
    sets: draft.sets.filter((set) => set.status === 'validated' || set.status === 'skipped'),
    accessories: draft.accessories.filter(
      (accessory) => accessory.done || accessory.note.trim() !== '',
    ),
    ts: now,
  }
}
