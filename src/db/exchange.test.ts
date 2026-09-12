import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from './memory.ts'
import {
  buildExport,
  describeImport,
  exportFilename,
  serializeExport,
  validateImport,
} from './exchange.ts'
import { setId } from './draft.ts'
import seedJson from '../domain/seed.json' with { type: 'json' }
import type { Draft, SetLog } from '../domain/types.ts'

function validate(
  draft: Draft,
  id: string,
  values: Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe'>>,
): Draft {
  return {
    ...draft,
    sets: draft.sets.map((set) =>
      set.id === id ? { ...set, ...values, status: 'validated' } : set,
    ),
  }
}

describe('export', () => {
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.ready()
  })

  it('porte la version du format, les cibles et les douze séances', async () => {
    const file = await buildExport(store)
    expect(file.schemaVersion).toBe(1)
    expect(file.seances).toHaveLength(12)
    expect(file.targets.squat.w).toBe(75)
  })

  it('range les séances dans le sens du temps, comme le seed', async () => {
    const dates = (await buildExport(store)).seances.map((seance) => seance.date)
    expect(dates[0]).toBe('2026-07-22')
    expect(dates[dates.length - 1]).toBe('2026-09-10')
    expect(dates).toEqual(dates.toSorted())
  })

  it('n’exporte jamais la séance en cours de saisie', async () => {
    // Une séance non terminée ne contient que des valeurs pré-remplies : les faire
    // entrer dans ce qui sert de sauvegarde reviendrait à inventer une performance.
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft(validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4 }))
    const file = await buildExport(store)
    expect(file.seances).toHaveLength(12)
    expect(file.seances.some((seance) => seance.date === '2026-09-15')).toBe(false)
  })

  it('reste lisible une fois collé dans une conversation', async () => {
    const texte = serializeExport(await buildExport(store))
    expect(texte).toContain('\n  "targets"')
    expect(texte.endsWith('\n')).toBe(true)
  })

  it('propose un nom de fichier daté', () => {
    expect(exportFilename(new Date('2026-09-20T15:00:00Z'))).toBe('carnet-de-barre-2026-09-20.json')
  })
})

describe('aller-retour export puis import', () => {
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.ready()
  })

  it('rend exactement le même contenu, identifiants et échecs compris', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 3, rpe: null })
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)

    const premier = await buildExport(store)
    const relu = validateImport(JSON.parse(serializeExport(premier)))

    expect(relu.format).toBe('current')
    expect(relu.seances.map((seance) => seance.id)).toEqual(
      premier.seances.map((seance) => seance.id),
    )
    // L'échec en attente doit survivre à l'aller-retour, sinon le prochain échec
    // au même poids ne déclencherait pas le reset.
    expect(premier.targets.squat.fail).toBe(75)
    expect(relu.targets.squat.fail).toBe(75)
    expect(relu.targets).toEqual(premier.targets)
  })

  it('conserve les séries détaillées d’une séance saisie dans l’app', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)

    const relu = validateImport(await buildExport(store))
    const saisie = relu.seances.find((seance) => seance.date === '2026-09-15')
    expect(saisie?.sets?.length).toBeGreaterThan(0)
    expect(saisie?.legacy).toBeUndefined()
  })
})

describe('import du format historique', () => {
  it('accepte le seed d’origine et lui donne les mêmes identifiants qu’au premier lancement', async () => {
    const relu = validateImport(seedJson)
    expect(relu.format).toBe('seed')
    expect(relu.seances).toHaveLength(12)
    expect(relu.seances.every((seance) => seance.legacy === true)).toBe(true)

    const store = new MemoryStore()
    await store.ready()
    const amorce = await store.listSeances()
    expect(relu.seances.map((s) => s.id).toSorted()).toEqual(amorce.map((s) => s.id).toSorted())
  })

  it('conserve les dates approximatives du seed', () => {
    const approx = validateImport(seedJson).seances.filter((seance) => seance.approx === true)
    expect(approx).toHaveLength(2)
  })
})

describe('refus, avant toute écriture', () => {
  it('refuse un texte qui n’est pas du JSON', () => {
    expect(() => validateImport('ceci est un message, pas un fichier')).toThrow()
  })

  it('refuse une version de format plus récente que l’app', () => {
    expect(() => validateImport({ ...seedJson, schemaVersion: 99 })).toThrow(/Mets l'app à jour/)
  })

  it('explique pourquoi, en nommant les champs fautifs', () => {
    try {
      validateImport({ targets: {}, seances: [] })
      expect.unreachable('aurait dû lever')
    } catch (error) {
      expect((error as Error).message).toContain('targets')
    }
  })

  it('refuse un fichier dont deux séances partagent un identifiant', () => {
    const seances = structuredClone(seedJson.seances).map((seance, index) => ({
      ...seance,
      id: 'meme-identifiant',
      legacy: true,
      approx: index === 1 ? true : undefined,
    }))
    expect(() => validateImport({ schemaVersion: 1, targets: seedJson.targets, seances })).toThrow()
  })
})

describe('aperçu avant remplacement', () => {
  it('annonce ce qui arrive et ce qui part', () => {
    const candidate = validateImport(seedJson)
    const preview = describeImport(candidate, { seanceCount: 3, targetsUpdatedAt: '2026-09-20' })
    expect(preview).toEqual({
      format: 'seed',
      seanceCount: 12,
      firstDate: '2026-07-22',
      lastDate: '2026-09-10',
      replacing: { seanceCount: 3, targetsUpdatedAt: '2026-09-20' },
    })
  })

  it('tient le cas d’un fichier sans aucune séance', () => {
    const candidate = validateImport({ ...seedJson, seances: [] })
    const preview = describeImport(candidate, { seanceCount: 12, targetsUpdatedAt: '2026-09-12' })
    expect(preview.seanceCount).toBe(0)
    expect(preview.firstDate).toBeNull()
  })
})
