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
import type { ProgressionEvent, SeanceType } from '../domain/types.ts'
import type { CarnetStore, FinalizeResult } from './contracts.ts'
import { StoreError } from './contracts.ts'
import { TARGETS_KEY, type CarnetDatabase, db as defaultDb, ensureSeeded } from './database.ts'
import { buildDraft } from './draft.ts'
import { applyProgression, draftToSeance, targetsDiverged } from './derive.ts'

/**
 * Clé du journal des événements de progression d'une séance.
 *
 * Il vit dans `meta`, donc en local : il n'entre pas dans l'export, et n'oblige donc
 * pas à faire évoluer le format d'échange pour un besoin purement d'affichage.
 */
const eventsKey = (seanceId: string): string => `events:${seanceId}`

/**
 * La part du contrat implémentée à ce stade : lecture de l'historique et cycle de vie
 * complet d'une séance, de l'ouverture du brouillon à sa finalisation. L'édition de
 * l'historique et l'échange JSON arrivent avec CB-33 et CB-40.
 */
export type DraftStore = Pick<
  CarnetStore,
  | 'getTargets'
  | 'listSeances'
  | 'getSeance'
  | 'loadDraft'
  | 'openDraft'
  | 'saveDraft'
  | 'clearDraft'
  | 'finalizeSeance'
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
   *
   * **Remplacement, pas ajout.** Il n'existe jamais qu'un brouillon à la fois. Un
   * simple `put` laisserait deux lignes si deux onglets ouvraient chacun le leur avant
   * la première écriture : `loadDraft` masquerait la plus ancienne, et finaliser la
   * plus récente la ferait ressurgir. Le vidage et l'écriture tiennent donc dans une
   * transaction, ce qui aligne cet adaptateur sur l'implémentation en mémoire.
   */
  async saveDraft(draft: Draft): Promise<void> {
    const row = { ...draft, updatedAt: Date.now() }
    await this.database.transaction('rw', this.database.drafts, async () => {
      await this.database.drafts.clear()
      await this.database.drafts.put(row)
    })
  }

  async clearDraft(): Promise<void> {
    await this.database.drafts.clear()
  }

  /**
   * Rend le brouillon déjà ouvert, **quel que soit le type demandé**.
   *
   * Changer de sélecteur A/B/C ne doit jamais détruire une saisie en cours : D9 dit
   * que rien ne se perd, et une séance à moitié saisie effacée par un tap sur le
   * sélecteur serait la pire perte possible, en pleine salle. C'est à l'interface de
   * proposer explicitement d'abandonner via `clearDraft` avant d'en ouvrir une autre.
   */
  async openDraft(type: SeanceType, date: string): Promise<Draft> {
    const existing = await this.loadDraft()
    if (existing) return existing

    const targets = await this.getTargets()
    const draft = buildDraft(type, date, targets, { id: crypto.randomUUID() })
    await this.database.transaction('rw', this.database.drafts, async () => {
      await this.database.drafts.clear()
      await this.database.drafts.put(draft)
    })
    return draft
  }

  /**
   * Une transaction unique : la séance, les cibles et la fermeture du brouillon
   * partent ensemble ou pas du tout. Idempotente par construction, puisque la séance
   * porte l'identifiant du brouillon.
   */
  async finalizeSeance(draftId: string): Promise<FinalizeResult> {
    return this.database.transaction(
      'rw',
      this.database.seances,
      this.database.targets,
      this.database.drafts,
      // `meta` porte le journal des événements : l'oublier ici ferait lever Dexie
      // au premier enregistrement réel, une table hors portée étant interdite.
      this.database.meta,
      async () => {
        const existing = await this.database.seances.get(draftId)
        if (existing) {
          // Double tap, reprise après erreur, second onglet : on rend ce qui existe
          // déjà, sans progresser une deuxième fois. Les événements sont rejoués
          // depuis le journal, pour qu'une reprise réaffiche le récapitulatif.
          const row = await this.database.targets.get(TARGETS_KEY)
          if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
          const { key: _key, ...targets } = row
          const journal = await this.database.meta.get(eventsKey(draftId))
          await this.database.drafts.delete(draftId)
          return {
            seance: existing,
            targets,
            events: (journal?.value as ProgressionEvent[] | undefined) ?? [],
            applied: false,
          }
        }

        const draft = await this.database.drafts.get(draftId)
        if (!draft) {
          throw new StoreError('draft-not-found', 'Aucune séance en cours sous cet identifiant.')
        }

        const row = await this.database.targets.get(TARGETS_KEY)
        if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
        const { key: _key, ...current } = row

        // Un ajustement manuel fait pendant la séance ne doit pas être écrasé sans
        // qu'Ugo le sache : on refuse d'enregistrer et on garde le brouillon intact.
        if (targetsDiverged(draft.baseTargets, current)) {
          throw new StoreError(
            'stale-targets',
            'Les cibles ont été ajustées depuis le début de cette séance. Rouvre la séance avant d’enregistrer.',
          )
        }

        const seance = draftToSeance(draft)
        const { targets, events } = applyProgression(draft, current)

        await this.database.seances.put(seance)
        await this.database.targets.put({ key: TARGETS_KEY, ...targets })
        await this.database.meta.put({ key: eventsKey(seance.id), value: events })
        await this.database.drafts.delete(draftId)

        return { seance, targets, events, applied: true }
      },
    )
  }
}

/** L'instance utilisée par l'app. */
export const store = new DexieStore()
