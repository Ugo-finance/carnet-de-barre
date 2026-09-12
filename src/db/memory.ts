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

import type {
  Draft,
  LiftKey,
  ProgressionEvent,
  Seance,
  SeanceType,
  Targets,
} from '../domain/types.ts'
import { todayInZurich } from '../domain/schedule.ts'
import { applyTargetPatch, type TargetPatch } from './targets.ts'
import { StoreError, type FinalizeResult } from './contracts.ts'
import { loadSeed } from './seed.ts'
import { buildDraft } from './draft.ts'
import { applyProgression, draftToSeance, targetsDiverged } from './derive.ts'
import type { DraftStore } from './store.ts'

export class MemoryStore implements DraftStore {
  private seances: Seance[] = []
  private targets: Targets | null = null
  private draft: Draft | undefined
  private seeded = false
  /** Journal des événements de progression, par séance. Local, jamais exporté. */
  private readonly events = new Map<string, ProgressionEvent[]>()

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

  /**
   * Rend le brouillon déjà ouvert, **quel que soit le type demandé**.
   *
   * Changer de sélecteur A/B/C ne doit jamais détruire une saisie en cours : D9 dit
   * que rien ne se perd. C'est à l'interface de proposer explicitement d'abandonner
   * la séance en cours, via `clearDraft`, avant d'en ouvrir une autre.
   */
  async openDraft(type: SeanceType, date: string): Promise<Draft> {
    if (this.draft) return structuredClone(this.draft)
    const draft = buildDraft(type, date, await this.getTargets(), { id: crypto.randomUUID() })
    this.draft = draft
    return structuredClone(draft)
  }

  async finalizeSeance(draftId: string): Promise<FinalizeResult> {
    const already = this.seances.find((seance) => seance.id === draftId)
    if (already) {
      if (this.draft?.id === draftId) this.draft = undefined
      return {
        seance: structuredClone(already),
        targets: await this.getTargets(),
        // Rejoués depuis le journal : une reprise après réponse perdue doit pouvoir
        // réafficher le récapitulatif, pas une liste vide.
        events: structuredClone(this.events.get(draftId) ?? []),
        applied: false,
      }
    }

    const draft = this.draft?.id === draftId ? this.draft : undefined
    if (!draft) {
      throw new StoreError('draft-not-found', 'Aucune séance en cours sous cet identifiant.')
    }

    const current = await this.getTargets()
    if (targetsDiverged(draft.baseTargets, current)) {
      throw new StoreError(
        'stale-targets',
        'Les cibles ont été ajustées depuis le début de cette séance. Rouvre la séance avant d’enregistrer.',
      )
    }

    const seance = draftToSeance(draft)
    const { targets, events } = applyProgression(draft, current)

    this.seances = [...this.seances, seance]
    this.targets = targets
    this.events.set(seance.id, events)
    this.draft = undefined

    return {
      seance: structuredClone(seance),
      targets: structuredClone(targets),
      events,
      applied: true,
    }
  }

  async adjustTarget(lift: LiftKey, patch: TargetPatch): Promise<Targets> {
    const targets = applyTargetPatch(await this.getTargets(), lift, patch, this.today())
    this.targets = targets
    return structuredClone(targets)
  }

  /** Surchargeable dans les tests, pour dater l'ajustement de façon déterministe. */
  protected today(): string {
    return todayInZurich()
  }

  /** Efface l'historique sans réarmer l'amorçage, comme `clearHistory`. */
  async clearHistory(): Promise<void> {
    this.seances = []
    this.draft = undefined
  }
}
