import { useCallback, useEffect, useRef, useState } from 'react'
import type { CarnetStore } from '../../db/contracts'
import type { Draft, SetLog } from '../../domain/types'

export type DraftPort = Pick<CarnetStore, 'loadDraft' | 'saveDraft'>

type SetPatch = Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe'>>

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Échec de sauvegarde du brouillon')
}

/** `store` doit garder une identité stable pendant la durée de montage du composant. */
export function useDraftEditor(store: DraftPort) {
  const [draft, setDraft] = useState<Draft>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error>()
  const [saveError, setSaveError] = useState<Error>()
  const draftRef = useRef<Draft | undefined>(undefined)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
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
  }, [store])

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

  return {
    draft,
    loading,
    loadError,
    saveError,
    changeSet,
    validateSet: (setId: string) => setStatus(setId, 'validated'),
    skipSet: (setId: string) => setStatus(setId, 'skipped'),
    editSet: (setId: string) => setStatus(setId, 'entered'),
    flush: () => saveQueue.current.catch(() => undefined),
  }
}
