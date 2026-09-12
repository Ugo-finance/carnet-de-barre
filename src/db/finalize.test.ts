/**
 * Cycle complet d'une séance — CB-31.
 *
 * De l'ouverture du brouillon à la finalisation, sur `MemoryStore`. Les mêmes règles
 * gouvernent l'adaptateur Dexie, qui partage `buildDraft`, `deriveSeance` et
 * `applyProgression` ; seule la transaction diffère, et elle est couverte par le
 * parcours bout en bout de CB-42.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from './memory.ts'
import { buildDraft, setId } from './draft.ts'
import { applyProgression, deriveSeance, validatedSets } from './derive.ts'
import type { Draft, SetLog } from '../domain/types.ts'

/** Valide une série du brouillon avec les valeurs réellement faites. */
function validate(
  draft: Draft,
  id: string,
  values: Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe'>> = {},
): Draft {
  return {
    ...draft,
    sets: draft.sets.map((set) =>
      set.id === id ? { ...set, ...values, status: 'validated' } : set,
    ),
  }
}

describe('brouillon pré-rempli', () => {
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.ready()
  })

  it('pré-remplit le top set à la cible courante', async () => {
    const draft = await store.openDraft('A', '2026-09-15')
    const top = draft.sets.find((set) => set.exerciseId === 'a-squat' && set.role === 'top')
    expect(top).toMatchObject({ weight: 75, reps: 4, status: 'planned' })
  })

  it('pré-remplit les backoffs à −10 % du top set', async () => {
    const draft = await store.openDraft('A', '2026-09-15')
    const backoffs = draft.sets.filter(
      (set) => set.exerciseId === 'a-squat' && set.role === 'backoff',
    )
    expect(backoffs).toHaveLength(2)
    expect(backoffs.every((set) => set.weight === 67.5 && set.reps === 5)).toBe(true)
  })

  it('garde les backoffs des tractions à +7,5 kg, pas à −10 %', async () => {
    const draft = await store.openDraft('B', '2026-09-17')
    const backoffs = draft.sets.filter(
      (set) => set.exerciseId === 'b-tractions' && set.role === 'backoff',
    )
    expect(backoffs.every((set) => set.weight === 7.5 && set.reps === 6)).toBe(true)
  })

  it('prépare les trois séries du développé volume', async () => {
    const draft = await store.openDraft('A', '2026-09-15')
    const volume = draft.sets.filter((set) => set.exerciseId === 'a-bench-vol')
    expect(volume).toHaveLength(3)
    expect(volume.every((set) => set.weight === 60 && set.reps === 8)).toBe(true)
  })

  it('ne demande pas de charge sur un exercice au poids de corps', async () => {
    const draft = await store.openDraft('C', '2026-09-20')
    const pdc = draft.sets.filter((set) => set.exerciseId === 'c-tractions-pdc')
    expect(pdc.every((set) => set.weight === null)).toBe(true)
  })

  it('met toutes les séries en statut prévu, aucune en réalisée', async () => {
    const draft = await store.openDraft('C', '2026-09-20')
    expect(draft.sets.every((set) => set.status === 'planned')).toBe(true)
    expect(validatedSets(draft)).toHaveLength(0)
  })

  it('donne des identifiants de série uniques, comme l’exige le schéma d’export', async () => {
    for (const type of ['A', 'B', 'C'] as const) {
      const draft = await store.openDraft(type, '2026-09-20')
      const ids = draft.sets.map((set) => set.id)
      expect(new Set(ids).size, type).toBe(ids.length)
      await store.clearDraft()
    }
  })

  it('rend le même brouillon si on rouvre le même type le même jour', async () => {
    const premier = await store.openDraft('C', '2026-09-20')
    const second = await store.openDraft('C', '2026-09-20')
    expect(second.id).toBe(premier.id)
  })

  it('ne détruit jamais un brouillon en cours quand on change de sélecteur', async () => {
    // P1 de la contre-revue de #8 : un tap sur A alors qu'un C est à moitié saisi
    // effaçait la saisie. C'est la pire perte possible, et en pleine salle.
    let premier = await store.openDraft('C', '2026-09-20')
    premier = validate(premier, setId('c-deadlift', 'top', 0), { weight: 92.5, reps: 3, rpe: 8 })
    await store.saveDraft(premier)

    const second = await store.openDraft('A', '2026-09-20')
    expect(second.id).toBe(premier.id)
    expect(second.type).toBe('C')
    expect(second.sets.find((set) => set.id === setId('c-deadlift', 'top', 0))?.status).toBe(
      'validated',
    )
  })

  it('ouvre bien une nouvelle séance après un abandon explicite', async () => {
    const premier = await store.openDraft('C', '2026-09-20')
    await store.clearDraft()
    const second = await store.openDraft('A', '2026-09-20')
    expect(second.id).not.toBe(premier.id)
    expect(second.type).toBe('A')
  })

  it('fige les cibles de référence à l’ouverture', async () => {
    const draft = await store.openDraft('A', '2026-09-15')
    expect(draft.baseTargets.squat.w).toBe(75)
  })
})

