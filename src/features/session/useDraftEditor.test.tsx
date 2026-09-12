import { act, renderHook, waitFor } from '@testing-library/react'
import type { Draft } from '../../domain/types'
import { createMemoryDraftStore, type DraftStore } from './memoryDraftStore'
import { useDraftEditor } from './useDraftEditor'

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

describe('useDraftEditor', () => {
  it('valide une série préremplie en un tap et appelle saveDraft une fois', async () => {
    const initial = draftFixture()
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftStore = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.validateSet('set-1'))
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledOnce()
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ sets: [expect.objectContaining({ status: 'validated' })] }),
    )
  })

  it('restaure après remontage chaque modification déjà sauvegardée', async () => {
    const store = createMemoryDraftStore(draftFixture())
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
    const store: DraftStore = {
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
})
