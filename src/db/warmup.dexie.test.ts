/**
 * Les paliers d'échauffement sur une vraie IndexedDB — CB-55.
 *
 * Le ticket demandait de « faire évoluer Dexie sans perdre séances, cibles ni brouillon ».
 * **Aucune migration n'est nécessaire**, et ce qui l'établit est l'inspection du schéma, pas
 * un test : les séries vivent dans l'enregistrement de la séance, et aucun magasin ni index
 * ne porte sur leur rôle (`database.ts` indexe `id, date, type`). Ajouter une version Dexie
 * qui ne change rien serait du bruit, et un bruit à rejouer sur le téléphone d'Ugo.
 *
 * **Ce fichier ne prouve donc pas cette absence** — P3 de Codex, et il a raison : fermer puis
 * rouvrir une base créée par la build courante ne fait tourner aucune ancienne version du
 * schéma. Il prouve deux autres choses, qui sont celles dont on a besoin : que le nouveau
 * rôle se persiste et se relit intact, et que la progression issue d'une séance échauffée
 * est **identique** à celle d'une séance sans paliers, cette fois par le chemin qui écrit.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'

import type { Draft, Targets } from '../domain/types.ts'

let compteur = 0
function nomDeBase(): string {
  compteur += 1
  return `carnet-warmup-${compteur}`
}

/**
 * Fait une séance A entière sur une base neuve, avec ou sans ses paliers d'échauffement.
 *
 * Les paliers ne sont plus fabriqués ici : depuis CB-56 le brouillon les porte lui-même,
 * et une fixture écrite à la main pourrait diverger de ce que l'app produit vraiment.
 * `sansPaliers` les retire, et c'est cette séance-là qui sert de terme de comparaison.
 *
 * Toutes les séries de travail sont validées **telles que proposées** : la seule
 * différence entre les deux séances est donc bien les paliers.
 */
async function seanceA(avecPaliers: boolean): Promise<{ targets: Targets; draft: Draft }> {
  const store = new DexieStore(new CarnetDatabase(nomDeBase()))
  await store.ready()
  const draft = await store.openDraft('A', '2026-09-15')
  const retenues = avecPaliers ? draft.sets : draft.sets.filter((set) => set.role !== 'warmup')
  const complet = {
    ...draft,
    sets: retenues.map((set) => ({ ...set, status: 'validated' as const })),
  }

  await store.saveDraft(complet)
  const resultat = await store.finalizeSeance(draft.id)
  return { targets: resultat.targets, draft: complet }
}

/** Une séance A déjà faite, paliers compris, sur sa propre base. */
async function baseAvecSeanceFaite(
  nom: string,
): Promise<{ store: DexieStore; base: CarnetDatabase }> {
  const base = new CarnetDatabase(nom)
  const store = new DexieStore(base)
  await store.ready()
  const draft = await store.openDraft('A', '2026-09-15')
  await store.saveDraft({
    ...draft,
    sets: draft.sets.map((set) => ({ ...set, status: 'validated' as const })),
  })
  await store.finalizeSeance(draft.id)
  return { store, base }
}

