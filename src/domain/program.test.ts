import { describe, expect, it } from 'vitest'
import {
  LIFTS,
  RUSHED_EXERCISE_COUNT,
  SEANCES,
  WEEKDAY_TO_TYPE,
  findExercise,
  weightStepFor,
} from './program.ts'
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

describe('pas de charge du matériel', () => {
  it('avance de 2 kg sur les haltères et de 2,5 sur la barre', () => {
    // Le râtelier de la salle va de 2 en 2 : 20, 22, 24. La grille de 2,5 héritée de
    // l'ancien carnet proposait des haltères qui n'existent pas.
    expect(weightStepFor('perDumbbell')).toBe(2)
    expect(weightStepFor('barTotal')).toBe(2.5)
    expect(weightStepFor('added')).toBe(2.5)
  })

  it('avance de 5 kg sur les machines', () => {
    // La presse 45° monte par disques de 5 à 10 kg, confirmé par le coach d'Ugo le
    // 13.09.2026. La valeur était à 2,5 et marquée « non vérifiée » ; elle l'est.
    expect(weightStepFor('machine')).toBe(5)
  })

  it('ne propose aucune charge absente du matériel', () => {
    // Le test parcourt la table entière plutôt que d'énumérer les exercices : un
    // exercice ajouté plus tard est couvert sans que personne ait à y penser. C'est
    // ainsi que le rowing à 22,5 kg a été trouvé, et il traînait depuis le début.
    const horsGrille = Object.values(SEANCES).flatMap((seance) =>
      seance.exercises
        .filter((exercise) => exercise.suggestedWeight != null)
        .filter((exercise) => {
          const pas = weightStepFor(exercise.loadKind)
          return (
            Math.abs(
              exercise.suggestedWeight! / pas - Math.round(exercise.suggestedWeight! / pas),
            ) > 1e-9
          )
        })
        .map((exercise) => `${exercise.id} : ${exercise.suggestedWeight} kg`),
    )

    expect(horsGrille).toEqual([])
  })
})

describe('fourchettes de répétitions du coach', () => {
  // Arbitrage du 13.09.2026. Le pas de 2 kg des haltères fait +10 % sur un haltère de
  // 20 : une fourchette 8–10 est trop étroite pour l'absorber, on monte trop vite puis
  // on rate. Les fourchettes sont élargies pour que la charge tienne plus longtemps.
  const fourchette = (id: string): readonly [number, number] | undefined =>
    findExercise(id)?.repsRange

  it('élargit à 8–12 les trois exercices aux haltères qui progressent', () => {
    expect(fourchette('c-di')).toEqual([8, 12])
    expect(fourchette('b-rowing')).toEqual([8, 12])
    expect(fourchette('b-dm')).toEqual([8, 12])
  })

  it('élargit à 12–20 les élévations latérales des deux séances', () => {
    // 8 → 10 kg fait +25 % : c'est l'exercice où le saut relatif est le plus brutal.
    expect(fourchette('a-elevations')).toEqual([12, 20])
    expect(fourchette('c-elevations')).toEqual([12, 20])
  })

  it('laisse la presse à 10–12, ses disques étant assez fins', () => {
    expect(fourchette('c-presse')).toEqual([10, 12])
  })

  it('ne touche pas aux exercices sur lesquels le coach ne s’est pas prononcé', () => {
    // Curls et dips lestés gardent leur fourchette : élargir au-delà de ce qui a été
    // demandé serait inventer du programme.
    expect(fourchette('a-curls')).toEqual([10, 12])
    expect(fourchette('a-dips')).toEqual([8, 10])
  })

  it('porte la cible du développé incliné à 24 kg par haltère', () => {
    // La table portait encore 20, la charge d'avant. L'export du 12.09 montre Ugo à 24,
    // et son coach a entériné cette cible : il y reste jusqu'à 3×12, puis 26 en 3×8.
    expect(findExercise('c-di')?.suggestedWeight).toBe(24)
  })

  it('ne déplace la charge d’aucun autre exercice aux haltères', () => {
    // Écrit après m'être trompé d'exercice : mon premier remplacement a posé les 24 kg
    // sur le développé militaire, dont la charge ne bougeait pas. Un test qui n'affirme
    // que la valeur voulue ne dit rien de celles qu'on a déplacées par accident.
    expect(findExercise('b-dm')?.suggestedWeight).toBe(20)
    expect(findExercise('b-rowing')?.suggestedWeight).toBe(22)
  })

  it('annonce dans le libellé la fourchette réellement appliquée', () => {
    // Le schéma est ce qu'Ugo lit en salle : le laisser dire 8–10 pendant que le moteur
    // vise 12 lui ferait arrêter ses séries deux répétitions trop tôt.
    for (const id of ['c-di', 'b-rowing', 'b-dm']) {
      expect(findExercise(id)?.scheme).toContain('8–12')
    }
    expect(findExercise('a-elevations')?.scheme).toContain('12–20')
    expect(findExercise('c-elevations')?.scheme).toContain('12–20')
  })
})
