/**
 * Les paliers d'échauffement sur une vraie IndexedDB — CB-55.
 *
 * Le ticket demandait de « faire évoluer Dexie sans perdre séances, cibles ni brouillon ».
 * La réponse honnête est qu'**aucune migration n'est nécessaire** : les séries vivent dans
 * l'enregistrement de la séance, et aucun index ne porte sur leur rôle (`database.ts`
 * indexe `id, date, type`). Ajouter une version Dexie qui ne change rien serait du bruit,
 * et un bruit qu'il faudrait rejouer sur le téléphone d'Ugo.
 *
 * Ce fichier éprouve cette affirmation au lieu de la poser : une séance portant des paliers
 * est écrite, la base est fermée, rouverte, et tout doit être là. Et surtout, la progression
 * qui en sort doit être **identique** à celle d'une séance sans paliers — cette fois par le
 * chemin réel, celui qui écrit.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { BAR_WEIGHT } from '../domain/program.ts'
import type { Draft, SetLog, Targets } from '../domain/types.ts'

let compteur = 0
function nomDeBase(): string {
  compteur += 1
  return `carnet-warmup-${compteur}`
}

/** Un palier tel que CB-56 en posera dans le brouillon. */
function palier(exerciseId: string, index: number, weight: number, reps: number): SetLog {
  return {
    id: `${exerciseId}:warmup:${index}`,
    exerciseId,
    role: 'warmup',
    index,
    status: 'validated',
    loadKind: 'barTotal',
    weight,
    reps,
    rpe: null,
    targetWeight: weight,
    targetReps: reps,
  }
}

/**
 * Les paliers de la séance A : ceux du squat **et ceux du développé volume**.
 *
 * Le développé volume n'est pas décoratif ici, il est le seul endroit qui morde. Le top
 * set d'un schéma à volume est la **plus légère** des séries validées, puisque la
 * progression exige que les trois tiennent la charge : un palier à 20 kg y deviendrait le
 * record de la séance et ferait tomber la cible de 60 à 20. Le squat, lui, est piloté par
 * sa série de rôle `top` et resterait juste même sans l'exclusion — un jeu de paliers
 * limité au squat aurait donc donné un test vert qui ne prouvait rien.
 */
const PALIERS = [
  palier('a-squat', 0, BAR_WEIGHT, 8),
  palier('a-squat', 1, 37.5, 5),
  palier('a-squat', 2, 52.5, 3),
  palier('a-squat', 3, 65, 1),
  palier('a-bench-vol', 0, BAR_WEIGHT, 10),
  palier('a-bench-vol', 1, 40, 5),
]

/**
 * Fait une séance A entière sur une base neuve, avec ou sans paliers d'échauffement.
 *
 * Toutes les séries de travail sont validées **telles que proposées** : c'est ce qui rend
 * les deux séances comparables, la seule différence étant les paliers.
 */
async function seanceA(avecPaliers: boolean): Promise<{ targets: Targets; draft: Draft }> {
  const store = new DexieStore(new CarnetDatabase(nomDeBase()))
  await store.ready()
  const draft = await store.openDraft('A', '2026-09-15')
  const travail = draft.sets.map((set) => ({ ...set, status: 'validated' as const }))
  const complet = { ...draft, sets: avecPaliers ? [...PALIERS, ...travail] : travail }

  await store.saveDraft(complet)
  const resultat = await store.finalizeSeance(draft.id)
  return { targets: resultat.targets, draft: complet }
}

describe('une séance échauffée, écrite pour de vrai', () => {
  it('donne exactement les mêmes cibles qu’une séance sans paliers', () => {
    // Le test qui porte le lot, cette fois par le chemin qui écrit. `derive-warmup.test.ts`
    // prouve la même chose sur les fonctions pures ; celui-ci prouve que rien ne se perd
    // entre elles et la transaction de finalisation.
    return Promise.all([seanceA(false), seanceA(true)]).then(([nue, echauffee]) => {
      expect(echauffee.targets).toEqual(nue.targets)
      // Et la valeur, en plus de l'égalité : deux chemins qui se tromperaient ensemble
      // resteraient égaux. La séance est complète à 60×8 sur les trois séries, donc la
      // cible du développé volume **monte** à 62,5. C'est une bien meilleure preuve qu'un
      // maintien : elle établit que le moteur a lu les trois vraies séries de travail, et
      // pas les paliers — qui l'auraient au contraire fait tomber à 20.
      expect(echauffee.targets.benchVol.w).toBe(62.5)
    })
  })

  it('garde les paliers dans la séance enregistrée, avec leur rôle', async () => {
    const nom = nomDeBase()
    const store = new DexieStore(new CarnetDatabase(nom))
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({
      ...draft,
      sets: [...PALIERS, ...draft.sets.map((s) => ({ ...s, status: 'validated' as const }))],
    })
    await store.finalizeSeance(draft.id)

    const [seance] = (await store.listSeances()).filter((s) => s.date === '2026-09-15')
    const paliers = (seance?.sets ?? []).filter((set) => set.role === 'warmup')
    expect(paliers).toHaveLength(6)
    expect(paliers.map((set) => set.weight)).toEqual([BAR_WEIGHT, 37.5, 52.5, 65, BAR_WEIGHT, 40])
  })

  it('n’écrit aucun palier dans le résumé ni dans les tops', async () => {
    const store = new DexieStore(new CarnetDatabase(nomDeBase()))
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({
      ...draft,
      sets: [...PALIERS, ...draft.sets.map((s) => ({ ...s, status: 'validated' as const }))],
    })
    const { seance } = await store.finalizeSeance(draft.id)

    expect(seance.tops.squat?.w).toBe(75)
    const squat = seance.lines.find((ligne) => ligne.startsWith('Squat'))
    expect(squat).toBeDefined()
    expect(squat).not.toContain('37,5')
    expect(squat).not.toContain('52,5')
  })

  it('survit à une fermeture et une réouverture de la base', async () => {
    // La preuve qu'aucune migration ne manque : le rôle `warmup` n'est porté par aucun
    // index, donc rien à migrer. Si ce test tombait un jour, c'est qu'une version Dexie
    // serait devenue nécessaire.
    const nom = nomDeBase()
    const base = new CarnetDatabase(nom)
    const store = new DexieStore(base)
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({
      ...draft,
      sets: [...PALIERS, ...draft.sets.map((s) => ({ ...s, status: 'validated' as const }))],
    })
    await store.finalizeSeance(draft.id)
    const avant = await store.listSeances()
    base.close()

    const rouverte = new DexieStore(new CarnetDatabase(nom))
    await rouverte.ready()
    expect(await rouverte.listSeances()).toEqual(avant)
  })
})
