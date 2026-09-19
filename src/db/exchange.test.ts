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
import type { Draft, Seance, SetLog, Targets } from '../domain/types.ts'

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
    // Le nombre est écrit en clair, et non repris de `SCHEMA_VERSION` : une assertion sur
    // la constante se contenterait d'elle-même. Ce test doit tomber à chaque incrément,
    // pour qu'aucun ne passe sans qu'on l'ait voulu. Passé à 2 en CB-55, rôle `warmup`.
    expect(file.schemaVersion).toBe(2)
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

const CIBLES_LOCALES: Targets = { ...seedJson.targets, updatedAt: '2026-09-20' } as Targets

/** Un carnet local minimal, du même détail que le candidat. */
function localAvec(seances: Seance[], targets: Targets = CIBLES_LOCALES) {
  return { seances, targets }
}

const seanceLocale = (date: string): Seance => ({
  id: `locale-${date}`,
  date,
  type: 'A',
  lines: [],
  tops: {},
  notes: '',
})

describe('aperçu avant remplacement', () => {
  it('annonce ce qui arrive et ce qui part, des deux côtés', () => {
    const candidate = validateImport(seedJson)
    const local = localAvec([seanceLocale('2026-09-14'), seanceLocale('2026-09-18')])

    const preview = describeImport(candidate, local)

    expect(preview.format).toBe('seed')
    expect(preview.seanceCount).toBe(12)
    expect(preview.firstDate).toBe('2026-07-22')
    expect(preview.lastDate).toBe('2026-09-10')
    expect(preview.targets).toEqual(candidate.targets)
    expect(preview.replacing.seanceCount).toBe(2)
    expect(preview.replacing.lastDate).toBe('2026-09-18')
    expect(preview.replacing.targets).toEqual(CIBLES_LOCALES)
    expect(preview.replacing.targetsUpdatedAt).toBe('2026-09-20')
  })

  it('donne les cibles des deux côtés, états d’échec compris', () => {
    // C'est l'état le plus disputé du carnet, et celui qu'Ugo doit pouvoir comparer
    // avant d'accepter un remplacement. Un aperçu qui ne les montre pas lui fait
    // signer à l'aveugle.
    const enEchec: Targets = {
      ...CIBLES_LOCALES,
      squat: { ...CIBLES_LOCALES.squat, fail: 1 },
    }
    const candidate = validateImport(seedJson)

    const preview = describeImport(candidate, localAvec([], enEchec))

    expect(preview.replacing.targets.squat.fail).toBe(1)
    expect(preview.targets.squat.fail).toBeNull()
  })

  it('tient le cas d’un fichier sans aucune séance', () => {
    const candidate = validateImport({ ...seedJson, seances: [] })

    const preview = describeImport(candidate, localAvec([seanceLocale('2026-09-14')]))

    expect(preview.seanceCount).toBe(0)
    expect(preview.firstDate).toBeNull()
    expect(preview.lastDate).toBeNull()
  })

  it('tient le cas d’un carnet local vide', () => {
    const candidate = validateImport(seedJson)

    expect(describeImport(candidate, localAvec([])).replacing.lastDate).toBeNull()
  })
})

describe('identité de la comparaison', () => {
  const candidate = validateImport(seedJson)
  const local = { seances: [], targets: seedJson.targets as Targets }

  it('distingue les deux côtés quand ils diffèrent', () => {
    const { identite } = describeImport(candidate, local)

    expect(identite.local).not.toBe(identite.candidat)
  })

  it('ne bouge pas quand rien ne bouge', () => {
    expect(describeImport(candidate, local).identite).toEqual(
      describeImport(candidate, local).identite,
    )
  })

  it('change quand une séance locale est corrigée sans changer ni nombre ni date', () => {
    // Le cas qui interdit de résumer le carnet par des compteurs. D6 permet de corriger
    // une séance passée : ni le nombre, ni la date, ni `ts` ne bougent, et une
    // confirmation prise avant la correction l'écraserait sans que rien ne proteste.
    const seance: Seance = {
      id: 'locale-1',
      date: '2026-09-14',
      type: 'A',
      lines: ['Squat : 75×4'],
      tops: {},
      notes: '',
    }
    const corrigee: Seance = { ...seance, lines: ['Squat : 77,5×4'] }

    const avant = describeImport(candidate, { seances: [seance], targets: local.targets })
    const apres = describeImport(candidate, { seances: [corrigee], targets: local.targets })

    expect(avant.replacing.seanceCount).toBe(apres.replacing.seanceCount)
    expect(avant.replacing.lastDate).toBe(apres.replacing.lastDate)
    expect(avant.identite.local).not.toBe(apres.identite.local)
  })

  it('change quand une cible locale change', () => {
    const autres: Targets = { ...local.targets, squat: { ...local.targets.squat, w: 80 } }

    expect(describeImport(candidate, local).identite.local).not.toBe(
      describeImport(candidate, { ...local, targets: autres }).identite.local,
    )
  })
})

describe('nom de fichier', () => {
  it('porte la date civile de Zurich, pas celle d’UTC', () => {
    // 00 h 30 à Zurich en été, c'est encore 22 h 30 la veille en UTC. `toISOString()`
    // datait donc le fichier de la veille : un export fait juste après une séance
    // tardive se serait classé au mauvais jour, sans que rien ne le signale.
    expect(exportFilename(new Date('2026-09-19T22:30:00Z'))).toBe('carnet-de-barre-2026-09-20.json')
    expect(exportFilename(new Date('2026-09-20T14:00:00Z'))).toBe('carnet-de-barre-2026-09-20.json')
  })
})
