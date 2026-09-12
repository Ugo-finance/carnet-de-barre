import { act, renderHook, waitFor } from '@testing-library/react'
import type { Draft } from '../../domain/types'
import { type DraftPort, useDraftEditor } from './useDraftEditor'

function draftFixture(): Draft {
  return {
    id: 'draft-1',
    date: '2026-09-12',
    type: 'A',
    sets: [
      {
        id: 'set-1',
        exerciseId: 'a-squat',
        role: 'top',
        index: 0,
        status: 'planned',
        loadKind: 'barTotal',
        weight: 75,
        reps: 4,
        rpe: null,
        targetWeight: 75,
        targetReps: 4,
      },
    ],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    baseTargets: {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    },
    createdAt: 1,
    updatedAt: 1,
  }
}

function createMemoryDraftPort(initial: Draft): DraftPort {
  let stored = structuredClone(initial)
  return {
    async loadDraft() {
      return structuredClone(stored)
    },
    async saveDraft(draft) {
      stored = structuredClone(draft)
    },
  }
}

describe('useDraftEditor', () => {
  it('valide une série préremplie en un tap et appelle saveDraft une fois', async () => {
    const initial = draftFixture()
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: null, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledOnce()
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: [expect.objectContaining({ status: 'validated' })],
        timerEndsAt: expect.any(Number),
        timerLabel: 'Récup Squat',
      }),
    )
  })

  it('restaure après remontage chaque modification déjà sauvegardée', async () => {
    const store = createMemoryDraftPort(draftFixture())
    const first = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    act(() => first.result.current.changeSet('set-1', { weight: 77.5 }))
    await act(() => first.result.current.flush())
    first.unmount()

    const second = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.draft?.sets[0]).toMatchObject({ weight: 77.5, status: 'entered' })
  })

  it('sérialise les sauvegardes pour que la dernière saisie gagne', async () => {
    const persisted: number[] = []
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft: async (draft) => {
        await Promise.resolve()
        persisted.push(draft.sets[0].weight!)
      },
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.changeSet('set-1', { weight: 77.5 })
      result.current.changeSet('set-1', { weight: 80 })
    })
    await act(() => result.current.flush())

    expect(persisted).toEqual([77.5, 80])
  })

  it('persiste les notes au fil de la saisie', async () => {
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const initial = draftFixture()
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() => result.current.updateNotes('Sommeil court, sensations correctes'))
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Sommeil court, sensations correctes' }),
    )
  })

  it('expose une erreur de sauvegarde et empêche une action dépendante de continuer', async () => {
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft: vi.fn().mockRejectedValue(new Error('quota')),
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: null, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await expect(result.current.flush()).rejects.toThrow('quota')

    await waitFor(() => expect(result.current.saveError?.message).toBe('quota'))
  })

  it('écrit la valeur complète renvoyée par une carte de série', async () => {
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft,
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 77.5,
        reps: 4,
        rpe: 8,
        status: 'validated',
      }),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: [expect.objectContaining({ weight: 77.5, reps: 4, rpe: 8, status: 'validated' })],
      }),
    )
  })

  it('recalcule seulement les backoffs encore vierges quand le top set change', async () => {
    const initial = draftFixture()
    initial.sets.push(
      {
        ...initial.sets[0],
        id: 'backoff-planned',
        role: 'backoff',
        index: 0,
        weight: 67.5,
        reps: 5,
        targetWeight: 67.5,
        targetReps: 5,
      },
      {
        ...initial.sets[0],
        id: 'backoff-entered',
        role: 'backoff',
        index: 1,
        status: 'entered',
        weight: 65,
        reps: 5,
        targetWeight: 67.5,
        targetReps: 5,
      },
    )
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 80,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const saved = saveDraft.mock.calls[0][0]
    expect(saved.sets.find((set) => set.id === 'backoff-planned')).toMatchObject({
      weight: 72.5,
      status: 'planned',
      targetWeight: 67.5,
    })
    expect(saved.sets.find((set) => set.id === 'backoff-entered')).toMatchObject({
      weight: 65,
      status: 'entered',
    })
  })

  it('persiste l’échéance, permet ±30 s et arrête le chrono', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T14:00:00Z'))
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const initial = draftFixture()
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      timerEndsAt: Date.now() + 150_000,
      timerLabel: 'Récup Squat',
    })

    act(() => result.current.adjustTimer(30_000))
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0].timerEndsAt).toBe(Date.now() + 180_000)

    act(() => result.current.stopTimer())
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      timerEndsAt: null,
      timerLabel: null,
    })
    vi.useRealTimers()
  })

  it('corrige une série validée sans remplacer la récupération en cours', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T14:00:00Z'))
    const initial = draftFixture()
    initial.sets[0].status = 'validated'
    initial.timerEndsAt = Date.now() + 60_000
    initial.timerLabel = 'Récup Développé couché'
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    // « Modifier » repasse d'abord la série en saisie, puis « Valider » confirme la
    // correction. Ce second geste ne doit ni remplacer ni prolonger le chrono actif.
    act(() =>
      result.current.updateSet('set-1', {
        weight: 77.5,
        reps: 4,
        rpe: 8,
        status: 'entered',
      }),
    )
    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 77.5, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      sets: [expect.objectContaining({ weight: 77.5, status: 'validated' })],
      timerEndsAt: initial.timerEndsAt,
      timerLabel: 'Récup Développé couché',
    })
    vi.useRealTimers()
  })

  it('ne lance pas de chrono en revalidant une série corrigée après la récupération', async () => {
    const initial = draftFixture()
    initial.sets[0].status = 'validated'
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 77.5,
        reps: 4,
        rpe: 8,
        status: 'entered',
      }),
    )
    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 77.5, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      timerEndsAt: null,
      timerLabel: null,
    })
  })
})
