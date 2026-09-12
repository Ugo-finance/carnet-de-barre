import { describe, expect, it } from 'vitest'
import { TargetAdjustmentError, applyTargetPatch } from './targets.ts'
import { applyTopSet } from '../domain/progression.ts'
import type { Targets } from '../domain/types.ts'

const cibles = (): Targets => ({
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: 70 },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
})

describe('ajustement manuel', () => {
  it('pose la charge demandée et date la modification', () => {
    const apres = applyTargetPatch(cibles(), 'squat', { w: 77.5 }, '2026-09-20')
    expect(apres.squat.w).toBe(77.5)
    expect(apres.updatedAt).toBe('2026-09-20')
  })

  it('arrondit au pas de charge disponible en salle', () => {
    expect(applyTargetPatch(cibles(), 'squat', { w: 76 }, '2026-09-20').squat.w).toBe(75)
    expect(applyTargetPatch(cibles(), 'squat', { w: 76.5 }, '2026-09-20').squat.w).toBe(77.5)
  })

  it('périme l’échec en attente quand la cible se déplace', () => {
    // L'échec portait sur 70. Poser 65 rend cette mémoire caduque : un échec à 65
    // n'est pas le deuxième échec à 70.
    const apres = applyTargetPatch(cibles(), 'bench', { w: 65 }, '2026-09-20')
    expect(apres.bench.w).toBe(65)
    expect(apres.bench.fail).toBeNull()
  })

  it('efface l’échec sans toucher à la charge', () => {
    const apres = applyTargetPatch(cibles(), 'bench', { fail: null }, '2026-09-20')
    expect(apres.bench.w).toBe(70)
    expect(apres.bench.fail).toBeNull()
  })

  it('ne touche pas aux autres lifts', () => {
    const apres = applyTargetPatch(cibles(), 'squat', { w: 80 }, '2026-09-20')
    expect(apres.deadlift).toEqual(cibles().deadlift)
    expect(apres.bench.fail).toBe(70)
  })

  it('ne modifie jamais l’objet reçu', () => {
    const origine = cibles()
    applyTargetPatch(origine, 'squat', { w: 100 }, '2026-09-20')
    expect(origine.squat.w).toBe(75)
  })

  it('rend l’objet inchangé si le patch est vide', () => {
    const origine = cibles()
    expect(applyTargetPatch(origine, 'squat', {}, '2026-09-20')).toBe(origine)
  })

  it('refuse une charge absurde plutôt que de l’écrire', () => {
    // Une faute de frappe se corrige mal une fois en base.
    expect(() => applyTargetPatch(cibles(), 'squat', { w: 0 }, '2026-09-20')).toThrow(
      TargetAdjustmentError,
    )
    expect(() => applyTargetPatch(cibles(), 'squat', { w: -10 }, '2026-09-20')).toThrow()
    expect(() => applyTargetPatch(cibles(), 'squat', { w: 7500 }, '2026-09-20')).toThrow(/500 kg/)
    expect(() => applyTargetPatch(cibles(), 'squat', { w: Number.NaN }, '2026-09-20')).toThrow()
  })
})

describe('le moteur repart bien de la valeur posée', () => {
  it('enchaîne un ajustement puis un succès', () => {
    // Scénario d'acceptation du ticket : cible portée à 77,5, réussite à 77,5 → 80.
    const apres = applyTargetPatch(cibles(), 'squat', { w: 77.5 }, '2026-09-20')
    const resultat = applyTopSet('squat', apres.squat, { weight: 77.5, reps: 4, rpe: 8 })
    expect(resultat?.target.w).toBe(80)
  })

  it('redonne deux essais après avoir effacé un échec', () => {
    // Sans effacement, un échec à 70 aurait déclenché le reset immédiat.
    const apres = applyTargetPatch(cibles(), 'bench', { fail: null }, '2026-09-20')
    const resultat = applyTopSet('bench', apres.bench, { weight: 70, reps: 3, rpe: null })
    expect(resultat?.target.w).toBe(70)
    expect(resultat?.target.fail).toBe(70)
    expect(resultat?.event.outcome).toBe('second-essai')
  })

  it('descend une cible partie trop haut après une coupure', () => {
    // Le cas réel : trois semaines d'arrêt en août, la cible ne le sait pas.
    const apres = applyTargetPatch(cibles(), 'deadlift', { w: 80 }, '2026-09-20')
    expect(apres.deadlift.w).toBe(80)
    const resultat = applyTopSet('deadlift', apres.deadlift, { weight: 80, reps: 3, rpe: 8 })
    expect(resultat?.target.w).toBe(85)
  })
})
