/**
 * L'ajustement manuel, éprouvé sur une vraie IndexedDB — CB-33.
 *
 * Ces tests existent pour la même raison que ceux de la finalisation : une transaction
 * Dexie qui écrit dans une table absente de sa portée lève, et la suite en mémoire ne
 * peut pas le voir puisqu'il n'y a pas de portée en mémoire. `adjustTarget` écrit
 * désormais dans `targets` **et** `meta` ; seule la vraie base prouve que les deux y
 * sont, que l'écriture est atomique, et qu'elle survit à une réouverture.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'

let compteur = 0
const nouvelleBase = (): CarnetDatabase => {
  compteur += 1
  return new CarnetDatabase(`carnet-cibles-${compteur}`)
}

async function magasinPret(): Promise<{ base: CarnetDatabase; store: DexieStore }> {
  const base = nouvelleBase()
  const store = new DexieStore(base)
  await store.ready()
  return { base, store }
}

describe('ajustement manuel sur une vraie base', () => {
  it('écrit la cible et sa trace sans sortir de la portée transactionnelle', async () => {
    // Sans `meta` dans la portée, Dexie lèverait ici — et il l'aurait fait au premier
    // ajustement réel sur le téléphone, jamais avant.
    const { store } = await magasinPret()

    const apres = await store.adjustTarget('squat', { w: 77.5 })

    expect(apres.squat.w).toBe(77.5)
    const journal = await store.listTargetAdjustments()
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ lift: 'squat', after: { w: 77.5 } })
    expect(journal[0].before.w).toBe(75)
  })

  it('date la trace du jour, comme la cible elle-même', async () => {
    const { store } = await magasinPret()

    const apres = await store.adjustTarget('deadlift', { w: 85 })
    const [trace] = await store.listTargetAdjustments()

    expect(trace.at).toBe(apres.updatedAt)
    expect(trace.at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('empile les ajustements dans l’ordre, sans écraser les précédents', async () => {
    const { store } = await magasinPret()

    await store.adjustTarget('squat', { w: 77.5 })
    await store.adjustTarget('bench', { w: 72.5 })
    await store.adjustTarget('squat', { w: 80 })

    const journal = await store.listTargetAdjustments()
    expect(journal.map((trace) => [trace.lift, trace.after.w])).toEqual([
      ['squat', 77.5],
      ['bench', 72.5],
      ['squat', 80],
    ])
    // La trace précédente garde bien l'état d'avant, pas l'état courant.
    expect(journal[2].before.w).toBe(77.5)
  })

  it('survit à une réouverture de la base', async () => {
    // Le journal ne sert à rien s'il disparaît en fermant l'app : c'est précisément
    // des semaines plus tard qu'on lui demandera pourquoi une cible est là.
    const { base, store } = await magasinPret()
    await store.adjustTarget('tractions', { w: 17.5 })
    base.close()

    const rouverte = new CarnetDatabase(base.name)
    const journal = await new DexieStore(rouverte).listTargetAdjustments()

    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ lift: 'tractions', after: { w: 17.5 } })
  })

  it('n’écrit rien du tout quand l’ajustement est refusé', async () => {
    // Une cible refusée qui laisserait une trace ferait mentir le journal.
    const { store } = await magasinPret()

    await expect(store.adjustTarget('squat', { w: 750 })).rejects.toThrow(/500 kg/)

    expect((await store.getTargets()).squat.w).toBe(75)
    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('ne journalise pas un patch qui n’ajuste rien', async () => {
    const { store } = await magasinPret()

    await store.adjustTarget('squat', {})

    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('journalise l’effacement d’un échec en attente', async () => {
    // « Repartir à zéro » est aussi une décision d'Ugo, et elle change ce que le
    // moteur fera au prochain échec. Elle mérite donc la même trace.
    const { store } = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })

    await store.adjustTarget('bench', { fail: null })

    const journal = await store.listTargetAdjustments()
    expect(journal).toHaveLength(2)
    expect(journal[1].before.fail).toBe(70)
    expect(journal[1].after.fail).toBeNull()
  })

  it('est vide tant qu’aucun ajustement n’a eu lieu', async () => {
    const { store } = await magasinPret()
    expect(await store.listTargetAdjustments()).toEqual([])
  })
})
