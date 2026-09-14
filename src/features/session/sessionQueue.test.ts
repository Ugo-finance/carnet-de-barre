import { describe, expect, it } from 'vitest'
import { buildDraft } from '../../db/draft'
import type { Draft, SeanceType, SetLog, Targets } from '../../domain/types'
import { buildSessionQueue, currentSessionQueueItem, sessionQueueProgress } from './sessionQueue'

const TARGETS: Targets = {
  updatedAt: '2026-09-14',
  squat: { w: 80, inc: 2.5, reps: 4, fail: null },
  bench: { w: 72.5, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 100, inc: 5, reps: 3, fail: null },
  tractions: { w: 17.5, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 62.5, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function draft(type: SeanceType): Draft {
  return buildDraft(type, '2026-09-15', TARGETS, { id: `queue-${type}`, now: 1 })
}

function ids(value: Draft): string[] {
  return buildSessionQueue(value).map(({ set }) => set.id)
}

function setStatus(value: Draft, setId: string, status: SetLog['status']): Draft {
  return {
    ...value,
    sets: value.sets.map((set) => (set.id === setId ? { ...set, status } : set)),
  }
}

describe('buildSessionQueue', () => {
  it.each([
    { type: 'A', expected: 23 },
    { type: 'B', expected: 22 },
    { type: 'C', expected: 16 },
  ] as const)('conserve les $expected séries réelles de la séance $type', ({ type, expected }) => {
    expect(buildSessionQueue(draft(type))).toHaveLength(expected)
  })

  it('alterne les séries du superset et place les paliers avant la première série du membre', () => {
    const value = draft('A')
    const queueIds = ids(value)
    const supersetStart = queueIds.indexOf('a-tractions-lestees:warmup:0')

    expect(supersetStart).toBeGreaterThan(-1)
    expect(queueIds.slice(supersetStart)).toEqual([
      'a-tractions-lestees:warmup:0',
      'a-tractions-lestees:accessory:0',
      'a-dips:accessory:0',
      'a-tractions-lestees:accessory:1',
      'a-dips:accessory:1',
      'a-tractions-lestees:accessory:2',
      'a-dips:accessory:2',
      'a-curls:accessory:0',
      'a-curls:accessory:1',
      'a-elevations:accessory:0',
      'a-elevations:accessory:1',
    ])
  })

  it('indique le partenaire de superset et le caractère optionnel depuis le programme', () => {
    const queue = buildSessionQueue(draft('A'))
    const traction = queue.find(({ set }) => set.id === 'a-tractions-lestees:accessory:0')
    const curls = queue.find(({ set }) => set.id === 'a-curls:accessory:0')

    expect(traction).toMatchObject({ optional: false, supersetPartner: 'Dips lestés' })
    expect(curls).toMatchObject({ optional: true })
    expect(curls).not.toHaveProperty('supersetPartner')
  })

  it('limite le mode pressé aux deux premiers exercices sans retirer leurs paliers', () => {
    const value = { ...draft('A'), rushed: true }
    const queue = buildSessionQueue(value)

    expect(queue).toHaveLength(12)
    expect(queue.filter(({ set }) => set.role === 'warmup')).toHaveLength(6)
    expect(new Set(queue.map(({ set }) => set.exerciseId))).toEqual(
      new Set(['a-squat', 'a-bench-vol']),
    )
  })
})

describe('état dérivé de la file', () => {
  it('reprend la première série saisie ou prévue et compte les séries traitées', () => {
    let value = draft('C')
    const firstIds = ids(value).slice(0, 3)
    value = setStatus(value, firstIds[0]!, 'validated')
    value = setStatus(value, firstIds[1]!, 'skipped')
    value = setStatus(value, firstIds[2]!, 'entered')

    const queue = buildSessionQueue(value)

    expect(currentSessionQueueItem(queue)?.set.id).toBe(firstIds[2])
    expect(sessionQueueProgress(queue)).toEqual({ completed: 2, total: 16 })
  })

  it('ne fabrique plus de série courante lorsque toute la file est traitée', () => {
    const value = {
      ...draft('B'),
      sets: draft('B').sets.map((set) => ({ ...set, status: 'validated' as const })),
    }
    const queue = buildSessionQueue(value)

    expect(currentSessionQueueItem(queue)).toBeNull()
    expect(sessionQueueProgress(queue)).toEqual({ completed: 22, total: 22 })
  })
})
