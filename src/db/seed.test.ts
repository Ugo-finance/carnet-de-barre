import { describe, expect, it } from 'vitest'
import { legacySeanceId, loadSeed } from './seed.ts'

describe('historique de départ', () => {
  it('charge les douze séances réelles', () => {
    expect(loadSeed().seances).toHaveLength(12)
  })

  it('charge les cinq cibles arrêtées au 12.09.2026', () => {
    const { targets } = loadSeed()
    expect(targets.updatedAt).toBe('2026-09-12')
    expect(targets.squat.w).toBe(75)
    expect(targets.bench.w).toBe(70)
    expect(targets.deadlift.w).toBe(92.5)
    expect(targets.tractions.w).toBe(15)
    expect(targets.benchVol.w).toBe(60)
  })

  it('marque toutes les séances importées comme historiques', () => {
    expect(loadSeed().seances.every((seance) => seance.legacy === true)).toBe(true)
  })

  it('ne fabrique aucune série à partir des lignes de texte', () => {
    // Les `lines` sont des phrases écrites à la main, parfois marquées ⚠️ : en déduire
    // des séries reviendrait à inventer des données qu'Ugo n'a jamais notées.
    const { seances } = loadSeed()
    expect(seances.every((seance) => seance.sets === undefined)).toBe(true)
    expect(seances.every((seance) => seance.accessories === undefined)).toBe(true)
  })

  it('conserve les deux dates approximatives', () => {
    const approx = loadSeed().seances.filter((seance) => seance.approx === true)
    expect(approx.map((seance) => seance.date)).toEqual(['2026-07-26', '2026-07-29'])
  })

  it('conserve les notes, y compris les avertissements', () => {
    const { seances } = loadSeed()
    const reprise = seances.find((seance) => seance.date === '2026-08-27')
    expect(reprise?.notes).toContain('Reprise après')
    const deadlift = seances.find((seance) => seance.date === '2026-08-30')
    expect(deadlift?.lines.join(' ')).toContain('⚠️')
  })

  it('conserve un top set dont le RPE n’a jamais été noté', () => {
    // 30.08.2026 : « Deadlift : 80×3 @? ⚠️ ». Ne pas transformer ça en échec.
    const { seances } = loadSeed()
    const seance = seances.find((s) => s.date === '2026-08-30')
    expect(seance?.tops.deadlift).toEqual({ w: 80, reps: 3, rpe: null })
  })

  it('donne des identifiants stables d’un chargement à l’autre', () => {
    const premier = loadSeed().seances.map((seance) => seance.id)
    const second = loadSeed().seances.map((seance) => seance.id)
    expect(premier).toEqual(second)
    expect(premier[0]).toBe(legacySeanceId('2026-07-22', 0))
  })

  it('donne des identifiants uniques', () => {
    const ids = loadSeed().seances.map((seance) => seance.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rend des objets indépendants entre deux chargements', () => {
    const premier = loadSeed()
    premier.targets.squat.w = 999
    premier.seances[0].notes = 'modifié'
    const second = loadSeed()
    expect(second.targets.squat.w).toBe(75)
    expect(second.seances[0].notes).not.toBe('modifié')
  })

  it('porte les trois séries attendues sur le développé volume', () => {
    // Le moteur refuse de progresser sans cette configuration (P1 de la revue de #4).
    expect(loadSeed().targets.benchVol.sets).toBe(3)
  })

  it('n’a aucun échec en attente au départ', () => {
    const { targets } = loadSeed()
    for (const lift of ['squat', 'bench', 'deadlift', 'tractions', 'benchVol'] as const) {
      expect(targets[lift].fail, lift).toBeNull()
    }
  })
})
