import 'fake-indexeddb/auto'
import { Dexie, type Table } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Draft, Seance } from '../domain/types'
import { buildDraft } from '../db/draft'
import { loadSeed } from '../db/seed'
import type { MetaRow, TargetsRow } from '../db/database'

const databases: Dexie[] = []

class PreviousDatabase extends Dexie {
  seances!: Table<Seance, string>
  targets!: Table<TargetsRow, string>
  drafts!: Table<Draft, string>
  meta!: Table<MetaRow, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      seances: 'id, date, type',
      targets: 'key',
      drafts: 'id',
      meta: 'key',
    })
  }
}

class NextDatabase extends PreviousDatabase {
  constructor(name: string) {
    super(name)
    // Migration additive représentative : le cache applicatif change, la base
    // locale passe de version, mais les tables qui portent l'entraînement restent.
    this.version(2)
      .stores({
        seances: 'id, date, type, ts',
        targets: 'key',
        drafts: 'id',
        meta: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction.table('meta').put({ key: 'schema-version', value: 2 })
      })
  }
}

afterEach(async () => {
  await Promise.all(databases.map(async (database) => database.delete()))
  databases.length = 0
})

describe('conservation des données pendant une mise à jour', () => {
  it('préserve historique, cibles et brouillon lors d’une migration Dexie additive', async () => {
    const name = `pwa-update-${crypto.randomUUID()}`
    const previous = new PreviousDatabase(name)
    databases.push(previous)
    const seed = loadSeed()
    const draft = buildDraft('C', '2026-09-20', seed.targets, { id: 'en-cours', now: 1 })
    draft.notes = 'À retrouver après la mise à jour'
    await previous.seances.bulkPut(seed.seances)
    await previous.targets.put({ key: 'current', ...seed.targets })
    await previous.drafts.put(draft)
    previous.close()

    const next = new NextDatabase(name)
    databases.push(next)
    await next.open()

    expect(await next.seances.count()).toBe(seed.seances.length)
    expect((await next.targets.get('current'))?.squat.w).toBe(seed.targets.squat.w)
    expect((await next.drafts.get('en-cours'))?.notes).toBe('À retrouver après la mise à jour')
    expect((await next.meta.get('schema-version'))?.value).toBe(2)
  })
})
