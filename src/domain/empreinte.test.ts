import { describe, expect, it } from 'vitest'
import { empreinte } from './empreinte.ts'

describe('empreinte de contenu', () => {
  it('ne dépend pas de l’ordre des clés', () => {
    // Décisif : les deux chemins de lecture ne construisent pas forcément leurs objets
    // dans le même ordre, et un refus de confirmation sans cause serait un défaut à
    // lui seul.
    expect(empreinte({ a: 1, b: 2 })).toBe(empreinte({ b: 2, a: 1 }))
  })

  it('trie aussi en profondeur', () => {
    expect(empreinte({ x: { a: 1, b: [{ p: 1, q: 2 }] } })).toBe(
      empreinte({ x: { b: [{ q: 2, p: 1 }], a: 1 } }),
    )
  })

  it('dépend de l’ordre des éléments d’un tableau', () => {
    // Un tableau a un ordre, et le trier effacerait une vraie différence.
    expect(empreinte([1, 2])).not.toBe(empreinte([2, 1]))
  })

  it('change quand une valeur profonde change', () => {
    // Le cas qui motive tout le fichier : corriger une séance passée ne touche ni le
    // nombre de séances, ni sa date, ni son `ts`.
    const avant = { seances: [{ id: 'a', date: '2026-09-15', ts: 1, notes: '' }] }
    const apres = { seances: [{ id: 'a', date: '2026-09-15', ts: 1, notes: 'corrigé' }] }

    expect(empreinte(avant)).not.toBe(empreinte(apres))
  })

  it('distingue une valeur absente d’une valeur nulle', () => {
    expect(empreinte({ a: 1 })).not.toBe(empreinte({ a: 1, b: null }))
  })

  it('ignore une clé explicitement indéfinie, comme le ferait JSON', () => {
    expect(empreinte({ a: 1, b: undefined })).toBe(empreinte({ a: 1 }))
  })

  it('est stable d’un appel à l’autre', () => {
    const carnet = { targets: { squat: { w: 77.5 } }, seances: [{ id: 'x' }] }

    expect(empreinte(carnet)).toBe(empreinte(carnet))
  })
})
