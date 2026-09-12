/**
 * Accès à l'historique et au brouillon — CB-30.
 *
 * Deux implémentations du même contrat vivent côte à côte :
 *
 * - `DexieStore`, celle de l'app, adossée à IndexedDB ;
 * - `MemoryStore` (voir `memory.ts`), qui sert à développer l'écran de séance sans
 *   navigateur et à faire tourner la suite de tests de contrat.
 *
 * Le partage d'une suite de tests entre les deux est ce qui donne confiance : la
 * version en mémoire est vérifiée en CI, l'adaptateur Dexie l'est par le parcours
 * bout en bout de CB-42, dans un vrai navigateur. Aucune dépendance de test
 * supplémentaire n'a donc été nécessaire.
 */

import type { Draft, Seance, Targets } from '../domain/types.ts'
import type { CarnetStore } from './contracts.ts'
import { StoreError } from './contracts.ts'
import { TARGETS_KEY, type CarnetDatabase, db as defaultDb, ensureSeeded } from './database.ts'

/**
 * La part du contrat que CB-30 implémente : lecture de l'historique et cycle de vie
 * du brouillon. La création d'un brouillon pré-rempli et la finalisation arrivent
 * avec CB-31, parce qu'elles dépendent du moteur de progression.
 */
export type DraftStore = Pick<
  CarnetStore,
  'getTargets' | 'listSeances' | 'getSeance' | 'loadDraft' | 'saveDraft' | 'clearDraft'
>

export class DexieStore implements DraftStore {
  private readonly database: CarnetDatabase

  constructor(database: CarnetDatabase = defaultDb) {
    this.database = database
  }

  /** À appeler une fois au démarrage, avant toute lecture. */
  async ready(): Promise<void> {
    await ensureSeeded(this.database)
  }

  async getTargets(): Promise<Targets> {
    const row = await this.database.targets.get(TARGETS_KEY)
    if (!row) {
      throw new StoreError('storage-unavailable', "Les cibles n'ont pas été initialisées.")
    }
    const { key: _key, ...targets } = row
    return targets
  }

  /** Les séances les plus récentes d'abord : c'est l'ordre de lecture de l'historique. */
  async listSeances(): Promise<Seance[]> {
    const seances = await this.database.seances.orderBy('date').toArray()
    return seances.toReversed()
  }

  async getSeance(id: string): Promise<Seance | undefined> {
    return this.database.seances.get(id)
  }

  /**
   * Le brouillon en cours, s'il y en a un.
   *
   * Un seul à la fois : deux séances ouvertes en parallèle n'ont pas de sens, et
   * permettre l'ambiguïté compliquerait la finalisation pour rien. Si plusieurs
   * lignes traînent, la plus récente gagne.
   */
  async loadDraft(): Promise<Draft | undefined> {
    const drafts = await this.database.drafts.toArray()
    if (drafts.length === 0) return undefined
    return drafts.reduce((latest, draft) => (draft.updatedAt > latest.updatedAt ? draft : latest))
  }

  /**
   * Écrit le brouillon. Appelé à chaque frappe, à chaque validation, à chaque
   * démarrage de chrono : c'est ce qui fait qu'un rechargement ne perd rien.
   */
  async saveDraft(draft: Draft): Promise<void> {
    await this.database.drafts.put({ ...draft, updatedAt: Date.now() })
  }

  async clearDraft(): Promise<void> {
    await this.database.drafts.clear()
  }
}

/** L'instance utilisée par l'app. */
export const store = new DexieStore()
