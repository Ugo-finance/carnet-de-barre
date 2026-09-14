import { useCallback, useEffect, useRef, useState } from 'react'
import type { CarnetStore } from '../../db/contracts'
import { setId as warmupSetId } from '../../db/draft'
import { findExercise, type ExerciseDef } from '../../domain/program'
import { backoffWeight } from '../../domain/progression'
import type { AccessoryLog, Draft, SetLog } from '../../domain/types'
import { warmupPlan } from '../../domain/warmup'
import { shiftedDeadline } from './timer'

export type DraftPort = Pick<CarnetStore, 'loadDraft' | 'saveDraft'>

type SetPatch = Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe'>>
type SetValue = Pick<SetLog, 'weight' | 'reps' | 'rpe' | 'status'>
type TimerIntent = { seconds: number; label: string } | null

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Échec de sauvegarde du brouillon')
}

function withValidatedSet(
  current: Draft,
  setId: string,
  value: SetValue,
  timer: TimerIntent,
  now: number,
): Draft {
  return {
    ...current,
    sets: current.sets.map((set) =>
      set.id === setId ? { ...set, ...value, status: 'validated' } : set,
    ),
    ...(timer === null ? {} : { timerEndsAt: now + timer.seconds * 1000, timerLabel: timer.label }),
  }
}

/** La série dont la charge pilote les paliers de son exercice. */
function drivesWarmup(set: SetLog, exercise: ExerciseDef): boolean {
  return (
    set.index === 0 &&
    ((exercise.kind === 'topset' && set.role === 'top') ||
      (exercise.kind === 'volume' && set.role === 'volume') ||
      (exercise.kind === 'accessory' && set.role === 'accessory'))
  )
}

/**
 * Recalcule la partie encore vierge de la rampe, sans toucher à ce qu'Ugo a déjà manipulé.
 *
 * Le nombre de paliers peut changer à cible basse. Les paliers `planned` devenus inutiles
 * disparaissent et les nouveaux sont insérés avant le travail. Une ligne `entered`,
 * `validated` ou `skipped` reste en revanche strictement intacte, même si elle ne fait plus
 * partie du plan recalculé : elle décrit déjà un geste d'Ugo.
 */
function recalculateWarmups(
  sets: SetLog[],
  exercise: ExerciseDef,
  workWeight: number | null,
): SetLog[] {
  const exerciseSets = sets.filter((set) => set.exerciseId === exercise.id)
  const currentWarmups = exerciseSets.filter((set) => set.role === 'warmup')
  // « Legacy » qualifie le brouillon entier, jamais un exercice isolé. Une modification
  // peut légitimement vider la rampe d'un exercice (charge effacée ou plan écrasé sur la
  // charge de travail) ; les autres paliers du brouillon prouvent alors qu'il a été créé
  // par CB-56 et autorisent la rampe à réapparaître à la saisie suivante.
  if (!sets.some((set) => set.role === 'warmup')) return sets

  const plan = warmupPlan(exercise.warmup, exercise.loadKind, workWeight)

  const nextWarmups = plan.map((step, index): SetLog => {
    const current = currentWarmups.find((set) => set.index === index)
    if (current && current.status !== 'planned') return current
    if (current) return { ...current, weight: step.weight, reps: step.reps }

    return {
      id: warmupSetId(exercise.id, 'warmup', index),
      exerciseId: exercise.id,
      role: 'warmup',
      index,
      status: 'planned',
      loadKind: exercise.loadKind,
      weight: step.weight,
      reps: step.reps,
      rpe: null,
      targetWeight: step.weight,
      targetReps: step.reps,
    }
  })

  for (const current of currentWarmups) {
    if (current.index >= plan.length && current.status !== 'planned') nextWarmups.push(current)
  }
  nextWarmups.sort((left, right) => left.index - right.index)

  const firstExerciseIndex = sets.findIndex((set) => set.exerciseId === exercise.id)
  if (firstExerciseIndex < 0) return sets
  const withoutCurrentWarmups = (set: SetLog) =>
    set.exerciseId !== exercise.id || set.role !== 'warmup'

  return [
    ...sets.slice(0, firstExerciseIndex).filter(withoutCurrentWarmups),
    ...nextWarmups,
    ...sets.slice(firstExerciseIndex).filter(withoutCurrentWarmups),
  ]
}

