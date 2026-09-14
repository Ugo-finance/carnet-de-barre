/**
 * La note libre d'un ancien brouillon, sur une vraie IndexedDB — CB-69.
 *
 * P2 de Codex, et il a raison : le lot prouvait `hydrateDraft`, la fonction pure, mais
 * pas son **branchement**. Or la seule donnée que ce lot migre transite par deux chemins
 * de production qui ne sont pas celui du test — `DexieStore.loadDraft`, qui hydrate, et
 * `finalizeSeance`, qui écrit la séance définitive.
 *
 * Le risque n'est pas la fonction, c'est qu'on la débranche un jour sans s'en rendre
 * compte : la note disparaîtrait en silence, et le seul témoin serait Ugo, des semaines
 * plus tard, devant une séance dont il a perdu la remarque.
 *
 * Le parcours va donc de la ligne brute jusqu'à la séance enregistrée, par les fonctions
 * qui tournent en production.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { buildDraft } from './draft.ts'
import type { Targets } from '../domain/types.ts'

let compteur = 0
function nomDeBase(): string {
  compteur += 1
  return `carnet-migration-optionnels-${compteur}`
}

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

/**
 * Une ligne telle qu'une version **antérieure** de l'app l'a écrite : des accessoires
 * libres annotés, et aucun palier pour eux dans `sets`.
 */
async function poserUnAncienBrouillon(base: CarnetDatabase): Promise<string> {
  const draft = buildDraft('A', '2026-09-15', CIBLES, { id: 'ancien', now: 1000 })
  const ligne = {
    ...draft,
    // Une saisie de travail, sinon le brouillon serait reconstruit à l'ouverture.
    sets: draft.sets.map((set) =>
      set.id === 'a-squat:top:0' ? { ...set, status: 'validated' as const } : set,
    ),
    accessories: [
      { exerciseId: 'a-curls', done: false, note: '12 kg, ça passait bien' },
      { exerciseId: 'a-elevations', done: true, note: '' },
    ],
  }
  await base.drafts.put(ligne)
  return draft.id
}

describe('un brouillon ouvert avant CB-69, par le chemin de production', () => {
  it('garde la note libre exactement une fois, jusqu’à la séance enregistrée', async () => {
    const base = new CarnetDatabase(nomDeBase())
    const store = new DexieStore(base)
    await store.ready()
    const id = await poserUnAncienBrouillon(base)

    // Le chemin réel : charger, réécrire, recharger, finaliser.
    const charge = await store.loadDraft()
    expect(charge?.notes).toBe('Curls : 12 kg, ça passait bien\nÉlévations latérales ✓')
    expect(charge?.accessories).toEqual([])

    if (!charge) throw new Error('Brouillon introuvable')
    await store.saveDraft(charge)
    const recharge = await store.loadDraft()
    // Le pliage ne se rejoue pas sur un brouillon déjà plié : la note reste unique.
    expect(recharge?.notes).toBe('Curls : 12 kg, ça passait bien\nÉlévations latérales ✓')

    await store.finalizeSeance(id)
    const seances = await store.listSeances()
    const enregistree = seances.find((seance) => seance.id === id)
    expect(enregistree?.notes).toBe('Curls : 12 kg, ça passait bien\nÉlévations latérales ✓')
    expect(enregistree?.accessories).toEqual([])
  })

  it('reste une séance en cours, et interdit d’ajuster une cible', async () => {
    // Le corollaire du pliage : la ligne migrée porte toujours l'information qu'Ugo a
    // saisie, donc elle reste une séance en cours et rien ne la reconstruit.
    const base = new CarnetDatabase(nomDeBase())
    const store = new DexieStore(base)
    await store.ready()
    await poserUnAncienBrouillon(base)

    await expect(store.adjustTarget('squat', { w: 80 })).rejects.toMatchObject({
      code: 'draft-in-progress',
    })
  })
})
