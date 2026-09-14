/**
 * Le démarrage est atomique, sur une vraie IndexedDB — CB-62.
 *
 * P1 de Codex sur #54, et le défaut venait de l'API que j'avais proposée à CB-63 :
 * `openDraft()` puis `saveDraft(startDraft(copie))`. Entre les deux, un ajustement de
 * cible reconstruit le brouillon stocké sur les nouvelles cibles ; la réécriture de la
 * copie y remet les anciennes `baseTargets`, et la séance démarre **condamnée** —
 * `finalizeSeance` la refusera par `stale-targets`, en salle, après le travail.
 *
 * C'est le défaut déjà payé sur `adjustTarget`, déplacé au démarrage. Le test passe
 * donc par une vraie base et reproduit l'intercalage, plutôt que de vérifier qu'une
 * fonction pure pose bien un nombre.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { startDraft } from './draft.ts'

let compteur = 0
async function magasin(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-demarrage-${compteur}`))
  await store.ready()
  return store
}

describe('démarrer une séance', () => {
  it('survit à un ajustement de cible intercalé', async () => {
    const store = await magasin()

    // 1. L'accueil lit sa copie.
    const copieAccueil = await store.openDraft('A', '2026-09-15')
    expect(copieAccueil.baseTargets.squat.w).toBe(75)

    // 2. Ailleurs — autre onglet, écran des cibles — une cible est ajustée. Le brouillon
    //    stocké est vierge, donc reconstruit sur les nouvelles cibles.
    await store.adjustTarget('squat', { w: 80 })

    // 3. L'accueil démarre. Par l'intention de magasin, et non en réécrivant sa copie.
    const demarre = await store.startSession('A', '2026-09-15', 5000)

    expect(demarre.startedAt).toBe(5000)
    // La séance démarre sur les cibles **courantes**, pas sur celles que l'accueil avait
    // en main il y a trois écrans.
    expect(demarre.baseTargets.squat.w).toBe(80)
    expect(demarre.sets.find((set) => set.id === 'a-squat:top:0')?.weight).toBe(80)

    // 4. Et elle peut se finaliser, ce qui est le vrai enjeu.
    const resultat = await store.finalizeSeance(demarre.id)
    expect(resultat.applied).toBe(true)
  })

  it('condamne la séance si on réécrit une copie périmée — le défaut, montré', async () => {
    // Le même scénario par la séquence décomposée. Ce test existe pour que la raison
    // d'être de `startSession` reste visible : le jour où quelqu'un la trouvera
    // superflue, il lira ici ce qu'elle évite.
    const store = await magasin()
    const copieAccueil = await store.openDraft('A', '2026-09-15')
    await store.adjustTarget('squat', { w: 80 })

    await store.saveDraft(startDraft(copieAccueil, 5000))

    await expect(store.finalizeSeance(copieAccueil.id)).rejects.toMatchObject({
      code: 'stale-targets',
    })
  })

  it('construit sur les cibles courantes quand aucun brouillon n’existe', async () => {
    // L'autre moitié du chemin : ci-dessus le brouillon existait déjà et `startSession`
    // le relisait. Ici il n'y en a aucun, et la construction doit lire les cibles **dans
    // la transaction**. Sans ce test, une construction figée sur des cibles périmées
    // passerait inaperçue — la première rédaction de ce fichier ne l'atteignait pas.
    const store = await magasin()
    await store.adjustTarget('squat', { w: 80 })

    const demarre = await store.startSession('A', '2026-09-15', 5000)
    expect(demarre.baseTargets.squat.w).toBe(80)
    expect(demarre.sets.find((set) => set.id === 'a-squat:top:0')?.weight).toBe(80)
    expect(demarre.startedAt).toBe(5000)
  })

  it('ne redate pas une séance déjà démarrée', async () => {
    const store = await magasin()
    const premier = await store.startSession('A', '2026-09-15', 5000)
    const second = await store.startSession('A', '2026-09-15', 9000)

    expect(second.startedAt).toBe(5000)
    expect(second.id).toBe(premier.id)
  })

  it('reprend la séance en cours plutôt que d’en ouvrir une autre', async () => {
    // Le sélecteur A/B/C reste libre, mais démarrer ne détruit jamais une saisie : D9.
    const store = await magasin()
    const draft = await store.startSession('C', '2026-09-20', 5000)
    await store.saveDraft({ ...draft, notes: 'Dos chargé' })

    const reprise = await store.startSession('A', '2026-09-21', 9000)
    expect(reprise.type).toBe('C')
    expect(reprise.notes).toBe('Dos chargé')
    expect(reprise.startedAt).toBe(5000)
  })

  it('n’écrit rien au simple affichage de l’accueil', async () => {
    // `openDraft` construit toujours un brouillon — c'est ce qui rend `startedAt`
    // nécessaire. Ce qu'il ne doit pas faire, c'est le dater.
    const store = await magasin()
    const ouvert = await store.openDraft('A', '2026-09-15')
    expect(ouvert.startedAt).toBeNull()
    expect((await store.loadDraft())?.startedAt).toBeNull()
  })
})
