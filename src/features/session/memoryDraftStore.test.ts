import type { Draft } from '../../domain/types'
import { createMemoryDraftStore } from './memoryDraftStore'

function draftFixture(): Draft {
  return {
    id: 'draft-1',
    date: '2026-09-12',
    type: 'A',
    sets: [],
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

describe('createMemoryDraftStore', () => {
  it('conserve le brouillon sans partager de référence mutable', async () => {
    const original = draftFixture()
    const store = createMemoryDraftStore(original)

    original.notes = 'mutation extérieure'
    const loaded = await store.loadDraft()
    expect(loaded?.notes).toBe('')

    loaded!.notes = 'mutation de lecture'
    expect(store.inspectDraft()?.notes).toBe('')
  })
})
