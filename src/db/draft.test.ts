/**
 * Le contrat du brouillon — et ce qu'un champ ajouté doit garantir aux brouillons
 * déjà en base. CB-22c.
 */

import { describe, expect, it } from 'vitest'
import { buildDraft, hydrateDraft, isBlankDraft, type StoredDraft } from './draft.ts'
import type { Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-13',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

const neuf = () => buildDraft('A', '2026-09-15', CIBLES, { id: 'brouillon', now: 1 })

describe('préférence d’écran allumé', () => {
  it('part éteinte sur un brouillon neuf', () => {
    // Personne n'a rien demandé : l'app ne prend pas l'écran en otage d'elle-même.
    expect(neuf().keepAwake).toBe(false)
  })

  it('vaut `false` pour un brouillon écrit avant l’existence du champ', () => {
    // Le cas réel de la mise à jour : Ugo a une séance ouverte, la PWA se met à jour,
    // et la ligne relue n'a pas ce champ. Sans défaut au point de lecture, `undefined`
    // circulerait jusqu'au premier lecteur qui le traiterait comme une valeur.
    const { keepAwake: _absent, ...ancien } = neuf()

    expect(hydrateDraft(ancien as StoredDraft).keepAwake).toBe(false)
  })

  it('ne réécrit pas une préférence déjà enregistrée', () => {
    expect(hydrateDraft({ ...neuf(), keepAwake: true }).keepAwake).toBe(true)
  })

  it('ne rend pas le brouillon « commencé »', () => {
    // Décisif : `isBlankDraft` autorise la reconstruction sur de nouvelles cibles. Si
    // basculer un interrupteur d'écran comptait comme une saisie, ajuster une cible
    // deviendrait impossible sans abandonner une séance qui n'a jamais commencé.
    expect(isBlankDraft({ ...neuf(), keepAwake: true })).toBe(true)
  })

  it('laisse le reste du brouillon intact', () => {
    const ancien = neuf()
    const hydrate = hydrateDraft(ancien)
    expect(hydrate.sets).toEqual(ancien.sets)
    expect(hydrate.baseTargets).toEqual(ancien.baseTargets)
  })
})

describe('début de récupération — CB-77', () => {
  it('part absent sur un brouillon neuf, puisque aucun chrono ne court', () => {
    expect(neuf().timerStartedAt).toBe(null)
  })

  it('complète une récupération armée avant que le début ne soit persisté', () => {
    // Le cas réel : Ugo a une séance en cours, armée par une version d'avant ce lot.
    // La ligne n'a pas le champ. Elle doit rester **reprenable** — l'échéance suffit au
    // chiffre, seule la barre retombe sur son approximation. Refuser, ou laisser
    // `undefined` circuler, perdrait une séance en salle pour une barre de progression.
    const { timerStartedAt: _absent, ...ancien } = {
      ...neuf(),
      timerEndsAt: 1_000_000,
      timerLabel: 'Récup Squat',
    }

    const hydrate = hydrateDraft(ancien as StoredDraft)

    expect(hydrate.timerStartedAt).toBe(null)
    expect(hydrate.timerEndsAt).toBe(1_000_000)
    expect(hydrate.timerLabel).toBe('Récup Squat')
  })

  it('ne réécrit pas un début déjà enregistré', () => {
    expect(hydrateDraft({ ...neuf(), timerStartedAt: 42 }).timerStartedAt).toBe(42)
  })
})
