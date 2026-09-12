/**
 * Corriger et supprimer une séance enregistrée — CB-33, seconde moitié.
 *
 * Jusqu'ici, une séance finalisée était définitive : `updateSeance` et `deleteSeance`
 * étaient déclarés au contrat et n'existaient nulle part. Une faute de frappe le soir
 * d'une séance restait donc dans l'historique, et dans chaque export, pour toujours.
 *
 * La règle qui gouverne tout ce fichier est D6 : **corriger le passé ne touche jamais
 * aux cibles**. Les cibles d'aujourd'hui sont le produit de tout ce qui s'est passé
 * depuis ; les recalculer à partir d'un point du passé effacerait chaque décision
 * prise entre-temps, y compris les ajustements manuels d'Ugo.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { StoreError } from './contracts.ts'

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-edit-${compteur}`))
  await store.ready()
  return store
}

describe('corriger une séance', () => {
  it('modifie les notes sans rien toucher d’autre', async () => {
    const store = await magasinPret()
    const [premiere] = await store.listSeances()

    const apres = await store.updateSeance(premiere.id, { notes: 'Dos tendu, à surveiller' })

    expect(apres.notes).toBe('Dos tendu, à surveiller')
    expect(apres.date).toBe(premiere.date)
    expect(apres.lines).toEqual(premiere.lines)
  })

  it('ne touche jamais aux cibles, même en corrigeant un top set', async () => {
    // D6. C'est la règle que tout le reste protège.
    const store = await magasinPret()
    const avant = await store.getTargets()
    const [premiere] = await store.listSeances()

    await store.updateSeance(premiere.id, { lines: ['Squat : 100×4 @8'] })

    expect(await store.getTargets()).toEqual(avant)
  })

  it('refuse une correction qui rendrait la séance invalide', async () => {
    // Une correction manuelle est exactement l'endroit où une date impossible entre
    // dans la base. Après coup, plus rien ne dit d'où elle vient.
    const store = await magasinPret()
    const [premiere] = await store.listSeances()

    await expect(store.updateSeance(premiere.id, { date: '2026-02-30' })).rejects.toThrow(
      StoreError,
    )
    expect((await store.getSeance(premiere.id))?.date).toBe(premiere.date)
  })

  it('refuse de corriger une séance qui n’existe pas', async () => {
    const store = await magasinPret()
    await expect(store.updateSeance('inconnue', { notes: 'x' })).rejects.toThrow(/n’existe pas/)
  })

  it('ne laisse pas changer l’identifiant', async () => {
    // Sinon deux séances pourraient se retrouver avec le même, et l'export refuse
    // les doublons d'identifiant — la corruption ne se verrait qu'à l'export suivant.
    const store = await magasinPret()
    const [premiere] = await store.listSeances()

    const apres = await store.updateSeance(premiere.id, {
      notes: 'test',
      ...({ id: 'autre' } as object),
    })

    expect(apres.id).toBe(premiere.id)
  })
})

describe('supprimer une séance', () => {
  it('la retire de l’historique', async () => {
    const store = await magasinPret()
    const avant = await store.listSeances()
    const [premiere] = avant

    await store.deleteSeance(premiere.id)

    const apres = await store.listSeances()
    expect(apres).toHaveLength(avant.length - 1)
    expect(apres.some((seance) => seance.id === premiere.id)).toBe(false)
  })

  it('laisse les cibles exactement où elles sont', async () => {
    // Le cas qui surprend, et qui est voulu : Ugo a réellement soulevé ces charges.
    // La cible reflète ce qu'il sait faire, pas le contenu de la table des séances.
    // Pour revenir en arrière sur une cible, l'ajustement manuel est là — explicite,
    // et journalisé.
    const store = await magasinPret()
    const avant = await store.getTargets()
    const [premiere] = await store.listSeances()

    await store.deleteSeance(premiere.id)

    expect(await store.getTargets()).toEqual(avant)
  })

  it('reste sans effet sur une séance déjà supprimée', async () => {
    // Idempotent : un double tap sur « supprimer » ne doit pas lever.
    const store = await magasinPret()
    const [premiere] = await store.listSeances()

    await store.deleteSeance(premiere.id)
    await expect(store.deleteSeance(premiere.id)).resolves.toBeUndefined()
  })

  it('n’empêche pas de finaliser une séance en cours', async () => {
    // Pas de garde de brouillon ici, contrairement à `adjustTarget` : puisque les
    // cibles ne bougent pas, `targetsDiverged` ne voit rien et la séance du jour
    // reste enregistrable. Ce test existe pour qu'on ne « durcisse » pas ça par
    // symétrie un jour, en croyant bien faire.
    const store = await magasinPret()
    const draft = await store.openDraft('C', '2026-09-12')
    await store.saveDraft({
      ...draft,
      sets: draft.sets.map((set) => ({ ...set, status: 'validated' as const })),
    })

    const [ancienne] = await store.listSeances()
    await store.deleteSeance(ancienne.id)

    const resultat = await store.finalizeSeance(draft.id)
    expect(resultat.seance.date).toBe('2026-09-12')
  })
})
