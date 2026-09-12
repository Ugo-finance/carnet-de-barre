import { useCallback, useEffect, useRef, useState } from 'react'
import type { CarnetStore } from '../../db/contracts'
import { findExercise } from '../../domain/program'
import { backoffWeight } from '../../domain/progression'
import type { AccessoryLog, Draft, SetLog } from '../../domain/types'
import { shiftedDeadline } from './timer'

export type DraftPort = Pick<CarnetStore, 'loadDraft' | 'saveDraft'>

type SetPatch = Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe'>>
type SetValue = Pick<SetLog, 'weight' | 'reps' | 'rpe' | 'status'>

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Échec de sauvegarde du brouillon')
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

          return current.sets.map((set) => {
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

  const validateSet = useCallback(
    (setId: string, value: SetValue, timer: { seconds: number; label: string }) => {
      commit((current) => ({
        ...current,
        sets: current.sets.map((set) =>
          set.id === setId ? { ...set, ...value, status: 'validated' } : set,
        ),
        timerEndsAt: Date.now() + timer.seconds * 1000,
        timerLabel: timer.label,
      }))
    },
    [commit],
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
    validateSet,
    skipSet: (setId: string) => setStatus(setId, 'skipped'),
    editSet: (setId: string) => setStatus(setId, 'entered'),
    adjustTimer,
    stopTimer,
    flush: () => saveQueue.current,
  }
}
