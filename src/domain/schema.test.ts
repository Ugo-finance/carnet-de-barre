import { describe, expect, it } from 'vitest'
import seed from './seed.json' with { type: 'json' }
import exportExemple from '../../docs/export-exemple.json' with { type: 'json' }
import { SCHEMA_VERSION, parseImport, parseImportText, seedFileSchema } from './schema.ts'

describe('format historique (seed.json)', () => {
  it('valide le seed livré avec le dossier de transmission', () => {
    const parsed = seedFileSchema.safeParse(seed)
    expect(parsed.success).toBe(true)
  })

  it('contient bien douze séances, pas onze', () => {
    // Le PLAN.md v1 annonçait onze séances ; le décompte réel est de douze.
    expect(seed.seances).toHaveLength(12)
  })

  it('porte les cinq cibles de départ du 12.09.2026', () => {
    const parsed = seedFileSchema.parse(seed)
    expect(parsed.targets.squat.w).toBe(75)
    expect(parsed.targets.bench.w).toBe(70)
    expect(parsed.targets.deadlift.w).toBe(92.5)
    expect(parsed.targets.tractions.w).toBe(15)
    expect(parsed.targets.benchVol.w).toBe(60)
  })

  it('est reconnu comme format « seed » par parseImport', () => {
    const result = parseImport(seed)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.format).toBe('seed')
  })

  it('conserve les dates approximatives', () => {
    const parsed = seedFileSchema.parse(seed)
    const approx = parsed.seances.filter((seance) => seance.approx === true)
    expect(approx).toHaveLength(2)
  })

  it('accepte un top set dont les répétitions sont inconnues', () => {
    // 03.09.2026 : « Tractions : +20 solide », reps jamais notées.
    const parsed = seedFileSchema.parse(seed)
    const seance = parsed.seances.find((s) => s.date === '2026-09-03')
    expect(seance?.tops.tractions).toEqual({ w: 20, reps: null, rpe: null })
  })
})

describe('format courant (export enrichi)', () => {
  it("valide l'exemple d'export du dossier docs", () => {
    const result = parseImport(exportExemple)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.format).toBe('current')
  })

  it('garde les champs historiques lisibles pour la tâche Outlook', () => {
    const result = parseImport(exportExemple)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.data
    // Ce que Claude doit pouvoir extraire : les cibles et les tops, sans lire les séries.
    expect(data.targets.bench.w).toBe(72.5)
    const derniere = data.seances[data.seances.length - 1]
    expect(derniere.tops.bench).toEqual({ w: 70, reps: 4, rpe: 8 })
    expect(derniere.lines.length).toBeGreaterThan(0)
  })

  it('accepte les séances legacy sans séries détaillées', () => {
    const result = parseImport(exportExemple)
    expect(result.ok).toBe(true)
    if (!result.ok || result.format !== 'current') return
    const legacy = result.data.seances.filter((s) => s.legacy === true)
    expect(legacy.length).toBe(12)
    expect(legacy.every((s) => s.sets === undefined)).toBe(true)
  })
})

describe('refus avant écriture', () => {
  it('refuse une version de schéma future', () => {
    const futur = { ...exportExemple, schemaVersion: SCHEMA_VERSION + 1 }
    const result = parseImport(futur)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unsupported-version')
  })

  it('refuse un JSON invalide', () => {
    const result = parseImportText('{ceci ne ferme pas')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-json')
  })

  it('refuse un objet de forme incorrecte et nomme les champs fautifs', () => {
    const result = parseImport({ targets: {}, seances: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid-shape')
      expect(result.issues.join(' ')).toContain('targets')
    }
  })

  it('refuse un tableau ou une valeur nue', () => {
    expect(parseImport([]).ok).toBe(false)
    expect(parseImport('coucou').ok).toBe(false)
    expect(parseImport(null).ok).toBe(false)
  })

  it('refuse un champ inconnu dans une séance, plutôt que de le perdre en silence', () => {
    const bricole = {
      ...exportExemple,
      seances: [{ ...exportExemple.seances[0], champInconnu: 1 }],
    }
    expect(parseImport(bricole).ok).toBe(false)
  })
})
