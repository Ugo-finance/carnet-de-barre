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

/**
 * Le vrai parcours : on compare, **puis** on confirme sur ce qui a été comparé.
 *
 * Depuis CB-79a, `importReplace` exige l'identité de l'aperçu. Passer par l'aperçu ici
 * n'est pas une formalité pour faire compiler : c'est la séquence que l'app suit, et un
 * test qui fabriquerait l'identité à la main cesserait de dire quoi que ce soit du lien
 * entre les deux appels.
 */
async function remplacer(store: DexieStore, fichier: unknown) {
  const apercu = await store.previewImport(fichier)
  return store.importReplace(fichier, apercu.identite)
}

/** Une identité qui ne correspond à rien, pour les cas rejetés avant tout contrôle. */
const IDENTITE_FACTICE = { local: 'x', candidat: 'x' }

describe('import sur une vraie base', () => {
  it('remplace l’historique et pose le marqueur d’amorçage', async () => {
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)

    const resultat = await remplacer(store, fichier)

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

    const apercu = await store.previewImport(fichier)
    await expect(store.importReplace(fichier, apercu.identite)).rejects.toThrow(StoreError)
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

    await expect(remplacer(store, fichier)).rejects.toThrow(/séance est en cours/)

    expect((await store.loadDraft())?.id).toBe(brouillon.id)
    expect(await store.listSeances()).toHaveLength(avant.length)
  })

  it('n’écrit rien du tout quand le fichier est invalide', async () => {
    const { store } = await magasinPret()
    const avant = await store.listSeances()
    const ciblesAvant = await store.getTargets()

    // Le fichier est rejeté par la validation, bien avant tout contrôle d'identité :
    // l'identité factice ne peut donc pas masquer le vrai motif du refus.
    await expect(store.importReplace({ schemaVersion: 1 }, IDENTITE_FACTICE)).rejects.toThrow()

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
    // Dexie attend une `PromiseExtended`, pas une promesse ordinaire. On remplace la
    // méthode pour la faire échouer : la forme du retour n'a aucune importance ici
    // puisqu'elle lève toujours. Le cast est explicite pour que personne ne prenne
    // cette signature pour un modèle à copier.
    base.targets.put = (() => {
      throw new Error('écriture refusée en plein milieu')
    }) as unknown as typeof base.targets.put

    await expect(remplacer(store, fichier)).rejects.toThrow(/refusée/)
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

describe('la confirmation porte sur ce qui a été comparé — CB-79a', () => {
  it('refuse quand une séance locale est corrigée entre l’aperçu et la confirmation', async () => {
    // Le cas qui justifie une empreinte de **contenu** plutôt qu'un résumé. Corriger une
    // séance passée (D6) ne change ni le nombre de séances, ni sa date, ni son `ts` :
    // un aperçu résumé par des compteurs laisserait passer la confirmation, et la
    // correction disparaîtrait sans que rien ne proteste.
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const apercu = await store.previewImport(fichier)

    const seances = await store.listSeances()
    const corrigee = await store.updateSeance(seances[0].id, {
      notes: 'correction faite après la comparaison',
    })

    // Ni le nombre ni la date n'ont bougé : seul le contenu.
    const apres = await store.listSeances()
    expect(apres).toHaveLength(seances.length)
    expect(apres.map((s) => s.date).toSorted()).toEqual(seances.map((s) => s.date).toSorted())

    await expect(store.importReplace(fichier, apercu.identite)).rejects.toThrow(/ont changé/)
    expect((await store.listSeances()).find((s) => s.id === corrigee.id)?.notes).toBe(
      'correction faite après la comparaison',
    )
  })

  it('refuse un carnet local modifié APRÈS le contrôle pré-transaction', async () => {
    // Même fenêtre que pour le brouillon : le contrôle doit vivre **dans** la
    // transaction. Placé dehors, il laisserait une autre fenêtre — ou l'app installée,
    // qui partage la base — écrire entre la vérification et l'effacement.
    const { base, store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const apercu = await store.previewImport(fichier)
    const avant = await store.listSeances()

    const transactionOrigine = base.transaction.bind(base)
    let injecte = false
    // @ts-expect-error surcharge volontaire, restaurée juste après
    base.transaction = async (...args) => {
      if (!injecte) {
        injecte = true
        await base.seances.put({ ...avant[0], notes: 'écrit par l’autre fenêtre' })
      }
      // @ts-expect-error même raison
      return transactionOrigine(...args)
    }

    await expect(store.importReplace(fichier, apercu.identite)).rejects.toThrow(/ont changé/)
    base.transaction = transactionOrigine

    expect(await store.listSeances()).toHaveLength(avant.length)
    expect((await store.listSeances()).find((s) => s.id === avant[0].id)?.notes).toBe(
      'écrit par l’autre fenêtre',
    )
  })

  it('refuse quand le fichier confirmé n’est pas celui qui a été comparé', async () => {
    // Rien n'empêche de coller un autre export entre l'aperçu et le bouton.
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const apercu = await store.previewImport(fichier)
    const autre = { ...fichier, seances: fichier.seances.slice(0, 1) }

    await expect(store.importReplace(autre, apercu.identite)).rejects.toThrow(/fichier a changé/)
    expect(await store.listSeances()).not.toHaveLength(1)
  })

  it('laisse passer la confirmation quand rien n’a bougé', async () => {
    // La garde doit refuser ce qui a changé, pas tout. Sans ce test, la rendre
    // systématiquement rouge passerait les trois précédents.
    const { store } = await magasinPret()
    const fichier = await fichierImportable(store)
    const apercu = await store.previewImport(fichier)

    const resultat = await store.importReplace(fichier, apercu.identite)

    expect(resultat.seanceCount).toBe(3)
    expect(await store.listSeances()).toHaveLength(3)
  })
})
