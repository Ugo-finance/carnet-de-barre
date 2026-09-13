/**
 * Le raccord du moteur d'accessoires, sur une vraie IndexedDB — CB-45 lot B2.
 *
 * Le moteur était écrit, testé, contre-revu — et **rien ne l'appelait**. Ces tests ne
 * vérifient donc pas la règle, qui l'est ailleurs, mais qu'elle atteint réellement le
 * brouillon qu'Ugo aura sous les yeux. C'est exactement ce qui manquait quand
 * `ExportPanel` avait été livré sans son onglet : une pièce correcte et inatteignable.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-raccord-${compteur}`))
  await store.ready()
  return store
}

/** La charge proposée sur le développé incliné du brouillon courant. */
function chargeIncline(draft: {
  sets: { exerciseId: string; role: string; weight: number | null }[]
}): number | null {
  // Le rôle est **obligatoire** dans ce filtre depuis CB-56 : l'incliné de la séance C
  // est précédé d'un palier d'échauffement à ~60 %, et « la première série de c-di »
  // rend désormais ce palier. Un sélecteur qui l'ignore lit 14 kg au lieu de 24.
  return (
    draft.sets.find((set) => set.exerciseId === 'c-di' && set.role === 'accessory')?.weight ?? null
  )
}

function repsIncline(draft: {
  sets: { exerciseId: string; role: string; reps: number | null }[]
}): (number | null)[] {
  return draft.sets
    .filter((set) => set.exerciseId === 'c-di' && set.role === 'accessory')
    .map((set) => set.reps)
}

/** Fait une séance C entière, avec la charge et les répétitions voulues sur l'incliné. */
async function faireUneSeanceC(
  store: DexieStore,
  date: string,
  incline: { weight: number; reps: number[] },
): Promise<void> {
  const draft = await store.openDraft('C', date)
  let rang = 0
  await store.saveDraft({
    ...draft,
    sets: draft.sets.map((set) => {
      if (set.exerciseId !== 'c-di' || set.role !== 'accessory') {
        return { ...set, status: 'validated' as const }
      }
      const reps = incline.reps[rang] ?? null
      rang += 1
      return { ...set, status: 'validated' as const, weight: incline.weight, reps }
    }),
  })
  await store.finalizeSeance(draft.id)
}

describe('le moteur atteint réellement le brouillon', () => {
  it('propose la charge de la table quand il n’y a aucun historique', async () => {
    // Les douze séances du seed sont du carnet papier : aucune série à lire. Le point
    // de départ est donc bien la valeur de la table, et pas une charge inventée.
    const store = await magasinPret()
    expect(chargeIncline(await store.openDraft('C', '2026-09-20'))).toBe(24)
  })

  it('propose ce qu’Ugo a réellement tiré, pas la valeur de la table', async () => {
    // Le défaut d'origine, vu en salle le 12.09 : l'app affichait 20 kg pendant qu'il
    // en tirait 24, et l'aurait affiché indéfiniment.
    const store = await magasinPret()
    await faireUneSeanceC(store, '2026-09-20', { weight: 26, reps: [8, 8, 8] })
    await store.clearDraft()

    expect(chargeIncline(await store.openDraft('C', '2026-09-27'))).toBe(26)
  })

  it('repropose les répétitions de la dernière fois, série par série', async () => {
    // Ugo doit voir 10/9/8 pour savoir quoi battre. Pré-remplir le bas de la fourchette
    // lui ferait refaire la séance d'avant sans le savoir.
    const store = await magasinPret()
    await faireUneSeanceC(store, '2026-09-20', { weight: 24, reps: [10, 9, 8] })
    await store.clearDraft()

    expect(repsIncline(await store.openDraft('C', '2026-09-27'))).toEqual([10, 9, 8])
  })

  it('monte d’un pas quand toutes les séries ont atteint le haut', async () => {
    const store = await magasinPret()
    await faireUneSeanceC(store, '2026-09-20', { weight: 24, reps: [12, 12, 12] })
    await store.clearDraft()

    const suivant = await store.openDraft('C', '2026-09-27')
    expect(chargeIncline(suivant)).toBe(26)
    expect(repsIncline(suivant)).toEqual([8, 8, 8])
  })

  it('ne perd pas la charge calculée quand Ugo ajuste une cible', async () => {
    // `adjustTarget` **reconstruit** le brouillon vierge sur les nouvelles cibles. Sans
    // l'historique, cette reconstruction ramènerait l'incliné à la valeur de la table —
    // le défaut du « 20 kg par haltère », revenu par la porte de derrière.
    const store = await magasinPret()
    await faireUneSeanceC(store, '2026-09-20', { weight: 26, reps: [8, 8, 8] })
    await store.clearDraft()
    await store.openDraft('C', '2026-09-27')

    await store.adjustTarget('deadlift', { w: 95 })

    const reconstruit = await store.loadDraft()
    expect(chargeIncline(reconstruit!)).toBe(26)
    // Et la cible ajustée est bien prise en compte, sinon le test ne prouverait
    // que la moitié de ce qu'il prétend.
    expect(
      reconstruit?.sets.find((set) => set.exerciseId === 'c-deadlift' && set.role === 'top')
        ?.weight,
    ).toBe(95)
  })

  it('échauffe l’incliné sur la charge qu’Ugo tire, pas sur celle de la table', async () => {
    // Trou trouvé par mutation : faire calculer le palier depuis `suggestedWeight` au lieu
    // de la charge réelle ne faisait tomber aucun test, alors que le commentaire de
    // `warmupSetsFor` l'annonce noir sur blanc. Une affirmation de plus qui n'était pas
    // éprouvée.
    //
    // Le défaut serait discret et durable : Ugo monterait à 30 kg par haltère en
    // s'échauffant éternellement à 14, la valeur de départ d'il y a des mois.
    const store = await magasinPret()
    await faireUneSeanceC(store, '2026-09-20', { weight: 26, reps: [8, 8, 8] })
    await store.clearDraft()

    const suivant = await store.openDraft('C', '2026-09-27')
    const palier = suivant.sets.find((set) => set.exerciseId === 'c-di' && set.role === 'warmup')
    // 60 % de 26 vaut 15,6, arrondi à 16 au pas de 2 kg des haltères. À la valeur de la
    // table, ce serait resté 14.
    expect(palier?.weight).toBe(16)
    expect(chargeIncline(suivant)).toBe(26)
  })

  it('survit à une réouverture de la base', async () => {
    // La suggestion est **dérivée**, jamais écrite : elle doit se recalculer à
    // l'identique après un redémarrage de l'app, sans état intermédiaire à restaurer.
    compteur += 1
    const nom = `carnet-raccord-reouverture-${compteur}`
    const base = new CarnetDatabase(nom)
    const store = new DexieStore(base)
    await store.ready()
    await faireUneSeanceC(store, '2026-09-20', { weight: 26, reps: [8, 8, 8] })
    await store.clearDraft()
    base.close()

    const rouverte = new DexieStore(new CarnetDatabase(nom))
    await rouverte.ready()
    expect(chargeIncline(await rouverte.openDraft('C', '2026-09-27'))).toBe(26)
  })
})
