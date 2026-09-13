/**
 * Base locale — CB-30.
 *
 * IndexedDB via Dexie, dans le navigateur d'Ugo. Aucun serveur, aucun compte : les
 * données d'entraînement ne quittent le téléphone que par l'export JSON.
 *
 * L'amorçage avec l'historique de départ est **atomique et marqué** : soit les douze
 * séances et les cinq cibles sont écrites ensemble, soit rien ne l'est. Le marqueur
 * vit dans `meta`, qu'un effacement volontaire de l'historique ne touche pas — vider
 * sa base ne doit pas faire réapparaître le seed au lancement suivant.
 */

// eslint-disable-next-line import/no-named-as-default -- Dexie s'étend par héritage de son export par défaut.
import Dexie, { type Table } from 'dexie'
import type { Seance, Targets } from '../domain/types.ts'
import type { StoredDraft } from './draft.ts'
import { loadSeed } from './seed.ts'

/** Clé de la ligne unique qui porte les cibles courantes. */
export const TARGETS_KEY = 'current'

/** Clé du marqueur d'amorçage. */
export const SEEDED_KEY = 'seeded'

/** Les cibles occupent une seule ligne, repérée par une clé constante. */
export type TargetsRow = Targets & { key: string }

export interface MetaRow {
  key: string
  value: unknown
}

export class CarnetDatabase extends Dexie {
  seances!: Table<Seance, string>
  targets!: Table<TargetsRow, string>
  drafts!: Table<StoredDraft, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'carnet') {
    super(name)
    // Version 1. Toute évolution ajoute une version, jamais ne réécrit celle-ci :
    // une migration Dexie doit pouvoir se rejouer sur la base d'un téléphone déjà
    // en service sans perdre son historique.
    this.version(1).stores({
      seances: 'id, date, type',
      targets: 'key',
      drafts: 'id',
      meta: 'key',
    })
  }
}

/** L'instance utilisée par l'app. Les tests en créent d'autres, nommées différemment. */
export const db = new CarnetDatabase()

export interface SeedOutcome {
  /** `true` si l'amorçage a effectivement écrit, `false` s'il avait déjà eu lieu. */
  applied: boolean
  seanceCount: number
}

/**
 * Écrit l'historique de départ si et seulement si il ne l'a jamais été.
 *
 * Une seule transaction : une coupure en plein import ne peut pas laisser six séances
 * et pas de cibles. Le marqueur est écrit dans la même transaction que les données,
 * donc il ne peut pas mentir.
 */
export async function ensureSeeded(database: CarnetDatabase = db): Promise<SeedOutcome> {
  return database.transaction('rw', database.seances, database.targets, database.meta, async () => {
    const marker = await database.meta.get(SEEDED_KEY)
    if (marker) return { applied: false, seanceCount: await database.seances.count() }

    const { seances, targets } = loadSeed()
    await database.seances.bulkPut(seances)
    await database.targets.put({ key: TARGETS_KEY, ...targets })
    await database.meta.put({
      key: SEEDED_KEY,
      value: { at: new Date().toISOString(), seanceCount: seances.length },
    })
    return { applied: true, seanceCount: seances.length }
  })
}

/**
 * Efface l'historique et les brouillons **sans** effacer le marqueur d'amorçage.
 *
 * C'est ce que doit appeler un « repartir de zéro » dans les réglages : l'utilisateur
 * veut une base vide, pas le seed de nouveau.
 */
export async function clearHistory(database: CarnetDatabase = db): Promise<void> {
  await database.transaction('rw', database.seances, database.drafts, async () => {
    await database.seances.clear()
    await database.drafts.clear()
  })
}