describe('résumé dérivé des séries validées', () => {
  it('ne retient que les séries validées', () => {
    const targets = {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    }
    let draft = buildDraft('A', '2026-09-15', targets, { id: 'd1', now: 0 })
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })

    const { lines, tops } = deriveSeance(draft)
    expect(lines).toEqual(['Squat : 75×4 @8'])
    expect(tops.squat).toEqual({ w: 75, reps: 4, rpe: 8 })
    // Les backoffs pré-remplis mais jamais validés n'apparaissent pas.
    expect(lines[0]).not.toContain('67,5')
  })

  it('écrit les charges comme le seed les écrivait à la main', () => {
    // Contrat de relecture : la tâche Outlook et Claude lisent ces lignes.
    const targets = {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    }
    let draft = buildDraft('B', '2026-09-17', targets, { id: 'd3', now: 0 })
    draft = validate(draft, setId('b-rowing', 'accessory', 0), { weight: 22.5, reps: 9 })
    expect(deriveSeance(draft).lines.join(' ')).toContain('22,5 kg/haltère×9')
  })

  it('écrit le lest des tractions avec son signe', () => {
    const targets = {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    }
    let draft = buildDraft('B', '2026-09-17', targets, { id: 'd2', now: 0 })
    draft = validate(draft, setId('b-tractions', 'top', 0), { weight: 15, reps: 4, rpe: 8 })
    expect(deriveSeance(draft).lines.join(' ')).toContain('+15×4 @8')
  })
})

