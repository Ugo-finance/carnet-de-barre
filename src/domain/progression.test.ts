import { describe, expect, it } from 'vitest'
import {
  applyTopSet,
  applyVolumeSets,
  backoffWeight,
  roundToStep,
  type Attempt,
} from './progression.ts'
import { SEANCES } from './program.ts'
import type { Target } from './types.ts'

/** Cibles de départ, celles du 12.09.2026. */
function target(partial: Partial<Target> & { w: number }): Target {
  return { inc: 2.5, reps: 4, fail: null, ...partial }
}

const SQUAT = () => target({ w: 75 })
const BENCH = () => target({ w: 70 })
const DEADLIFT = () => target({ w: 92.5, inc: 5, reps: 3 })
const TRACTIONS = () => target({ w: 15 })
const BENCH_VOL = () => target({ w: 60, reps: 8, sets: 3 })

function attempt(weight: number | null, reps: number | null, rpe: number | null): Attempt {
  return { weight, reps, rpe }
}

describe('arrondi au pas de charge', () => {
  it('arrondit au multiple de 2,5 le plus proche', () => {
    expect(roundToStep(69.375)).toBe(70)
    expect(roundToStep(74)).toBe(75)
    expect(roundToStep(61.25)).toBe(62.5)
    expect(roundToStep(83.25)).toBe(82.5)
  })

  it('ne laisse pas traîner de flottant approximatif', () => {
    expect(roundToStep(62.5 * 0.9)).toBe(57.5)
    expect(String(roundToStep(0.1 + 0.2))).not.toContain('0000')
  })
})

describe('succès', () => {
  it('progresse de l’incrément quand les répétitions sont faites à RPE 8', () => {
    const result = applyTopSet('squat', SQUAT(), attempt(75, 4, 8))
    expect(result?.target.w).toBe(77.5)
    expect(result?.event.outcome).toBe('progresse')
  })

  it('progresse de 5 kg au soulevé de terre, pas de 2,5', () => {
    const result = applyTopSet(
      'deadlift',
      target({ w: 87.5, inc: 5, reps: 3 }),
      attempt(87.5, 3, 8),
    )
    expect(result?.target.w).toBe(92.5)
  })

  it('compte comme un succès un RPE inférieur à 8', () => {
    expect(applyTopSet('bench', BENCH(), attempt(70, 4, 7))?.target.w).toBe(72.5)
    expect(applyTopSet('bench', BENCH(), attempt(70, 5, 7.5))?.target.w).toBe(72.5)
  })

  it('efface un échec en attente', () => {
    const avec = target({ w: 75, fail: 75 })
    const result = applyTopSet('squat', avec, attempt(75, 4, 8))
    expect(result?.target.fail).toBeNull()
    expect(result?.target.w).toBe(77.5)
  })

  it('part du poids réalisé quand il dépasse la cible', () => {
    const result = applyTopSet('squat', SQUAT(), attempt(80, 4, 8))
    expect(result?.target.w).toBe(82.5)
  })

  it('ne fait jamais redescendre une cible sur une séance volontairement légère', () => {
    // Cible 75, top set à 70 mené facilement : 72,5 serait une régression.
    const result = applyTopSet('squat', SQUAT(), attempt(70, 4, 8))
    expect(result?.target.w).toBe(75)
    expect(result?.event.outcome).toBe('inchange')
  })

  it('applique le signe du lest aux tractions dans le message', () => {
    const result = applyTopSet('tractions', TRACTIONS(), attempt(15, 4, 8))
    expect(result?.target.w).toBe(17.5)
    expect(result?.event.message).toContain('+17,5 kg')
  })
})

