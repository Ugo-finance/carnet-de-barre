/**
 * Les optionnels deviennent des séries structurées — CB-69.
 *
 * Le lot ne change pas une règle de calcul : il déplace quatre exercices d'un formulaire
 * de texte libre vers la file de séries. Ce qu'il faut prouver n'est donc pas une
 * formule, mais **trois passages** :
 *
 * - la file de la séance atteint le compte du contrat, sinon la séance en focus (CB-64)
 *   s'interrompt avant la fin ;
 * - ces exercices entrent dans le moteur d'accessoires exactement comme les autres, ou
 *   n'y entrent pas — et dans les deux cas pour une raison lisible dans la table ;
 * - rien de ce qu'Ugo avait déjà écrit en texte libre ne disparaît au passage.
 */

import { describe, expect, it } from 'vitest'
import { buildDraft, hydrateDraft, type StoredDraft } from './draft.ts'
import { MemoryStore } from './memory.ts'
import { buildExport, serializeExport, validateImport } from './exchange.ts'
import { SCHEMA_VERSION, parseImport } from '../domain/schema.ts'
import { SEANCES } from '../domain/program.ts'
import type { Draft, Seance, SeanceType, SetLog, Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function brouillon(type: SeanceType, seances: readonly Seance[] = []): Draft {
  return buildDraft(type, '2026-09-15', CIBLES, { id: `d-${type}`, now: 1, seances })
}

/** Les séries d'un exercice dans le brouillon, hors paliers d'échauffement. */
function travail(draft: Draft, exerciseId: string): SetLog[] {
  return draft.sets.filter((set) => set.exerciseId === exerciseId && set.role === 'accessory')
}

/** Une séance passée où cet exercice a été fait, à cette charge et ces répétitions. */
function faite(exerciseId: string, weight: number | null, reps: number[]): Seance {
  return {
    id: `s-${exerciseId}`,
    date: '2026-09-08',
    type: 'A',
    lines: [],
    tops: {},
    notes: '',
    ts: 1,
    sets: reps.map((rep, index) => ({
      id: `${exerciseId}:accessory:${index}`,
      exerciseId,
      role: 'accessory' as const,
      index,
      status: 'validated' as const,
      loadKind: 'perDumbbell' as const,
      weight,
      reps: rep,
      rpe: null,
      targetWeight: weight,
      targetReps: rep,
    })),
  }
}

describe('la file de la séance', () => {
  // Les trois chiffres viennent de `docs/refonte/00-contrat.md` § 5, et c'est de là que
  // vient l'arbitrage 3 : sans ce lot la séance A tombe à 19 séries.
  it.each([
    { type: 'A' as const, paliers: 7, travail: 16, total: 23 },
    { type: 'B' as const, paliers: 6, travail: 16, total: 22 },
    { type: 'C' as const, paliers: 4, travail: 12, total: 16 },
  ])('compte $total séries en séance $type', ({ type, paliers, travail: attendu, total }) => {
    const draft = brouillon(type)
    const echauffement = draft.sets.filter((set) => set.role === 'warmup')
    expect(draft.sets).toHaveLength(total)
    expect(echauffement).toHaveLength(paliers)
    expect(draft.sets.length - echauffement.length).toBe(attendu)
  })

  it('ne laisse plus aucun exercice au texte libre', () => {
    for (const type of ['A', 'B', 'C'] as const) {
      // Le champ demeure au contrat pour les séances déjà enregistrées ; un brouillon
      // neuf n'en fabrique plus aucun.
      expect(brouillon(type).accessories).toEqual([])
    }
  })

  it('préremplit les quatre optionnels aux charges de la maquette', () => {
    const a = brouillon('A')
    const b = brouillon('B')

    expect(travail(a, 'a-curls').map((set) => [set.weight, set.reps])).toEqual([
      [12, 10],
      [12, 10],
    ])
    expect(travail(a, 'a-elevations').map((set) => [set.weight, set.reps])).toEqual([
      [8, 12],
      [8, 12],
    ])
    expect(travail(b, 'b-face-pulls').map((set) => [set.weight, set.reps])).toEqual([
      [25, 12],
      [25, 12],
    ])
    // Poids du corps : aucune charge à porter, et surtout pas un zéro qui ressemble à
    // une charge saisie.
    expect(travail(b, 'b-abdos').map((set) => [set.weight, set.reps])).toEqual([
      [null, 10],
      [null, 10],
    ])
  })

  it('les rend sautables sans les rendre facultatifs au moteur', () => {
    // `optional` est une propriété de l'exercice, pas un genre : le moteur les traite
    // comme n'importe quel accessoire, et c'est l'écran qui saura qu'on peut les passer.
    const optionnels = SEANCES.A.exercises.filter((exercise) => exercise.optional)
    expect(optionnels.map((exercise) => exercise.id)).toEqual(['a-curls', 'a-elevations'])
    expect(optionnels.every((exercise) => exercise.kind === 'accessory')).toBe(true)
  })
})

describe('la double progression des optionnels', () => {
  it('fait monter les curls quand les deux séries touchent le haut de la fourchette', () => {
    // Fourchette 10–12, pas de 2 kg au râtelier : 12 kg et 12/12 valent une montée.
    const apres = brouillon('A', [faite('a-curls', 12, [12, 12])])
    expect(travail(apres, 'a-curls').map((set) => [set.weight, set.reps])).toEqual([
      [14, 10],
      [14, 10],
    ])
  })

  it('garde la charge des élévations et repropose ce qu’Ugo a fait', () => {
    // Fourchette 12–20 : 14/13 n'est pas le haut, donc on maintient — et on lui remontre
    // ses propres répétitions, sinon il ne sait plus quoi battre.
    const apres = brouillon('A', [faite('a-elevations', 8, [14, 13])])
    expect(travail(apres, 'a-elevations').map((set) => [set.weight, set.reps])).toEqual([
      [8, 14],
      [8, 13],
    ])
  })

  it('fait monter les face pulls comme n’importe quel accessoire', () => {
    // Arbitrage d'Ugo du 13.09.2026 : « non il faut progresser ». La maquette les disait
    // « hors moteur (poulie) », ce qui revenait à oublier ce qu'il avait tiré — une
    // séance à 30 laissait la proposition à 25, indéfiniment. Ils ont donc une
    // fourchette, et le pas de la colonne est celui du matériel : 5 kg.
    const apres = brouillon('B', [{ ...faite('b-face-pulls', 25, [15, 15]), type: 'B' as const }])
    expect(travail(apres, 'b-face-pulls').map((set) => [set.weight, set.reps])).toEqual([
      [30, 12],
      [30, 12],
    ])
  })

  it('n’oublie plus la charge qu’Ugo a réellement tirée', () => {
    // Le défaut vu en salle le 12.09, dans sa forme générale : une charge notée plus
    // lourde que la table ne doit jamais être remplacée par la table. 30 tiré sans
    // atteindre le haut de la fourchette se maintient à 30, il ne retombe pas à 25.
    const apres = brouillon('B', [{ ...faite('b-face-pulls', 30, [13, 12]), type: 'B' as const }])
    expect(travail(apres, 'b-face-pulls').map((set) => set.weight)).toEqual([30, 30])
  })

  it('laisse les abdos hors du moteur, faute de charge à faire monter', () => {
    // Au poids du corps il n'y a rien à faire monter : la double progression déplace une
    // charge, pas des répétitions. Ils restent à 2×10 et c'est délibéré, pas un oubli.
    const apres = brouillon('B', [{ ...faite('b-abdos', null, [10, 10]), type: 'B' as const }])
    expect(travail(apres, 'b-abdos').map((set) => [set.weight, set.reps])).toEqual([
      [null, 10],
      [null, 10],
    ])
  })
})

describe('ce qu’Ugo avait déjà écrit', () => {
  function stocke(accessories: Draft['accessories'], notes = ''): StoredDraft {
    return { ...brouillon('A'), notes, accessories }
  }

  it('replie une note d’accessoire dans les notes de séance', () => {
    const relu = hydrateDraft(
      stocke([{ exerciseId: 'a-curls', done: false, note: '12 kg, ça passait bien' }]),
    )
    expect(relu.notes).toBe('Curls : 12 kg, ça passait bien')
    expect(relu.accessories).toEqual([])
  })

  it('garde les notes de séance déjà saisies, la note d’accessoire en dessous', () => {
    const relu = hydrateDraft(
      stocke([{ exerciseId: 'a-elevations', done: true, note: '' }], 'Épaule droite sensible'),
    )
    expect(relu.notes).toBe('Épaule droite sensible\nÉlévations latérales ✓')
  })

  it('ne fabrique rien à partir d’un accessoire vide', () => {
    const relu = hydrateDraft(
      stocke([{ exerciseId: 'a-curls', done: false, note: '   ' }], 'Séance courte'),
    )
    expect(relu.notes).toBe('Séance courte')
  })

  it('ne replie pas deux fois le même brouillon', () => {
    const une = hydrateDraft(stocke([{ exerciseId: 'a-curls', done: true, note: '' }]))
    expect(hydrateDraft(une).notes).toBe(une.notes)
  })
})

describe('l’aller-retour d’export', () => {
  it('reproduit une séance dont les optionnels ont été faits', async () => {
    const store = new MemoryStore()
    await store.ready()

    let draft = await store.openDraft('A', '2026-09-15')
    // Les deux séries d'élévations, faites et notées — ce qui était impossible avant
    // CB-69, où elles n'existaient que comme une ligne de texte.
    draft = {
      ...draft,
      sets: draft.sets.map((set) =>
        set.exerciseId === 'a-elevations' && set.role === 'accessory'
          ? { ...set, weight: 10, reps: 15, status: 'validated' as const }
          : set,
      ),
    }
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)

    const relu = validateImport(JSON.parse(serializeExport(await buildExport(store))))
    const seance = relu.seances.find((candidate) => candidate.date === '2026-09-15')
    const elevations = seance?.sets?.filter((set) => set.exerciseId === 'a-elevations')

    expect(elevations?.map((set) => [set.role, set.weight, set.reps, set.status])).toEqual([
      ['accessory', 10, 15, 'validated'],
      ['accessory', 10, 15, 'validated'],
    ])
    // Le résumé lisible les porte aussi : c'est ce qu'Ugo relit dans l'historique.
    expect(seance?.lines.some((line) => line.startsWith('Élévations latérales'))).toBe(true)
  })

  it('accepte encore une séance enregistrée qui porte des accessoires libres', () => {
    // Le champ reste au schéma pour les séances déjà en base. Le retirer rendrait
    // illisible un export produit avant ce lot — et un import qui refuse est un import
    // qui fait perdre des données.
    const fichier = {
      schemaVersion: SCHEMA_VERSION,
      targets: CIBLES,
      seances: [
        {
          id: 'ancienne',
          date: '2026-09-01',
          type: 'A' as const,
          lines: ['Curls : 12 kg × 12'],
          tops: {},
          notes: '',
          accessories: [{ exerciseId: 'a-curls', done: true, note: '12 kg × 12' }],
        },
      ],
    }

    const relu = parseImport(fichier)
    expect(relu.ok).toBe(true)
  })
})
