/**
 * Les paliers d'échauffement n'entrent ni dans le résumé ni dans la progression — CB-55.
 *
 * Le risque du lot tient en une phrase : une série de plus dans le brouillon ne doit rien
 * changer aux cibles d'Ugo. Le test central ne vérifie donc pas une valeur attendue, mais
 * une **égalité entre deux séances** — la même, avec et sans paliers. Une valeur attendue
 * écrite à la main resterait vraie si les deux chemins se trompaient ensemble.
 */

import { describe, expect, it } from 'vitest'
import { applyProgression, deriveSeance, validatedSets, workingSets } from './derive.ts'
import { buildDraft } from './draft.ts'
import { SCHEMA_VERSION, parseImport } from '../domain/schema.ts'
import { BAR_WEIGHT } from '../domain/program.ts'
import type { Draft, SetLog, Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

/** Un palier d'échauffement tel que CB-56 en posera dans le brouillon. */
function palier(exerciseId: string, index: number, weight: number | null, reps: number): SetLog {
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

/** Une séance A entière, toutes séries de travail validées telles que proposées. */
function seanceAFaite(): Draft {
  const draft = buildDraft('A', '2026-09-15', CIBLES, { id: 'seance-a', now: 1 })
  return { ...draft, sets: draft.sets.map((set) => ({ ...set, status: 'validated' as const })) }
}

/** La même, précédée des quatre paliers de squat et des deux du développé volume. */
function avecPaliers(draft: Draft): Draft {
  return {
    ...draft,
    sets: [
      palier('a-squat', 0, BAR_WEIGHT, 8),
      palier('a-squat', 1, 37.5, 5),
      palier('a-squat', 2, 52.5, 3),
      palier('a-squat', 3, 65, 1),
      palier('a-bench-vol', 0, BAR_WEIGHT, 10),
      palier('a-bench-vol', 1, 40, 5),
      ...draft.sets,
    ],
  }
}

describe('une séance échauffée donne exactement les mêmes cibles', () => {
  it('ne fait bouger aucune cible, ni aucun événement', () => {
    // Le test qui porte le lot. Aucune valeur écrite à la main : on compare la séance à
    // elle-même. Si les paliers entraient dans le moteur, la cible du développé volume
    // tomberait à 20 kg — c'est la plus légère des séries validées qui y fait foi.
    const nue = applyProgression(seanceAFaite(), CIBLES)
    const echauffee = applyProgression(avecPaliers(seanceAFaite()), CIBLES)

    expect(echauffee.targets).toEqual(nue.targets)
    expect(echauffee.events).toEqual(nue.events)
  })

  it('ne fait bouger aucune ligne du résumé', () => {
    expect(deriveSeance(avecPaliers(seanceAFaite()))).toEqual(deriveSeance(seanceAFaite()))
  })

  it('n’écrit aucun palier dans les tops', () => {
    // Contrôle direct de la valeur, en plus de l'égalité : un test qui ne compare que deux
    // chemins reste vert si les deux se trompent de la même façon.
    const { tops } = deriveSeance(avecPaliers(seanceAFaite()))
    expect(tops.benchVol?.w).toBe(60)
    expect(tops.squat?.w).toBe(75)
  })

  it('ne laisse aucune charge d’échauffement dans le résumé lisible', () => {
    const { lines } = deriveSeance(avecPaliers(seanceAFaite()))
    const squat = lines.find((ligne) => ligne.startsWith('Squat'))
    expect(squat).toBeDefined()
    expect(squat).not.toContain('37,5')
    expect(squat).not.toContain('52,5')
  })
})

describe('ce que les paliers ne perdent pas pour autant', () => {
  it('reste dans les séries validées, qui gardent leur nom', () => {
    // `validatedSets` doit rendre ce qui a été fait, `workingSets` ce qui compte. Les
    // confondre ferait disparaître les paliers de l'export, et une séance ne se
    // reproduirait plus telle qu'elle a eu lieu.
    const draft = avecPaliers(seanceAFaite())
    expect(validatedSets(draft).length - workingSets(draft).length).toBe(6)
    expect(validatedSets(draft).some((set) => set.role === 'warmup')).toBe(true)
    expect(workingSets(draft).some((set) => set.role === 'warmup')).toBe(false)
  })

  it('survit à un aller-retour par le format d’échange', () => {
    const draft = avecPaliers(seanceAFaite())
    const fichier = {
      schemaVersion: SCHEMA_VERSION,
      targets: CIBLES,
      seances: [
        {
          id: draft.id,
          date: draft.date,
          type: draft.type,
          ...deriveSeance(draft),
          notes: '',
          sets: draft.sets,
        },
      ],
    }

    const relu = parseImport(JSON.parse(JSON.stringify(fichier)))
    expect(relu.ok, relu.ok ? '' : relu.message).toBe(true)
    if (!relu.ok || relu.format !== 'current') throw new Error('format inattendu')
    const paliers = relu.data.seances[0]!.sets!.filter((set) => set.role === 'warmup')
    expect(paliers).toHaveLength(6)
    expect(paliers[0]!.weight).toBe(BAR_WEIGHT)
  })
})

describe('la version du format', () => {
  it('annonce 2', () => {
    expect(SCHEMA_VERSION).toBe(2)
  })

  it('lit encore un export en version 1', () => {
    // L'évolution est additive : rien n'a été retiré, et un fichier produit avant ce lot
    // doit s'importer sans changement.
    const v1 = {
      schemaVersion: 1,
      targets: CIBLES,
      seances: [
        {
          id: 'ancienne',
          date: '2026-09-10',
          type: 'C',
          lines: ['Deadlift : 92,5×3 @8'],
          tops: { deadlift: { w: 92.5, reps: 3, rpe: 8 } },
          notes: '',
        },
      ],
    }

    expect(parseImport(v1).ok).toBe(true)
  })

  it('refuse toujours une version qu’elle ne sait pas lire', () => {
    // Le refus doit rester **en avant** de la version courante, et pas être resté figé
    // sur l'ancienne valeur : un fichier v2 doit désormais passer, un v3 non.
    const base = { targets: CIBLES, seances: [] }
    expect(parseImport({ ...base, schemaVersion: 2 }).ok).toBe(true)

    const futur = parseImport({ ...base, schemaVersion: 3 })
    expect(futur.ok).toBe(false)
    if (futur.ok) throw new Error('aurait dû être refusé')
    expect(futur.reason).toBe('unsupported-version')
  })
})