describe('maintien : ce qui n’est ni un succès ni un échec', () => {
  it('maintient la cible à RPE 8,5 avec les répétitions faites', () => {
    const result = applyTopSet('squat', SQUAT(), attempt(75, 4, 8.5))
    expect(result?.target.w).toBe(75)
    expect(result?.event.outcome).toBe('maintien')
  })

  it('ne crée pas d’échec en attente à RPE 8,5', () => {
    // Le prototype comptait 8,5 comme un échec ; la spec ne le dit pas.
    expect(applyTopSet('squat', SQUAT(), attempt(75, 4, 8.5))?.target.fail).toBeNull()
  })

  it('conserve un échec déjà en attente lors d’un maintien', () => {
    const avec = target({ w: 75, fail: 75 })
    expect(applyTopSet('squat', avec, attempt(75, 4, 8.5))?.target.fail).toBe(75)
  })

  it('maintient la cible quand le RPE n’est pas noté mais les répétitions sont faites', () => {
    const result = applyTopSet('bench', BENCH(), attempt(70, 4, null))
    expect(result?.target.w).toBe(70)
    expect(result?.event.outcome).toBe('maintien')
  })

  it('ne prend jamais des répétitions inconnues pour un échec', () => {
    // 03.09.2026 : « Tractions : +20 solide », répétitions jamais notées.
    const result = applyTopSet('tractions', TRACTIONS(), attempt(20, null, null))
    expect(result?.event.outcome).toBe('maintien')
    expect(result?.target.fail).toBeNull()
  })

  it('ne décide rien si rien n’a été soulevé', () => {
    expect(applyTopSet('squat', SQUAT(), attempt(null, null, null))).toBeNull()
  })
})

describe('échec et reset', () => {
  it('retient la charge au premier échec par répétitions manquées', () => {
    const result = applyTopSet('bench', target({ w: 75 }), attempt(75, 3, null))
    expect(result?.target.w).toBe(75)
    expect(result?.target.fail).toBe(75)
    expect(result?.event.outcome).toBe('second-essai')
  })

  it('retient la charge au premier échec par RPE 9', () => {
    const result = applyTopSet('squat', target({ w: 80 }), attempt(80, 4, 9))
    expect(result?.target.fail).toBe(80)
    expect(result?.event.outcome).toBe('second-essai')
  })

  it('compte un RPE 9,5 comme un échec', () => {
    expect(applyTopSet('squat', target({ w: 80 }), attempt(80, 4, 9.5))?.target.fail).toBe(80)
  })

  it('reset à −7,5 % au deuxième échec à la même charge', () => {
    // 08.09.2026 : deuxième 80×4 @9 → reset à 75. 80 × 0,925 = 74 → 75.
    const result = applyTopSet('squat', target({ w: 80, fail: 80 }), attempt(80, 4, 9))
    expect(result?.target.w).toBe(75)
    expect(result?.target.fail).toBeNull()
    expect(result?.event.outcome).toBe('reset')
  })

  it('reset le développé couché de 75 à 70', () => {
    // 10.09.2026 : deuxième 75×3 → reset à 70. 75 × 0,925 = 69,375 → 70.
    const result = applyTopSet('bench', target({ w: 75, fail: 75 }), attempt(75, 3, null))
    expect(result?.target.w).toBe(70)
    expect(result?.target.fail).toBeNull()
  })

  it('repart du poids réalisé quand il diffère de la cible', () => {
    // Cible 75, échec à 72,5 : c'est 72,5 qu'il faut retenter, pas 75.
    const result = applyTopSet('squat', SQUAT(), attempt(72.5, 3, null))
    expect(result?.target.w).toBe(72.5)
    expect(result?.target.fail).toBe(72.5)
  })

  it('remplace la charge suivie quand l’échec survient à une autre charge', () => {
    const result = applyTopSet('squat', target({ w: 80, fail: 80 }), attempt(77.5, 3, null))
    expect(result?.target.fail).toBe(77.5)
    expect(result?.target.w).toBe(77.5)
    expect(result?.event.outcome).toBe('second-essai')
  })

  it('ne reset pas deux fois de suite sans nouvel échec', () => {
    const apresReset = applyTopSet('squat', target({ w: 80, fail: 80 }), attempt(80, 4, 9))!
    const suivant = applyTopSet('squat', apresReset.target, attempt(75, 4, 8))!
    expect(suivant.target.w).toBe(77.5)
    expect(suivant.event.outcome).toBe('progresse')
  })
})

