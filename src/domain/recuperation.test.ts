import { describe, expect, it } from 'vitest'
import { dureeRecuperation } from './recuperation.ts'
import type { Draft } from './types.ts'

const chrono = (timerEndsAt: number | null, timerStartedAt: number | null) =>
  ({ timerEndsAt, timerStartedAt }) as Draft

describe('durée de la récupération en cours', () => {
  it('se dérive du début et de l’échéance', () => {
    expect(dureeRecuperation(chrono(150_000, 0))).toBe(150)
  })

  it('grandit d’un +30 s sans que rien ne soit resynchronisé', () => {
    // Tout l'intérêt de stocker un début plutôt qu'une durée : l'ajustement ne touche
    // que l'échéance, et la durée suit. Un second compteur serait à corriger ici, et
    // `shiftedDeadline` écrête — il divergerait dès le premier ajustement tronqué.
    expect(dureeRecuperation(chrono(180_000, 0))).toBe(180)
  })

  it('suit l’écrêtage d’un −30 s qui ne pouvait pas retirer 30 s', () => {
    // 20 s restantes sur 150 : le −30 s ramène l'échéance à maintenant, pas 30 s avant.
    // La durée devient donc l'écoulé réel, 130 s, et la barre se remplit — au lieu de
    // 120 s, qui ferait un écoulé supérieur au total.
    expect(dureeRecuperation(chrono(130_000, 0))).toBe(130)
  })

  it('ne rend rien quand aucun chrono ne court', () => {
    expect(dureeRecuperation(chrono(null, null))).toBeUndefined()
  })

  it('ne rend rien pour une récupération armée avant que le début ne soit persisté', () => {
    // L'appelant retombe alors sur son approximation plutôt que d'afficher une durée
    // inventée. Une vieille séance reste reprenable.
    expect(dureeRecuperation(chrono(150_000, null))).toBeUndefined()
  })

  it('ne descend jamais sous une seconde', () => {
    // `RecoveryScreen` divise par le maximum : un zéro y produirait une barre absurde.
    expect(dureeRecuperation(chrono(1_000, 1_000))).toBe(1)
  })
})
