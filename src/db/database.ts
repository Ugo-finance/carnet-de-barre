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
import { empreinteCarnet } from './exchange.ts'
import { noterMutation, SAUVEGARDE_INITIALE, SAUVEGARDE_KEY } from './sauvegarde.ts'

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
    if (marker) {
      await migrerEtatSauvegarde(database)
      return { applied: false, seanceCount: await database.seances.count() }
    }

    const { seances, targets } = loadSeed()
    await database.seances.bulkPut(seances)
    await database.targets.put({ key: TARGETS_KEY, ...targets })
    await database.meta.put({
      key: SEEDED_KEY,
      value: { at: new Date().toISOString(), seanceCount: seances.length },
    })
    await migrerEtatSauvegarde(database)
    return { applied: true, seanceCount: seances.length }
  })
}

/**
 * Donne un état de sauvegarde aux bases écrites **avant** CB-79b — P1 de Codex sur #75.
 *
 * Le défaut qu'elle ferme visait la base réelle d'Ugo, pas un cas de corruption. Absence
 * de clé voulait dire « génération 0 », donc « rien n'a jamais été saisi », donc *rien à
 * envoyer*. Or sa base contient ses vraies séances, écrites par une version d'avant ce
 * lot. Son carnet ne serait donc parti **qu'à sa prochaine mutation** : jusque-là, une
 * perte de stockage aurait emporté exactement ce que la sauvegarde existe pour protéger,
 * et sans même afficher une attente.
 *
 * La distinction n'est donc pas « la clé existe-t-elle » mais **« ce carnet a-t-il déjà
 * divergé du dossier de départ »** :
 *
 * - identique à l'amorçage → génération 0, rien à envoyer. C'est la règle qui empêche des
 *   données de démonstration d'écraser une vraie sauvegarde distante ;
 * - différent, pour quelque raison que ce soit — séance ajoutée, corrigée, supprimée,
 *   cible ajustée, historique vidé volontairement → une génération en attente, et le
 *   carnet part dès que le distant a été lu.
 *
 * La comparaison porte sur le **contenu**, parce qu'une correction de séance ne change ni
 * le nombre ni les dates.
 *
 * Migration dans la transaction d'amorçage : elle lit les trois tables qui la décident, et
 * les verrous sont déjà pris ici.
 */
async function migrerEtatSauvegarde(database: CarnetDatabase): Promise<void> {
  if (await database.meta.get(SAUVEGARDE_KEY)) return

  const row = await database.targets.get(TARGETS_KEY)
  if (!row) return
  const { key: _key, ...targets } = row
  const seances = await database.seances.toArray()

  const amorce = loadSeed()
  const intact = empreinteCarnet({ seances, targets }) === empreinteCarnet(amorce)

  await database.meta.put({
    key: SAUVEGARDE_KEY,
    value: intact ? SAUVEGARDE_INITIALE : noterMutation(SAUVEGARDE_INITIALE),
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
