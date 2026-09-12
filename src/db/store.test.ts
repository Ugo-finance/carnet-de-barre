/**
 * Suite de tests de contrat — CB-30.
 *
 * Écrite une fois, elle vaut pour toute implémentation de `DraftStore`. Elle tourne
 * ici contre `MemoryStore` ; l'adaptateur Dexie est couvert par le parcours bout en
 * bout de CB-42, dans un vrai navigateur, faute d'IndexedDB en CI.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from './memory.ts'
import type { DraftStore } from './store.ts'
import type { Draft, Targets } from '../domain/types.ts'

function draftFor(targets: Targets, overrides: Partial<Draft> = {}): Draft {
  const now = Date.now()
  return {
    id: 'brouillon-1',
    date: '2026-09-20',
    type: 'C',
    sets: [],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    baseTargets: targets,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('DraftStore (implémentation en mémoire)', () => {
  let store: MemoryStore & DraftStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.ready()
  })

  describe('amorçage', () => {
    it('expose les douze séances et les cibles au premier lancement', async () => {
      expect(await store.listSeances()).toHaveLength(12)
      expect((await store.getTargets()).squat.w).toBe(75)
    })

    it('ne réimporte pas au second appel', async () => {
      await store.ready()
      await store.ready()
      expect(await store.listSeances()).toHaveLength(12)
    })

    it('ne réimporte pas après un effacement volontaire de l’historique', async () => {
      // Vider sa base ne doit pas faire réapparaître le seed au lancement suivant.
      await store.clearHistory()
      await store.ready()
      expect(await store.listSeances()).toHaveLength(0)
    })

    it('rend les séances de la plus récente à la plus ancienne', async () => {
      const dates = (await store.listSeances()).map((seance) => seance.date)
      expect(dates[0]).toBe('2026-09-10')
      expect(dates[dates.length - 1]).toBe('2026-07-22')
    })

    it('retrouve une séance par son identifiant', async () => {
      const [premiere] = await store.listSeances()
      expect((await store.getSeance(premiere.id))?.date).toBe(premiere.date)
      expect(await store.getSeance('inexistant')).toBeUndefined()
    })
  })

  describe('brouillon', () => {
    it('n’en a aucun au démarrage', async () => {
      expect(await store.loadDraft()).toBeUndefined()
    })

    it('relit ce qu’il a écrit', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets, { notes: 'jambes lourdes' }))
      const relu = await store.loadDraft()
      expect(relu?.notes).toBe('jambes lourdes')
      expect(relu?.type).toBe('C')
    })

    it('conserve l’échéance du chrono, pour survivre à un passage en arrière-plan', async () => {
      const targets = await store.getTargets()
      const echeance = Date.now() + 150_000
      await store.saveDraft(
        draftFor(targets, { timerEndsAt: echeance, timerLabel: 'Récup top set' }),
      )
      expect((await store.loadDraft())?.timerEndsAt).toBe(echeance)
    })

    it('conserve les cibles de référence, pour détecter un ajustement entre-temps', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets))
      expect((await store.loadDraft())?.baseTargets.squat.w).toBe(75)
    })

    it('remplace le brouillon au lieu d’en accumuler', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets, { notes: 'premier' }))
      await store.saveDraft(draftFor(targets, { notes: 'second' }))
      expect((await store.loadDraft())?.notes).toBe('second')
    })

    it('n’en garde qu’un seul, même si deux brouillons d’identifiants différents sont écrits', async () => {
      // Deux onglets ouvrant chacun leur brouillon avant la première écriture.
      // Si les deux survivaient, finaliser le plus récent ferait ressurgir l'autre.
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets, { id: 'onglet-1', notes: 'premier' }))
      await store.saveDraft(draftFor(targets, { id: 'onglet-2', notes: 'second' }))
      const relu = await store.loadDraft()
      expect(relu?.id).toBe('onglet-2')
      await store.clearDraft()
      expect(await store.loadDraft()).toBeUndefined()
    })

    it('l’efface sur demande', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets))
      await store.clearDraft()
      expect(await store.loadDraft()).toBeUndefined()
    })

    it('n’écrit rien dans l’historique tant que le brouillon n’est pas finalisé', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets))
      expect(await store.listSeances()).toHaveLength(12)
    })

    it('rend une copie, pas la référence interne', async () => {
      const targets = await store.getTargets()
      await store.saveDraft(draftFor(targets))
      const relu = await store.loadDraft()
      if (relu) relu.notes = 'modifié en dehors du store'
      expect((await store.loadDraft())?.notes).toBe('')
    })
  })

  describe('cibles', () => {
    it('rend une copie, pour qu’une mutation accidentelle ne contamine pas la base', async () => {
      const targets = await store.getTargets()
      targets.squat.w = 999
      expect((await store.getTargets()).squat.w).toBe(75)
    })
  })
})
