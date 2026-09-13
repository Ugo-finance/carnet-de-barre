/**
 * L'adaptateur Dexie, éprouvé sur une vraie IndexedDB — CB-30.
 *
 * `fake-indexeddb` fournit une implémentation complète de la spécification en mémoire,
 * ce qui permet de vérifier ce que `MemoryStore` ne peut pas prouver : le schéma, les
 * transactions, et le fait que les deux magasins respectent réellement les mêmes
 * règles. La suite de contrat est celle de `store.test.ts`, rejouée ici sur Dexie.
 *
 * Chaque test part d'une base au nom unique : aucune fuite d'état d'un test à l'autre.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CarnetDatabase, SEEDED_KEY, TARGETS_KEY, clearHistory, ensureSeeded } from './database.ts'
import { DexieStore } from './store.ts'
import type { Draft, Targets } from '../domain/types.ts'

let compteur = 0
function nouvelleBase(): CarnetDatabase {
  compteur += 1
  return new CarnetDatabase(`carnet-test-${compteur}`)
}

function draftFor(targets: Targets, overrides: Partial<Draft> = {}): Draft {
  const now = Date.now()
  return {
    id: 'brouillon-1',
    date: '2026-09-20',
    type: 'C',
    sets: [],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    baseTargets: targets,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('amorçage sur une vraie IndexedDB', () => {
  let database: CarnetDatabase

  beforeEach(() => {
    database = nouvelleBase()
  })

  it('écrit les douze séances, les cinq cibles et le marqueur', async () => {
    const outcome = await ensureSeeded(database)
    expect(outcome).toEqual({ applied: true, seanceCount: 12 })
    expect(await database.seances.count()).toBe(12)
    expect((await database.targets.get(TARGETS_KEY))?.squat.w).toBe(75)
    expect(await database.meta.get(SEEDED_KEY)).toBeDefined()
  })

  it('ne réimporte pas au second lancement', async () => {
    await ensureSeeded(database)
    const second = await ensureSeeded(database)
    expect(second.applied).toBe(false)
    expect(await database.seances.count()).toBe(12)
  })

  it('ne réimporte pas après un effacement volontaire de l’historique', async () => {
    await ensureSeeded(database)
    await clearHistory(database)
    expect(await database.seances.count()).toBe(0)
    await ensureSeeded(database)
    // Le marqueur survit à l'effacement : c'est tout l'intérêt de le loger dans `meta`.
    expect(await database.seances.count()).toBe(0)
  })

  it('indexe les séances par date et par type', async () => {
    await ensureSeeded(database)
    const seancesB = await database.seances.where('type').equals('B').toArray()
    expect(seancesB.length).toBeGreaterThan(0)
    const recentes = await database.seances.where('date').above('2026-09-01').toArray()
    expect(recentes.length).toBeGreaterThan(0)
  })
})

describe('DexieStore respecte le même contrat que MemoryStore', () => {
  let store: DexieStore
  let database: CarnetDatabase

  beforeEach(async () => {
    database = nouvelleBase()
    store = new DexieStore(database)
    await store.ready()
  })

  it('expose les douze séances de la plus récente à la plus ancienne', async () => {
    const dates = (await store.listSeances()).map((seance) => seance.date)
    expect(dates).toHaveLength(12)
    expect(dates[0]).toBe('2026-09-10')
    expect(dates[dates.length - 1]).toBe('2026-07-22')
  })

  it('rend les cibles sans la clé technique de ligne', async () => {
    const targets = await store.getTargets()
    expect(targets.squat.w).toBe(75)
    expect('key' in targets).toBe(false)
  })

  it('retrouve une séance par son identifiant', async () => {
    const [premiere] = await store.listSeances()
    expect((await store.getSeance(premiere.id))?.date).toBe(premiere.date)
    expect(await store.getSeance('inexistant')).toBeUndefined()
  })

  it('relit le brouillon qu’il a écrit', async () => {
    const targets = await store.getTargets()
    await store.saveDraft(draftFor(targets, { notes: 'jambes lourdes' }))
    expect((await store.loadDraft())?.notes).toBe('jambes lourdes')
  })

  it('n’en garde qu’un seul, même avec deux identifiants différents', async () => {
    // C'est précisément ce que l'implémentation en mémoire ne pouvait pas prouver :
    // avec un simple `put`, deux lignes auraient survécu ici.
    const targets = await store.getTargets()
    await store.saveDraft(draftFor(targets, { id: 'onglet-1', notes: 'premier' }))
    await store.saveDraft(draftFor(targets, { id: 'onglet-2', notes: 'second' }))
    expect(await database.drafts.count()).toBe(1)
    expect((await store.loadDraft())?.id).toBe('onglet-2')
  })

  it('efface le brouillon sans toucher à l’historique', async () => {
    const targets = await store.getTargets()
    await store.saveDraft(draftFor(targets))
    await store.clearDraft()
    expect(await store.loadDraft()).toBeUndefined()
    expect(await store.listSeances()).toHaveLength(12)
  })

  it('conserve l’échéance du chrono à travers un aller-retour en base', async () => {
    const targets = await store.getTargets()
    const echeance = Date.now() + 150_000
    await store.saveDraft(draftFor(targets, { timerEndsAt: echeance }))
    expect((await store.loadDraft())?.timerEndsAt).toBe(echeance)
  })

  it('conserve la préférence d’écran allumé à travers un aller-retour en base', async () => {
    const targets = await store.getTargets()
    await store.saveDraft(draftFor(targets, { keepAwake: true }))
    expect((await store.loadDraft())?.keepAwake).toBe(true)
  })

  it('relit un brouillon écrit avant l’existence du champ, écran éteint', async () => {
    // Écrit directement dans la table, sans le champ : c'est exactement la ligne que
    // laisse une version antérieure quand la PWA se met à jour séance ouverte.
    const targets = await store.getTargets()
    const { keepAwake: _absent, ...ancien } = draftFor(targets, { notes: 'avant la maj' })
    await database.drafts.put(ancien)

    const relu = await store.loadDraft()
    expect(relu?.notes).toBe('avant la maj')
    expect(relu?.keepAwake).toBe(false)
  })

  it('survit à une réouverture de la base, comme au redémarrage de l’app', async () => {
    const targets = await store.getTargets()
    await store.saveDraft(draftFor(targets, { notes: 'avant fermeture' }))
    database.close()

    const rouverte = new CarnetDatabase(database.name)
    const apres = new DexieStore(rouverte)
    await apres.ready()
    expect((await apres.loadDraft())?.notes).toBe('avant fermeture')
    expect(await apres.listSeances()).toHaveLength(12)
  })
})
