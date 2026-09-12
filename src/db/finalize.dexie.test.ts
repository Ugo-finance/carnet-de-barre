/**
 * La finalisation, éprouvée sur une vraie IndexedDB — CB-31.
 *
 * Ces tests existent à cause d'un défaut que la suite en mémoire ne pouvait pas voir :
 * la transaction de finalisation écrivait dans une table absente de sa portée, ce que
 * Dexie refuse. En mémoire, il n'y a pas de portée de transaction, donc rien n'échouait.
 *
 * Ils vérifient donc ce que seule la vraie base peut prouver : la portée des
 * transactions, l'atomicité réelle, et la persistance à travers une réouverture.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { setId } from './draft.ts'
import type { Draft, SetLog } from '../domain/types.ts'

let compteur = 0
const nouvelleBase = (): CarnetDatabase => {
  compteur += 1
  return new CarnetDatabase(`carnet-finalize-${compteur}`)
}

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

describe('finalisation sur une vraie base', () => {
  let database: CarnetDatabase
  let store: DexieStore

  beforeEach(async () => {
    database = nouvelleBase()
    store = new DexieStore(database)
    await store.ready()
  })

  it('écrit la séance, les cibles, le journal, et ferme le brouillon', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const result = await store.finalizeSeance(draft.id)

    expect(result.applied).toBe(true)
    expect(result.targets.squat.w).toBe(77.5)
    expect(result.events).toHaveLength(1)
    expect(await database.seances.count()).toBe(13)
    expect(await database.drafts.count()).toBe(0)
    // Le journal est écrit dans la même transaction que le reste.
    expect(await database.meta.get(`events:${draft.id}`)).toBeDefined()
  })

  it('rejoue les événements au second appel au lieu d’une liste vide', async () => {
    let draft = await store.openDraft('B', '2026-09-17')
    draft = validate(draft, setId('b-bench', 'top', 0), { weight: 70, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const premier = await store.finalizeSeance(draft.id)
    const second = await store.finalizeSeance(draft.id)

    expect(second.applied).toBe(false)
    expect(second.events).toEqual(premier.events)
    expect(await database.seances.count()).toBe(13)
    expect((await store.getTargets()).bench.w).toBe(72.5)
  })

  it('ne progresse pas deux fois sur un double appel simultané', async () => {
    // Le double tap sur « Terminer », les deux appels partant avant la première réponse.
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const [un, deux] = await Promise.all([
      store.finalizeSeance(draft.id),
      store.finalizeSeance(draft.id).catch(() => null),
    ])

    expect(un.seance.id).toBe(draft.id)
    if (deux) expect(deux.seance.id).toBe(draft.id)
    expect(await database.seances.count()).toBe(13)
    expect((await store.getTargets()).squat.w).toBe(77.5)
  })

  it('refuse d’écrire si une cible a été ajustée pendant la séance', async () => {
    let draft = await store.openDraft('A', '2026-09-15')
    draft = validate(draft, setId('a-squat', 'top', 0), { weight: 75, reps: 4, rpe: 8 })
    await store.saveDraft(draft)

    const targets = await store.getTargets()
    await database.targets.put({ key: 'current', ...targets, squat: { ...targets.squat, w: 80 } })

    await expect(store.finalizeSeance(draft.id)).rejects.toThrow(/ajustées/)
    // Rien n'a été écrit, et surtout la saisie n'est pas perdue.
    expect(await database.seances.count()).toBe(12)
    expect(await database.drafts.count()).toBe(1)
  })

  it('conserve les tractions au poids de corps dans le résumé', async () => {
    let draft = await store.openDraft('C', '2026-09-20')
    draft = validate(draft, setId('c-tractions-pdc', 'accessory', 0), { reps: 10 })
    await store.saveDraft(draft)

    const { seance } = await store.finalizeSeance(draft.id)
    expect(seance.lines.join(' ')).toContain('Tractions poids de corps : 10 reps')
  })

  it('survit à une réouverture de la base, comme au redémarrage de l’app', async () => {
    let draft = await store.openDraft('C', '2026-09-20')
    draft = validate(draft, setId('c-deadlift', 'top', 0), { weight: 92.5, reps: 3, rpe: 8 })
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)
    database.close()

    const rouverte = new DexieStore(new CarnetDatabase(database.name))
    await rouverte.ready()
    expect((await rouverte.getTargets()).deadlift.w).toBe(97.5)
    expect(await rouverte.listSeances()).toHaveLength(13)
    expect(await rouverte.loadDraft()).toBeUndefined()
  })

  it('rend le brouillon en cours quel que soit le type demandé', async () => {
    let draft = await store.openDraft('C', '2026-09-20')
    draft = validate(draft, setId('c-deadlift', 'top', 0), { weight: 92.5, reps: 3, rpe: 8 })
    await store.saveDraft(draft)

    const autre = await store.openDraft('A', '2026-09-20')
    expect(autre.id).toBe(draft.id)
    expect(autre.type).toBe('C')
    expect(await database.drafts.count()).toBe(1)
  })

  it('lève draft-not-found sur un identifiant inconnu, sans rien écrire', async () => {
    await expect(store.finalizeSeance('inconnu')).rejects.toThrow(/Aucune séance en cours/)
    expect(await database.seances.count()).toBe(12)
  })
})
