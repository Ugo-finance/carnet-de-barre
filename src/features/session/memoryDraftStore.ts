import type { CarnetStore } from '../../db/contracts'
import type { Draft } from '../../domain/types'

export type DraftStore = Pick<CarnetStore, 'loadDraft' | 'saveDraft'>

export interface MemoryDraftStore extends DraftStore {
  inspectDraft(): Draft | undefined
}

function copyDraft(draft: Draft | undefined): Draft | undefined {
  return draft === undefined ? undefined : structuredClone(draft)
}

/** Adaptateur léger pour développer et tester la saisie avant l'arrivée de Dexie (CB-30). */
export function createMemoryDraftStore(initial?: Draft): MemoryDraftStore {
  let stored = copyDraft(initial)

  return {
    async loadDraft() {
      return copyDraft(stored)
    },
    async saveDraft(draft) {
      stored = copyDraft(draft)
    },
    inspectDraft() {
      return copyDraft(stored)
    },
  }
}
