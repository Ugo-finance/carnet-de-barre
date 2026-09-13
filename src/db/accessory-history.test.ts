/**
 * Les formes de données mal formées d'abord — CB-45 lot B2.
 *
 * Cinq P1 sur le lot précédent, cinq fois la même cause : mes scénarios partaient d'un
 * historique complet et bien formé. Ce fichier prend le problème dans l'autre sens et
 * commence par ce qui manque, ce qui est partiel, ce qui diverge.
 */

import { describe, expect, it } from 'vitest'
import { accessoryHistory, accessoryPlans } from './accessory-history.ts'
import { SEANCES } from '../domain/program.ts'
import type { Seance, SetLog } from '../domain/types.ts'

function set(exerciseId: string, index: number, over: Partial<SetLog> = {}): SetLog {
  return {
    id: `${exerciseId}:accessory:${index}`,
    exerciseId,
    role: 'accessory',
    index,
    status: 'validated',
    loadKind: 'perDumbbell',
    weight: 24,
    reps: 8,
    rpe: null,
    targetWeight: 24,
    targetReps: 8,
    ...over,
  }
}

function seance(date: string, sets: SetLog[] | undefined, ts?: number): Seance {
  return { id: `s-${date}-${ts ?? 0}`, date, type: 'C', lines: [], tops: {}, notes: '', sets, ts }
}

describe('ce qui ne doit pas entrer dans l’historique', () => {
  it('ignore les séances du carnet papier', () => {
    // Les douze séances de départ n'ont pas de séries. En fabriquer depuis leur texte
    // inventerait des données qu'Ugo n'a jamais saisies.
    const papier: Seance = {
      id: 'legacy',
      date: '2026-07-22',
      type: 'C',
      lines: ['Développé incliné : 20 kg/haltère ×8'],
      tops: {},
      notes: '',
      legacy: true,
    }

    expect(accessoryHistory([papier], 'c-di')).toEqual([])
  })

  it('ignore les séries non validées', () => {
    // Une série sautée ou restée pré-remplie est une intention, pas une performance.
    const s = seance('2026-09-20', [
      set('c-di', 0, { status: 'planned' }),
      set('c-di', 1, { status: 'skipped' }),
      set('c-di', 2, { status: 'entered' }),
    ])

    expect(accessoryHistory([s], 'c-di')).toEqual([])
  })

  it('fait disparaître une séance où l’exercice n’a pas été fait', () => {
    // Décisif : une séance sans série validée pour cet exercice n'est pas « une séance
    // à zéro répétition ». La compter comme un passage stérile ferait redescendre la
    // charge parce qu'Ugo a sauté l'exercice une fois.
    const historique = accessoryHistory(
      [seance('2026-09-20', [set('c-presse', 0)]), seance('2026-09-13', [set('c-di', 0)])],
      'c-di',
    )

    expect(historique).toHaveLength(1)
    expect(historique[0].date).toBe('2026-09-13')
  })

  it('ne mélange pas les exercices d’une même séance', () => {
    const s = seance('2026-09-20', [
      set('c-di', 0, { weight: 24 }),
      set('c-presse', 0, { weight: 90 }),
    ])
    expect(accessoryHistory([s], 'c-di')[0].weight).toBe(24)
    expect(accessoryHistory([s], 'c-presse')[0].weight).toBe(90)
  })
})

describe('charges hétérogènes dans une même séance', () => {
  it('retient la plus petite quand les séries divergent', () => {
    // Ugo a commencé à 26 puis est redescendu à 24 : proposer 26 la fois d'après lui
    // donnerait une charge qu'il n'a pas tenue sur l'ensemble de l'exercice.
    const s = seance('2026-09-20', [
      set('c-di', 0, { weight: 26 }),
      set('c-di', 1, { weight: 24 }),
      set('c-di', 2, { weight: 24 }),
    ])

    expect(accessoryHistory([s], 'c-di')[0].weight).toBe(24)
  })

  it('ne laisse pas une série au poids non noté tirer la charge vers le bas', () => {
    // Une charge absente est inconnue, pas nulle. La compter ferait chuter la charge
    // de la séance à cause d'une ligne vide.
    const s = seance('2026-09-20', [
      set('c-di', 0, { weight: 24 }),
      set('c-di', 1, { weight: null }),
      set('c-di', 2, { weight: 24 }),
    ])

    expect(accessoryHistory([s], 'c-di')[0].weight).toBe(24)
  })

  it('rend une charge inconnue si aucune série n’en porte', () => {
    const s = seance('2026-09-20', [set('c-di', 0, { weight: null })])
    expect(accessoryHistory([s], 'c-di')[0].weight).toBeNull()
  })
})

