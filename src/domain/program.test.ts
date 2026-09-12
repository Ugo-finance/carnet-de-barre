import { describe, expect, it } from 'vitest'
import { LIFTS, RUSHED_EXERCISE_COUNT, SEANCES, WEEKDAY_TO_TYPE, findExercise } from './program.ts'
import type { SeanceType } from './types.ts'

const TYPES: SeanceType[] = ['A', 'B', 'C']

describe('programme', () => {
  it('donne les incréments et répétitions de la spec', () => {
    expect(LIFTS.squat).toMatchObject({ inc: 2.5, reps: 4 })
    expect(LIFTS.bench).toMatchObject({ inc: 2.5, reps: 4 })
    expect(LIFTS.deadlift).toMatchObject({ inc: 5, reps: 3 })
    expect(LIFTS.tractions).toMatchObject({ inc: 2.5, reps: 4 })
    expect(LIFTS.benchVol).toMatchObject({ inc: 2.5, reps: 8 })
  })

  it('ne calcule les plaques que pour les charges à la barre', () => {
    expect(LIFTS.tractions.loadKind).toBe('added')
    expect(LIFTS.squat.loadKind).toBe('barTotal')
  })

  it('donne des identifiants d’exercice uniques sur tout le programme', () => {
    const ids = TYPES.flatMap((type) => SEANCES[type].exercises.map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('place le développé incliné en deuxième exercice de la séance C', () => {
    // Le prototype le rangeait parmi les accessoires ; la spec en fait l'exercice 2,
    // il doit donc rester visible en mode pressé.
    const deuxieme = SEANCES.C.exercises[1]
    expect(deuxieme.id).toBe('c-di')
    expect(deuxieme.label).toContain('Développé incliné')
  })

  it('garde un exercice piloté par le moteur en tête de chaque séance', () => {
    expect(SEANCES.A.exercises[0].lift).toBe('squat')
    expect(SEANCES.B.exercises[0].lift).toBe('bench')
    expect(SEANCES.C.exercises[0].lift).toBe('deadlift')
  })

  it('applique des backoffs à −10 % sauf aux tractions, fixées à +7,5 kg', () => {
    expect(SEANCES.A.exercises[0].backoff).toEqual({ count: 2, reps: 5, ratio: 0.9 })
    expect(SEANCES.C.exercises[0].backoff).toEqual({ count: 2, reps: 4, ratio: 0.9 })
    const tractions = SEANCES.B.exercises[1]
    expect(tractions.lift).toBe('tractions')
    expect(tractions.backoff).toEqual({ count: 2, reps: 6, fixed: 7.5 })
  })

  it('laisse au moins deux exercices en mode pressé dans chaque séance', () => {
    for (const type of TYPES) {
      expect(SEANCES[type].exercises.length).toBeGreaterThanOrEqual(RUSHED_EXERCISE_COUNT)
    }
  })

  it('groupe les supersets par paires', () => {
    for (const type of TYPES) {
      const groupes = new Map<string, number>()
      for (const exercice of SEANCES[type].exercises) {
        if (!exercice.supersetGroup) continue
        groupes.set(exercice.supersetGroup, (groupes.get(exercice.supersetGroup) ?? 0) + 1)
      }
      for (const [, compte] of groupes) expect(compte).toBe(2)
    }
  })

  it('repose plus longtemps sur les lifts lourds que sur les supersets', () => {
    for (const type of TYPES) {
      const principal = SEANCES[type].exercises[0]
      const superset = SEANCES[type].exercises.find((e) => e.supersetGroup)
      if (!superset) continue
      expect(principal.restSeconds).toBeGreaterThan(superset.restSeconds)
    }
  })

  it('donne soit des répétitions cibles, soit une fourchette, soit un AMRAP', () => {
    for (const type of TYPES) {
      for (const exercice of SEANCES[type].exercises) {
        const defini =
          exercice.reps !== null || exercice.repsRange !== undefined || exercice.amrap === true
        expect(defini, `${exercice.id} n'a aucune consigne de répétitions`).toBe(true)
      }
    }
  })

  it('ne demande pas de charge sur un exercice au poids de corps', () => {
    for (const type of TYPES) {
      for (const exercice of SEANCES[type].exercises) {
        if (exercice.loadKind === 'bodyweight') {
          expect(exercice.suggestedWeight).toBeUndefined()
        }
      }
    }
  })

  it('fait tourner dimanche C, mardi A, jeudi B', () => {
    expect(WEEKDAY_TO_TYPE[0]).toBe('C')
    expect(WEEKDAY_TO_TYPE[2]).toBe('A')
    expect(WEEKDAY_TO_TYPE[4]).toBe('B')
    expect(WEEKDAY_TO_TYPE[1]).toBeUndefined()
  })

  it('retrouve un exercice par son identifiant', () => {
    expect(findExercise('c-di')?.label).toContain('Développé incliné')
    expect(findExercise('inexistant')).toBeUndefined()
  })
})