describe('finalisation', () => {
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.ready()
  })

  it('enregistre la séance et fait avancer la cible', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const result = await store.finalizeSeance(draft.id)
    expect(result.applied).toBe(true)
    expect(result.targets.squat.w).toBe(77.5)
    expect(result.events[0].message).toContain('Squat')
    expect(await store.listSeances()).toHaveLength(13)
    expect(await store.loadDraft()).toBeUndefined()
  })

  it('ne crée qu’une séance et ne progresse qu’une fois sur un double appel', async () => {
    // Le cas du double tap sur « Terminer », ou d'une reprise après erreur.
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const premier = await store.finalizeSeance(draft.id)
    const second = await store.finalizeSeance(draft.id)

    expect(premier.applied).toBe(true)
    expect(second.applied).toBe(false)
    expect(second.seance.id).toBe(premier.seance.id)
    expect(await store.listSeances()).toHaveLength(13)
    expect((await store.getTargets()).squat.w).toBe(77.5)
  })

  it('ne lève pas sur un second appel : l’appelant n’a qu’un chemin à coder', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)
    await expect(store.finalizeSeance(draft.id)).resolves.toBeDefined()
  })

  it('refuse un identifiant qui ne correspond à rien', async () => {
    await expect(store.finalizeSeance('inconnu')).rejects.toThrow(/Aucune séance en cours/)
  })

  it('n’avance aucune cible si rien n’a été validé', async () => {
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft(draft)
    const result = await store.finalizeSeance(draft.id)
    expect(result.events).toHaveLength(0)
    expect(result.targets.squat.w).toBe(75)
    expect(result.seance.lines).toHaveLength(0)
  })

  it('ne fait pas régresser la cible à cause des backoffs', async () => {
    // Les backoffs sont plus légers que le top set : s'ils entraient dans la règle,
    // la cible baisserait à chaque séance.
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    draft = validate(draft, setId('a-squat', 'backoff', 0), { weight: 67.5, reps: 5 })
    draft = validate(draft, setId('a-squat', 'backoff', 1), { weight: 67.5, reps: 5 })
    await store.saveDraft(draft)

    const result = await store.finalizeSeance(draft.id)
    expect(result.targets.squat.w).toBe(77.5)
    expect(result.seance.lines[0]).toContain('67,5')
  })

  it('applique la double progression du développé volume', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    for (let index = 0; index < 3; index += 1) {
      draft = validate(draft, setId('a-bench-vol', 'volume', index), { weight: 60, reps: 8 })
    }
    await store.saveDraft(draft)
    expect((await store.finalizeSeance(draft.id)).targets.benchVol.w).toBe(62.5)
  })

  it('mémorise un échec en attente et reset au second', async () => {
    // Reproduit la stagnation réelle du développé couché en septembre.
    let premier = await store.openDraft('B', '2026-09-17')
    premier = validate(premier, setId('b-bench', 'top', 0), { weight: 70, reps: 3 })
    await store.saveDraft(premier)
    const un = await store.finalizeSeance(premier.id)
    expect(un.targets.bench).toMatchObject({ w: 70, fail: 70 })

    let second = await store.openDraft('B', '2026-09-24')
    second = validate(second, setId('b-bench', 'top', 0), { weight: 70, reps: 3 })
    await store.saveDraft(second)
    const deux = await store.finalizeSeance(second.id)
    expect(deux.targets.bench.w).toBe(65)
    expect(deux.targets.bench.fail).toBeNull()
  })

  it('date les cibles du jour de la séance, pas de l’instant d’enregistrement', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)
    expect((await store.finalizeSeance(draft.id)).targets.updatedAt).toBe('2026-09-15')
  })

  it('conserve les séries sautées dans la séance, sans les compter', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    draft = {
      ...draft,
      sets: draft.sets.map((set) =>
        set.id === setId('a-squat', 'backoff', 0) ? { ...set, status: 'skipped' } : set,
      ),
    }
    await store.saveDraft(draft)
    const { seance } = await store.finalizeSeance(draft.id)
    expect(seance.sets?.some((set) => set.status === 'skipped')).toBe(true)
    expect(seance.lines[0]).not.toContain('67,5')
  })

  it('part des cibles courantes quand elles n’ont pas bougé', () => {
    const targets = {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    }
    let draft = buildDraft('A', '2026-09-15', targets, { id: 'd9', now: 0 })
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    expect(applyProgression(draft, targets).targets.squat.w).toBe(77.5)
  })

  it('refuse d’enregistrer si une cible a été ajustée pendant la séance', async () => {
    // P1 de la contre-revue de #8 : sans cette garde, la finalisation écrasait
    // silencieusement l'ajustement manuel d'Ugo.
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    await store.adjustTarget('squat', { w: 80 })

    await expect(store.finalizeSeance(draft.id)).rejects.toThrow(/ajustées/)
    // Et surtout : le brouillon est intact, la saisie n'est pas perdue.
    expect((await store.loadDraft())?.id).toBe(draft.id)
    expect(await store.listSeances()).toHaveLength(12)
  })

  it('conserve les tractions au poids de corps dans l’historique', async () => {
    // P1 de la contre-revue de #8 : une série sans charge disparaissait du résumé,
    // alors qu'elle avait bien été réalisée.
    let draft = await store.openDraft('C', '2026-09-20')
    draft = validate(draft, setId('c-tractions-pdc', 'accessory', 0), { reps: 10 })
    await store.saveDraft(draft)

    const { seance } = await store.finalizeSeance(draft.id)
    expect(seance.lines.join(' ')).toContain('Tractions poids de corps : 10 reps')
  })

  it('rejoue les événements sur un second appel, pour réafficher le récapitulatif', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const premier = await store.finalizeSeance(draft.id)
    const second = await store.finalizeSeance(draft.id)
    expect(second.applied).toBe(false)
    expect(second.events).toEqual(premier.events)
  })
})
