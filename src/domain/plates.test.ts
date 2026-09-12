import { describe, expect, it } from 'vitest'
import { describePlates, platesPerSide } from './plates.ts'
import { BAR_WEIGHT, PLATES } from './program.ts'

/** Recompose le total depuis une décomposition, pour vérifier qu'elle est exacte. */
function total(perSide: number[]): number {
  return BAR_WEIGHT + perSide.reduce((sum, plate) => sum + plate, 0) * 2
}

describe('décomposition exacte', () => {
  it('donne les plaques des charges courantes', () => {
    expect(platesPerSide(60)).toEqual({ kind: 'plates', perSide: [20] })
    expect(platesPerSide(62.5)).toEqual({ kind: 'plates', perSide: [20, 1.25] })
    expect(platesPerSide(67.5)).toEqual({ kind: 'plates', perSide: [20, 2.5, 1.25] })
    expect(platesPerSide(92.5)).toEqual({ kind: 'plates', perSide: [25, 10, 1.25] })
  })

  it('recompose toujours la charge demandée', () => {
    for (let charge = 22.5; charge <= 200; charge += 2.5) {
      const load = platesPerSide(charge)
      if (load.kind !== 'plates') continue
      expect(total(load.perSide)).toBeCloseTo(charge, 10)
    }
  })

  it('range les plaques de la plus lourde à la plus légère', () => {
    const load = platesPerSide(137.5)
    expect(load.kind).toBe('plates')
    if (load.kind !== 'plates') return
    const trie = load.perSide.toSorted((a, b) => b - a)
    expect(load.perSide).toEqual(trie)
  })

  it('n’utilise que des plaques existantes en salle', () => {
    for (let charge = 22.5; charge <= 200; charge += 2.5) {
      const load = platesPerSide(charge)
      if (load.kind !== 'plates') continue
      for (const plate of load.perSide) expect(PLATES).toContain(plate)
    }
  })

  it('ne laisse pas traîner de flottant sur une charge fractionnaire', () => {
    const load = platesPerSide(102.5)
    expect(load).toEqual({ kind: 'plates', perSide: [25, 15, 1.25] })
  })
})

describe('cas où il n’y a pas de décomposition', () => {
  it('annonce la barre seule à 20 kg', () => {
    expect(platesPerSide(20)).toEqual({ kind: 'bar-only' })
    expect(describePlates(platesPerSide(20))).toBe('Barre seule')
  })

  it('ne prétend rien sous le poids de la barre', () => {
    expect(platesPerSide(17.5)).toEqual({ kind: 'below-bar', bar: 20 })
    expect(platesPerSide(0)).toEqual({ kind: 'below-bar', bar: 20 })
    expect(describePlates(platesPerSide(17.5))).toBeNull()
  })

  it('refuse une charge non réalisable plutôt que d’en décomposer une partie', () => {
    // 21 kg demanderait 0,5 kg par côté ; la plus petite plaque fait 1,25.
    const load = platesPerSide(21)
    expect(load.kind).toBe('not-loadable')
    if (load.kind !== 'not-loadable') return
    expect(load.closest).toBe(20)
  })

  it('propose la charge réalisable la plus proche', () => {
    const load = platesPerSide(23)
    expect(load.kind).toBe('not-loadable')
    if (load.kind !== 'not-loadable') return
    expect(platesPerSide(load.closest).kind).not.toBe('not-loadable')
    expect(Math.abs(load.closest - 23)).toBeLessThanOrEqual(1.5)
  })

  it('le dit en français dans le message', () => {
    expect(describePlates(platesPerSide(21))).toContain('non réalisable')
  })

  it('ne casse pas sur une valeur absurde', () => {
    expect(platesPerSide(Number.NaN).kind).toBe('below-bar')
    expect(platesPerSide(Number.POSITIVE_INFINITY).kind).toBe('below-bar')
  })
})

describe('message affiché', () => {
  it('sépare les plaques par des plus et met la virgule décimale', () => {
    expect(describePlates(platesPerSide(92.5))).toBe('Par côté : 25 + 10 + 1,25')
  })
})