/** `store` doit garder une identité stable pendant la durée de montage du composant. */
export function useDraftEditor(store: DraftPort, initialDraft?: Draft) {
  const [draft, setDraft] = useState<Draft | undefined>(initialDraft)
  const [loading, setLoading] = useState(initialDraft === undefined)
  const [loadError, setLoadError] = useState<Error>()
  const [saveError, setSaveError] = useState<Error>()
  const draftRef = useRef<Draft | undefined>(initialDraft)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (initialDraft) {
      return
    }

    let active = true

    store.loadDraft().then(
      (loaded) => {
        if (!active) return
        draftRef.current = loaded
        setDraft(loaded)
        setLoading(false)
      },
      (error: unknown) => {
        if (!active) return
        setLoadError(asError(error))
        setLoading(false)
      },
    )

    return () => {
      active = false
    }
  }, [initialDraft, store])

  const persist = useCallback(
    (next: Draft) => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => store.saveDraft(next))
      void saveQueue.current.then(
        () => setSaveError(undefined),
        (error: unknown) => setSaveError(asError(error)),
      )
    },
    [store],
  )

  const commit = useCallback(
    (update: (current: Draft) => Draft) => {
      const current = draftRef.current
      if (!current) return
      const next = { ...update(current), updatedAt: Date.now() }
      draftRef.current = next
      setDraft(next)
      persist(next)
    },
    [persist],
  )

  /**
   * Écrit avant de publier le nouvel état local. Le focus l'utilise pour que la carte
   * courante ne change jamais sur la simple intention d'écrire.
   */
  const commitAfterPersist = useCallback(
    async (update: (current: Draft) => Draft) => {
      const current = draftRef.current
      if (!current) throw new Error('Brouillon introuvable')
      const next = { ...update(current), updatedAt: Date.now() }
      const pending = saveQueue.current.catch(() => undefined).then(() => store.saveDraft(next))
      saveQueue.current = pending
      try {
        await pending
      } catch (error) {
        const failure = asError(error)
        setSaveError(failure)
        throw failure
      }
      draftRef.current = next
      setDraft(next)
      setSaveError(undefined)
    },
    [store],
  )

  const changeSet = useCallback(
    (setId: string, patch: SetPatch) => {
      commit((current) => ({
        ...current,
        sets: current.sets.map((set) =>
          set.id === setId
            ? {
                ...set,
                ...patch,
                status: set.status === 'planned' ? 'entered' : set.status,
              }
            : set,
        ),
      }))
    },
    [commit],
  )

  const setStatus = useCallback(
    (setId: string, status: SetLog['status']) => {
      commit((current) => ({
        ...current,
        sets: current.sets.map((set) => (set.id === setId ? { ...set, status } : set)),
      }))
    },
    [commit],
  )

  const updateSet = useCallback(
    (setId: string, value: SetValue) => {
      commit((current) => ({
        ...current,
        sets: (() => {
          const changed = current.sets.find((set) => set.id === setId)
          const exercise = changed ? findExercise(changed.exerciseId) : undefined
          const nextBackoff =
            changed?.role === 'top' && exercise?.backoff && changed.weight !== value.weight
              ? value.weight === null
                ? null
                : backoffWeight(value.weight, exercise.backoff)
              : undefined

          const withWarmups =
            changed &&
            exercise &&
            changed.weight !== value.weight &&
            drivesWarmup(changed, exercise)
              ? recalculateWarmups(current.sets, exercise, value.weight)
              : current.sets

          return withWarmups.map((set) => {
            if (set.id === setId) return { ...set, ...value }
            if (
              nextBackoff !== undefined &&
              set.exerciseId === changed?.exerciseId &&
              set.role === 'backoff' &&
              set.status === 'planned'
            ) {
              return { ...set, weight: nextBackoff }
            }
            return set
          })
        })(),
      }))
    },
    [commit],
  )

  const updateAccessory = useCallback(
    (exerciseId: string, value: Pick<AccessoryLog, 'done' | 'note'>) => {
      commit((current) => ({
        ...current,
        accessories: current.accessories.map((accessory) =>
          accessory.exerciseId === exerciseId ? { ...accessory, ...value } : accessory,
        ),
      }))
    },
    [commit],
  )

  const updateNotes = useCallback(
    (notes: string) => {
      commit((current) => ({ ...current, notes }))
    },
    [commit],
  )

  const updateKeepAwake = useCallback(
    (keepAwake: boolean) => {
      commit((current) => ({ ...current, keepAwake }))
    },
    [commit],
  )

  /**
   * Valide une série, et n'arme le chrono que si la série en demande un.
   *
   * `timer` vaut `null` pour un palier d'échauffement, et le repos en cours est alors
   * laissé **exactement** tel quel : ni créé, ni remplacé, ni effacé. C'est la règle du
   * contrat d'interaction (CB-60, § 4), et elle a une raison concrète — en séance A, la
   * carte qui suit la dernière série de développé volume est un palier de tractions, et
   * Ugo la valide pendant ses 150 s de récupération. Écraser l'échéance à ce moment lui
   * retirerait son repos ; en créer une lui en donnerait un qu'il n'a pas demandé.
   */
  const validateSet = useCallback(
    (setId: string, value: SetValue, timer: TimerIntent) => {
      const now = Date.now()
      commit((current) => withValidatedSet(current, setId, value, timer, now))
    },
    [commit],
  )

  const validateSetAfterPersist = useCallback(
    (setId: string, value: SetValue, timer: TimerIntent) => {
      const now = Date.now()
      return commitAfterPersist((current) => withValidatedSet(current, setId, value, timer, now))
    },
    [commitAfterPersist],
  )

  const skipSetAfterPersist = useCallback(
    (setId: string) =>
      commitAfterPersist((current) => ({
        ...current,
        sets: current.sets.map((set) => (set.id === setId ? { ...set, status: 'skipped' } : set)),
      })),
    [commitAfterPersist],
  )

  const adjustTimer = useCallback(
    (deltaMs: number) => {
      commit((current) => ({
        ...current,
        timerEndsAt:
          current.timerEndsAt === null
            ? null
            : shiftedDeadline(current.timerEndsAt, deltaMs, Date.now()),
      }))
    },
    [commit],
  )

  const stopTimer = useCallback(() => {
    commit((current) => ({ ...current, timerEndsAt: null, timerLabel: null }))
  }, [commit])

  return {
    draft,
    loading,
    loadError,
    saveError,
    changeSet,
    updateSet,
    updateAccessory,
    updateNotes,
    updateKeepAwake,
    validateSet,
    validateSetAfterPersist,
    skipSet: (setId: string) => setStatus(setId, 'skipped'),
    skipSetAfterPersist,
    editSet: (setId: string) => setStatus(setId, 'entered'),
    adjustTimer,
    stopTimer,
    flush: () => saveQueue.current,
  }
}