describe('ordre et lecture', () => {
  it('rend la séance la plus récente en premier, quel que soit l’ordre reçu', () => {
    // `planAccessory` lit `history[0]` comme « la dernière fois ». Recevoir l'historique
    // dans l'autre sens ferait progresser la charge à l'envers.
    const historique = accessoryHistory(
      [
        seance('2026-09-06', [set('c-di', 0, { weight: 20 })]),
        seance('2026-09-20', [set('c-di', 0, { weight: 24 })]),
        seance('2026-09-13', [set('c-di', 0, { weight: 22 })]),
      ],
      'c-di',
    )

    expect(historique.map((performance) => performance.weight)).toEqual([24, 22, 20])
  })

  it('garde les répétitions dans l’ordre des séries', () => {
    const s = seance('2026-09-20', [
      set('c-di', 0, { reps: 10 }),
      set('c-di', 1, { reps: 9 }),
      set('c-di', 2, { reps: 8 }),
    ])

    expect(accessoryHistory([s], 'c-di')[0].reps).toEqual([10, 9, 8])
  })
})

describe('l’ordre, quand rien ne garantit qu’il soit déjà bon', () => {
  it('suit le rang contractuel de la série, pas sa place dans le tableau', () => {
    // P2 de Codex. Un import ou une correction peut rendre les séries dans le désordre.
    // S'y fier reproposerait à Ugo ses répétitions sur les mauvaises lignes.
    const s = seance('2026-09-20', [
      set('c-di', 2, { reps: 8 }),
      set('c-di', 0, { reps: 10 }),
      set('c-di', 1, { reps: 9 }),
    ])

    expect(accessoryHistory([s], 'c-di')[0].reps).toEqual([10, 9, 8])
  })

  it('départage deux séances du même jour par leur horodatage', () => {
    // Le contrat autorise deux séances à la même date. Sans départage, la plus
    // ancienne pouvait passer pour la dernière, et le moteur raisonnait sur une
    // charge périmée.
    const historique = accessoryHistory(
      [
        seance('2026-09-20', [set('c-di', 0, { weight: 24 })], 1),
        seance('2026-09-20', [set('c-di', 0, { weight: 26 })], 2),
      ],
      'c-di',
    )

    expect(historique.map((performance) => performance.weight)).toEqual([26, 24])
  })

  it('range une séance sans horodatage en dernier dans sa journée', () => {
    // Déterministe, et sans inventer de chronologie. En pratique les seules séances
    // sans `ts` viennent du carnet papier, déjà écartées faute de séries.
    const historique = accessoryHistory(
      [
        seance('2026-09-20', [set('c-di', 0, { weight: 24 })]),
        seance('2026-09-20', [set('c-di', 0, { weight: 26 })], 5),
      ],
      'c-di',
    )

    expect(historique.map((performance) => performance.weight)).toEqual([26, 24])
  })
})

describe('les plans d’une séance entière', () => {
  const exercicesC = SEANCES.C.exercises
  const exercicesA = SEANCES.A.exercises

  it('décide ensemble les dips et les tractions', () => {
    // Charge commune : les dips ont passé 3×10, les tractions non, donc personne ne
    // monte. Les planifier séparément les ferait diverger.
    const plans = accessoryPlans(exercicesA, [
      seance('2026-09-20', [
        set('a-dips', 0, { loadKind: 'added', weight: 10, reps: 10 }),
        set('a-dips', 1, { loadKind: 'added', weight: 10, reps: 10 }),
        set('a-dips', 2, { loadKind: 'added', weight: 10, reps: 10 }),
        set('a-tractions-lestees', 0, { loadKind: 'added', weight: 10, reps: 9 }),
        set('a-tractions-lestees', 1, { loadKind: 'added', weight: 10, reps: 9 }),
        set('a-tractions-lestees', 2, { loadKind: 'added', weight: 10, reps: 8 }),
      ]),
    ])

    expect(plans.get('a-dips')?.weight).toBe(10)
    expect(plans.get('a-tractions-lestees')?.weight).toBe(10)
  })

  it('rend la charge de départ pour un exercice absent de tout l’historique', () => {
    const plans = accessoryPlans(exercicesC, [])
    expect(plans.get('c-di')).toMatchObject({ weight: 24, outcome: 'depart' })
  })

  it('suit ce qu’Ugo a fait plutôt que la table', () => {
    // Le défaut de départ : l'app affichait 20 kg pendant qu'il en tirait 24. Ici la
    // table dit 24 et il en a tiré 26 — c'est 26 qui doit revenir.
    const plans = accessoryPlans(exercicesC, [
      seance('2026-09-20', [
        set('c-di', 0, { weight: 26, reps: 8 }),
        set('c-di', 1, { weight: 26, reps: 8 }),
        set('c-di', 2, { weight: 26, reps: 8 }),
      ]),
    ])

    expect(plans.get('c-di')).toMatchObject({ weight: 26, outcome: 'maintien' })
  })
})
