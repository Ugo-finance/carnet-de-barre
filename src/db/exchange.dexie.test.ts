/**
 * L'import sur une vraie IndexedDB — CB-40.
 *
 * L'import est la seule opération destructive de l'app : il efface tout l'historique.
 * Les tests en mémoire ne peuvent rien prouver ici, parce que rien ne s'y intercale
 * entre deux instructions. Sur une vraie base, si.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { StoreError } from './contracts.ts'

let compteur = 0
async function magasinPret(): Promise<{ base: CarnetDatabase; store: DexieStore }> {
  compteur += 1
  const base = new CarnetDatabase(`carnet-import-${compteur}`)
  const store = new DexieStore(base)
  await store.ready()
  return { base, store }
}

/** Un export minimal mais valide, volontairement différent du seed. */
async function fichierImportable(store: DexieStore) {
  const complet = await store.exportAll()
  return { ...complet, seances: complet.seances.slice(0, 3) }
}

describe('import sur une vraie base', () => {
  it('remplace l’historique et pose le marqueur d’amorçage', async () => {
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)

    const resultat = await store.importReplace(fichier)

    expect(resultat.seanceCount).toBe(3)
    expect(await store.listSeances()).toHaveLength(3)
  })

  it('refuse un brouillon apparu APRÈS le contrôle pré-transaction, sans rien effacer', async () => {
    // Le défaut que ce test verrouille : le contrôle du brouillon vivait **hors** de
    // la transaction. Entre ce contrôle et le `drafts.clear()`, une autre fenêtre — ou
    // l'app installée, qui partage la même base — pouvait ouvrir une séance. L'import
    // passait le contrôle puis effaçait une saisie en cours.
    //
    // On reproduit exactement cette fenêtre : le brouillon est écrit juste avant que
    // la transaction ne s'ouvre, donc après l'endroit où vivait l'ancien contrôle.
    // Le contrôle étant maintenant dedans, il doit le voir et tout annuler.
    const { base, store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const avant = await store.listSeances()

    const transactionOrigine = base.transaction.bind(base)
    let injecte = false
    // @ts-expect-error surcharge volontaire, restaurée juste après
    base.transaction = async (...args) => {
      if (!injecte) {
        injecte = true
        await base.drafts.put(await construireBrouillon(store))
      }
      // @ts-expect-error même raison
      return transactionOrigine(...args)
    }

    await expect(store.importReplace(fichier)).rejects.toThrow(StoreError)
    base.transaction = transactionOrigine

    // Rien n'a bougé : ni l'historique, ni le brouillon de l'autre fenêtre.
    expect(await store.listSeances()).toHaveLength(avant.length)
    expect((await store.loadDraft())?.id).toBe('brouillon-autre-fenetre')
  })

  it('refuse quand un brouillon existe déjà, et le laisse intact', async () => {
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const brouillon = await store.openDraft('C', '2026-09-20')
    const avant = await store.listSeances()

    await expect(store.importReplace(fichier)).rejects.toThrow(/séance est en cours/)

    expect((await store.loadDraft())?.id).toBe(brouillon.id)
    expect(await store.listSeances()).toHaveLength(avant.length)
  })

  it('n’écrit rien du tout quand le fichier est invalide', async () => {
    const { store } = await magasinPret()
    const avant = await store.listSeances()
    const ciblesAvant = await store.getTargets()

    await expect(store.importReplace({ schemaVersion: 1 })).rejects.toThrow()

    expect(await store.listSeances()).toHaveLength(avant.length)
    expect(await store.getTargets()).toEqual(ciblesAvant)
  })

  it('annule tout si une écriture échoue en milieu de transaction', async () => {
    // Un import à moitié appliqué laisserait une base que rien ne décrit : des séances
    // effacées, des cibles restées à l'ancienne valeur.
    const { base, store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const avant = await store.listSeances()
    const ciblesAvant = await store.getTargets()

    const putOrigine = base.targets.put.bind(base.targets)
    base.targets.put = async () => {
      throw new Error('écriture refusée en plein milieu')
    }

    await expect(store.importReplace(fichier)).rejects.toThrow(/refusée/)
    base.targets.put = putOrigine

    expect(await store.listSeances()).toHaveLength(avant.length)
    expect(await store.getTargets()).toEqual(ciblesAvant)
  })
})

async function construireBrouillon(store: DexieStore) {
  const cibles = await store.getTargets()
  return {
    id: 'brouillon-autre-fenetre',
    type: 'C' as const,
    date: '2026-09-20',
    sets: [],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    baseTargets: cibles,
    createdAt: 1,
    updatedAt: 1,
  }
}