describe('le parcours réel, d’un bout à l’autre', () => {
  it('création, un palier validé, fermeture, reprise, finalisation', async () => {
    // Le critère d'acceptation du ticket, joué en entier plutôt qu'en morceaux. Les
    // autres tests de ce fichier finalisent des séances **entièrement** validées : ils ne
    // disent donc rien du cas où Ugo s'arrête au milieu de son échauffement, ce qui est
    // pourtant ce qui arrive quand l'écran s'éteint entre deux paliers.
    const nom = nomDeBase()
    const base = new CarnetDatabase(nom)
    const store = new DexieStore(base)
    await store.ready()

    const draft = await store.openDraft('C', '2026-09-20')
    const PALIER = 'c-deadlift:warmup:0'
    const TOP = 'c-deadlift:top:0'

    // 1. Un seul palier validé, le reste intact.
    await store.saveDraft({
      ...draft,
      sets: draft.sets.map((set) =>
        set.id === PALIER ? { ...set, status: 'validated' as const } : set,
      ),
    })
    base.close()

    // 2. Reprise sur une base rouverte : rien n'est réinjecté, rien n'est perdu.
    const rouverte = new DexieStore(new CarnetDatabase(nom))
    await rouverte.ready()
    const repris = await rouverte.openDraft('C', '2026-09-20')
    expect(repris.id).toBe(draft.id)
    expect(repris.sets.find((set) => set.id === PALIER)?.status).toBe('validated')
    expect(repris.sets.find((set) => set.id === TOP)?.status).toBe('planned')
    expect(repris.sets.map((set) => set.id)).toEqual(draft.sets.map((set) => set.id))

    // 3. La séance se termine : les deux paliers restants sont sautés, le travail est fait.
    await rouverte.saveDraft({
      ...repris,
      sets: repris.sets.map((set) => {
        if (set.role === 'warmup') {
          return set.status === 'validated' ? set : { ...set, status: 'skipped' as const }
        }
        return { ...set, status: 'validated' as const }
      }),
    })
    const { seance } = await rouverte.finalizeSeance(repris.id)

    // 4. Le palier repris **et** le top de travail sont tous deux dans la séance finale,
    //    chacun avec son état. Une série sautée n'est pas un échec, elle est conservée.
    const enregistre = (id: string) => seance.sets?.find((set) => set.id === id)
    expect(enregistre(PALIER)?.status).toBe('validated')
    expect(enregistre(TOP)?.status).toBe('validated')
    expect(enregistre('c-deadlift:warmup:1')?.status).toBe('skipped')

    // 5. Et rien de tout cela n'a touché le résumé ni les cibles.
    expect(seance.tops.deadlift?.w).toBe(92.5)
    expect(seance.lines.find((ligne) => ligne.startsWith('Soulevé'))).not.toContain('60')
  })
})

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
    const { store } = await baseAvecSeanceFaite(nomDeBase())

    const [seance] = (await store.listSeances()).filter((s) => s.date === '2026-09-15')
    const paliers = (seance?.sets ?? []).filter((set) => set.role === 'warmup')
    // Les valeurs du contrat pour la séance A : quatre paliers de squat, deux de développé
    // volume, un au poids du corps avant les tractions lestées. Écrites en clair, et non
    // relues du brouillon : c'est ce qui permet à ce test de voir un palier qui se perdrait
    // entre la construction et l'écriture.
    expect(paliers.map((set) => `${set.exerciseId} ${set.weight}×${set.reps}`)).toEqual([
      'a-squat 20×8',
      'a-squat 37.5×5',
      'a-squat 52.5×3',
      'a-squat 65×1',
      'a-bench-vol 20×10',
      'a-bench-vol 40×5',
      'a-tractions-lestees null×5',
    ])
  })

  it('n’écrit aucun palier dans le résumé ni dans les tops', async () => {
    const { store } = await baseAvecSeanceFaite(nomDeBase())
    const [seance] = (await store.listSeances()).filter((s) => s.date === '2026-09-15')
    if (!seance) throw new Error('séance introuvable')

    expect(seance.tops.squat?.w).toBe(75)
    const squat = seance.lines.find((ligne) => ligne.startsWith('Squat'))
    expect(squat).toBeDefined()
    expect(squat).not.toContain('37,5')
    expect(squat).not.toContain('52,5')
  })

  it('persiste le nouveau rôle et le relit intact après réouverture', async () => {
    // Ce que ce test établit : la persistance. Ce qu'il **n'établit pas** : l'absence de
    // migration nécessaire — il ne fait tourner aucune version antérieure du schéma. Cette
    // absence-là se lit dans `database.ts`, qui n'indexe ni ne stocke le rôle.
    const nom = nomDeBase()
    const { store, base } = await baseAvecSeanceFaite(nom)
    const avant = await store.listSeances()
    base.close()

    const rouverte = new DexieStore(new CarnetDatabase(nom))
    await rouverte.ready()
    expect(await rouverte.listSeances()).toEqual(avant)
  })
})
