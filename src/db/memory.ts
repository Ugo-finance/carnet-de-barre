/**
 * Implémentation en mémoire du même contrat — CB-30.
 *
 * Deux usages, et un seul code :
 *
 * - **développer l'écran de séance sans navigateur ni base**, le temps que CB-31 et
 *   CB-41 arrivent. Codex peut brancher `MemoryStore` sur ses composants et vérifier
 *   le cycle brouillon complet dans un test de composant ;
 * - **faire tourner la suite de tests de contrat** en CI, où IndexedDB n'existe pas.
 *
 * Elle n'est pas un bouchon : elle respecte les mêmes règles que la version Dexie,
 * amorçage compris. Si les deux divergent, c'est un défaut, pas une facilité.
 */

import type { Draft, Seance, Targets } from '../domain/types.ts'
import { StoreError } from './contracts.ts'
import { loadSeed } from './seed.ts'
import type { DraftStore } from './store.ts'

export class MemoryStore implements DraftStore {
  private seances: Seance[] = []
  private targets: Targets | null = null
  private draft: Draft | undefined
  private seeded = false

  /** Amorçage à l'identique de `ensureSeeded` : une seule fois, marqueur compris. */
  async ready(): Promise<void> {
    if (this.seeded) return
    const { seances, targets } = loadSeed()
    this.seances = seances
    this.targets = targets
    this.seeded = true
  }

  async getTargets(): Promise<Targets> {
    if (!this.targets) {
      throw new StoreError('storage-unavailable', "Les cibles n'ont pas été initialisées.")
    }
    return structuredClone(this.targets)
  }

  async listSeances(): Promise<Seance[]> {
    return structuredClone(this.seances).toSorted((a, b) => b.date.localeCompare(a.date))
  }

  async getSeance(id: string): Promise<Seance | undefined> {
    const found = this.seances.find((seance) => seance.id === id)
    return found ? structuredClone(found) : undefined
  }

  async loadDraft(): Promise<Draft | undefined> {
    return this.draft ? structuredClone(this.draft) : undefined
  }

  /** Remplacement, jamais ajout : il n'existe qu'un brouillon à la fois. */
  async saveDraft(draft: Draft): Promise<void> {
    this.draft = { ...structuredClone(draft), updatedAt: Date.now() }
  }

  async clearDraft(): Promise<void> {
    this.draft = undefined
  }

  /** Efface l'historique sans réarmer l'amorçage, comme `clearHistory`. */
  async clearHistory(): Promise<void> {
    this.seances = []
    this.draft = undefined
  }
}