describe('double progression du développé couché volume', () => {
  const trois = (w: number, reps: number): Attempt[] => [
    attempt(w, reps, null),
    attempt(w, reps, null),
    attempt(w, reps, null),
  ]

  it('progresse quand les trois séries atteignent huit répétitions à la cible', () => {
    const result = applyVolumeSets('benchVol', BENCH_VOL(), trois(60, 8))
    expect(result?.target.w).toBe(62.5)
    expect(result?.event.outcome).toBe('progresse')
  })

  it('maintient si une seule série manque une répétition', () => {
    const sets = [attempt(60, 8, null), attempt(60, 8, null), attempt(60, 7, null)]
    const result = applyVolumeSets('benchVol', BENCH_VOL(), sets)
    expect(result?.target.w).toBe(60)
    expect(result?.event.outcome).toBe('maintien')
  })

  it('ne progresse pas sur deux séries seulement', () => {
    const sets = [attempt(60, 8, null), attempt(60, 8, null)]
    expect(applyVolumeSets('benchVol', BENCH_VOL(), sets)?.target.w).toBe(60)
  })

  it('ne progresse pas si la charge est sous la cible', () => {
    expect(applyVolumeSets('benchVol', BENCH_VOL(), trois(55, 8))?.target.w).toBe(60)
  })

  it('part de la série la plus légère quand les charges diffèrent', () => {
    const sets = [attempt(62.5, 8, null), attempt(60, 8, null), attempt(62.5, 8, null)]
    expect(applyVolumeSets('benchVol', BENCH_VOL(), sets)?.target.w).toBe(62.5)
  })

  it('ne décide rien sans aucune série renseignée', () => {
    expect(applyVolumeSets('benchVol', BENCH_VOL(), [])).toBeNull()
  })
})

describe('backoffs', () => {
  it('prend 90 % du top set réalisé, arrondi à 2,5 kg', () => {
    const squat = SEANCES.A.exercises[0].backoff!
    expect(backoffWeight(75, squat)).toBe(67.5)
    expect(backoffWeight(80, squat)).toBe(72.5)
    expect(backoffWeight(92.5, squat)).toBe(82.5)
  })

  it('garde la charge fixe des tractions quelle que soit celle du top set', () => {
    const tractions = SEANCES.B.exercises[1].backoff!
    expect(backoffWeight(15, tractions)).toBe(7.5)
    expect(backoffWeight(20, tractions)).toBe(7.5)
  })
})

describe('rejeu de scénarios connus de l’historique', () => {
  it('reproduit la stagnation du squat de septembre', () => {
    // 01.09 : 80×4 @9 → deuxième essai à 80. 08.09 : 80×4 @9 → reset à 75.
    let cible = target({ w: 80 })
    cible = applyTopSet('squat', cible, attempt(80, 4, 9))!.target
    expect(cible.w).toBe(80)
    expect(cible.fail).toBe(80)
    cible = applyTopSet('squat', cible, attempt(80, 4, 9))!.target
    expect(cible.w).toBe(75)
    expect(cible.fail).toBeNull()
  })

  it('reproduit la stagnation du développé couché de septembre', () => {
    // 03.09 puis 10.09 : 75×3 au lieu de 4, RPE non noté → échec puis reset à 70.
    let cible = target({ w: 75 })
    cible = applyTopSet('bench', cible, attempt(75, 3, null))!.target
    expect(cible).toMatchObject({ w: 75, fail: 75 })
    cible = applyTopSet('bench', cible, attempt(75, 3, null))!.target
    expect(cible.w).toBe(70)
  })

  it('enchaîne les succès du soulevé de terre par paliers de 5 kg', () => {
    let cible = DEADLIFT()
    for (const poids of [92.5, 97.5, 102.5]) {
      const résultat = applyTopSet('deadlift', cible, attempt(poids, 3, 8))!
      cible = résultat.target
    }
    expect(cible.w).toBe(107.5)
  })

  it('n’altère jamais la cible passée en argument', () => {
    const origine = SQUAT()
    applyTopSet('squat', origine, attempt(75, 4, 8))
    expect(origine.w).toBe(75)
    expect(origine.fail).toBeNull()
  })
})
