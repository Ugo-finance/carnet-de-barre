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
    timerStartedAt: null,
    keepAwake: false,
    startedAt: null,
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

    it('n’injecte aucun palier dans un brouillon déjà commencé', async () => {
      // La garantie centrale de CB-56, et la plus facile à casser sans le voir : une mise
      // à jour de l'app pendant qu'Ugo est en salle ne doit **rien** ajouter au milieu de
      // ce qu'il est en train de faire. Sa séance changerait de forme entre deux séries.
      //
      // Le brouillon simulé ici est celui d'une version d'avant les paliers : on les
      // retire, puis on valide une série pour le rendre actif.
      const ouvert = await store.openDraft('C', '2026-09-20')
      const ancien = {
        ...ouvert,
        sets: ouvert.sets
          .filter((set) => set.role !== 'warmup')
          .map((set, rang) => (rang === 0 ? { ...set, status: 'validated' as const } : set)),
      }
      await store.saveDraft(ancien)

      const repris = await store.openDraft('C', '2026-09-20')

      expect(repris.sets.some((set) => set.role === 'warmup')).toBe(false)
      expect(repris.sets.map((set) => set.id)).toEqual(ancien.sets.map((set) => set.id))
    })

    it('pose en revanche les paliers sur un brouillon vierge reconstruit', async () => {
      // Le contre-test du précédent, sans lequel « ne rien injecter » se satisferait d'un
      // moteur qui n'injecte jamais rien. Un brouillon jamais touché ne porte aucune
      // information (CB-27) : le reconstruire sur de nouvelles cibles doit lui donner ses
      // paliers, et c'est ce qui fait que l'échauffement suit une cible ajustée.
      await store.openDraft('C', '2026-09-20')

      await store.adjustTarget('deadlift', { w: 95 })

      const reconstruit = await store.loadDraft()
      const paliers = (reconstruit?.sets ?? []).filter((set) => set.role === 'warmup')
      // Nommés par exercice, et non en liste de nombres : la séance C porte aussi le
      // palier du développé incliné, et une liste nue laissait croire à une erreur là où
      // il n'y avait qu'un exercice oublié dans l'attente.
      //
      // Le soulevé de terre part de la cible **ajustée** : 60 % de 95 tombe sous le
      // plancher et remonte à 60, puis 75 et 85. C'est ce qui prouve que l'échauffement
      // suit la cible, et pas la valeur figée à l'ouverture du brouillon.
      expect(paliers.map((set) => `${set.exerciseId} ${set.weight}`)).toEqual([
        'c-deadlift 60',
        'c-deadlift 75',
        'c-deadlift 85',
        'c-di 14',
      ])
    })

    it('ne perd pas la progression des accessoires en reconstruisant le brouillon', async () => {
      // P2 de Codex sur CB-45 lot B2. Le raccord n'avait été fait que dans `openDraft`,
      // pas dans la reconstruction d'`adjustTarget` : ajuster une cible ramenait
      // l'incliné de 26 à 24 kg, c'est-à-dire à la valeur de la table.
      //
      // Ce test vit dans la **suite de contrat** parce que le défaut était précisément
      // une divergence entre les deux magasins : la version Dexie était correcte, celle
      // en mémoire non. Un test propre à l'une des deux n'aurait pas vu l'écart.
      const premier = await store.openDraft('C', '2026-09-20')
      await store.saveDraft({
        ...premier,
        sets: premier.sets.map((set) =>
          set.exerciseId === 'c-di'
            ? { ...set, status: 'validated' as const, weight: 26, reps: 8 }
            : { ...set, status: 'validated' as const },
        ),
      })
      await store.finalizeSeance(premier.id)
      await store.openDraft('C', '2026-09-27')

      await store.adjustTarget('deadlift', { w: 95 })

      const reconstruit = await store.loadDraft()
      // Le rôle est filtré depuis CB-56 : ces deux exercices sont précédés d'un palier
      // d'échauffement, et « la première série de c-di » rendrait ce palier.
      const serie = (exerciseId: string, role: string) =>
        reconstruit?.sets.find((set) => set.exerciseId === exerciseId && set.role === role)
      expect(serie('c-di', 'accessory')?.weight).toBe(26)
      // Et l'ajustement demandé a bien eu lieu : sans ça le test ne prouverait que
      // la moitié de ce qu'il prétend.
      expect(serie('c-deadlift', 'top')?.weight).toBe(95)
    })
  })
})
