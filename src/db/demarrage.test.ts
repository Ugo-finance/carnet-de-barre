/**
 * Ouvrir n'est pas démarrer — CB-62.
 *
 * L'app construit un brouillon au simple affichage de l'accueil, y compris juste après
 * une finalisation. `createdAt` ne mesure donc rien, et « une séance est-elle en
 * cours ? » se répondait par un détour : *ce brouillon porte-t-il une information ?*
 *
 * Le détour a un trou, et c'est lui que ce fichier attaque : entre le moment où Ugo
 * démarre sa séance et celui où il valide sa première série, il est debout devant la
 * barre et l'app se croit libre de reconstruire son brouillon.
 */

import { describe, expect, it } from 'vitest'
import { MemoryStore } from './memory.ts'
import { buildDraft, hydrateDraft, isDraftActive, startDraft, type StoredDraft } from './draft.ts'
import { draftToSeance } from './derive.ts'
import { buildExport, serializeExport, validateImport } from './exchange.ts'
import type { Draft, Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function neuf(): Draft {
  return buildDraft('A', '2026-09-15', CIBLES, { id: 'd', now: 1000 })
}

describe('le démarrage explicite', () => {
  it('ne date rien à l’ouverture', () => {
    expect(neuf().startedAt).toBeNull()
  })

  it('date la séance au geste, et une seule fois', () => {
    const demarre = startDraft(neuf(), 5000)
    expect(demarre.startedAt).toBe(5000)
    // Reprise après rechargement, ou deuxième tap : le premier instant reste le bon.
    expect(startDraft(demarre, 9000).startedAt).toBe(5000)
  })
})

describe('« une séance est-elle en cours ? »', () => {
  it('dit non d’un brouillon seulement ouvert', () => {
    // C'est ce qui autorise à le reconstruire sur de nouvelles cibles : il ne porte
    // aucune information, et Ugo doit pouvoir ajuster une cible en sortant de la salle.
    expect(isDraftActive(neuf())).toBe(false)
  })

  it('dit oui d’un brouillon démarré dont rien n’est encore validé', () => {
    // Le trou de l'ancien critère. Ugo a tapé « Démarrer », il charge sa barre, aucune
    // série n'est validée : l'app se croyait libre de tout reconstruire.
    expect(isDraftActive(startDraft(neuf(), 5000))).toBe(true)
  })

  it('dit oui d’un brouillon non démarré qui porte déjà une saisie', () => {
    // Le repli, qui couvre les brouillons ouverts avant que le démarrage existe.
    const avecNote = { ...neuf(), notes: 'Épaule droite sensible' }
    expect(avecNote.startedAt).toBeNull()
    expect(isDraftActive(avecNote)).toBe(true)
  })
})

describe('un brouillon écrit avant que le champ existe', () => {
  function stocke(over: Partial<Draft> = {}): StoredDraft {
    const { startedAt: _ignore, ...sans } = { ...neuf(), ...over }
    return sans
  }

  it('reste une séance en cours s’il portait une information', () => {
    // La seule perte que le projet refuse absolument : faire disparaître une séance
    // réelle à la faveur d'une mise à jour.
    const relu = hydrateDraft(stocke({ notes: 'Dos chargé' }))
    expect(relu.startedAt).toBe(1000)
    expect(isDraftActive(relu)).toBe(true)
  })

  it('reste reconstructible s’il n’en portait aucune', () => {
    const relu = hydrateDraft(stocke())
    expect(relu.startedAt).toBeNull()
    expect(isDraftActive(relu)).toBe(false)
  })
})

describe('ce que la séance enregistrée en garde', () => {
  it('porte le début et la fin quand la séance a été démarrée', () => {
    const seance = draftToSeance(startDraft(neuf(), 5000), 8000)
    expect(seance.startedAt).toBe(5000)
    expect(seance.completedAt).toBe(8000)
  })

  it('n’invente aucune durée pour une séance jamais démarrée', () => {
    // Zéro serait un mensonge, `createdAt` en serait un autre : l'absence se propage.
    const seance = draftToSeance(neuf(), 8000)
    expect(seance.startedAt).toBeUndefined()
    expect(seance.completedAt).toBe(8000)
  })
})

describe('l’écran de réglages pendant une séance', () => {
  it('refuse d’ajuster une cible dès que la séance est démarrée', async () => {
    const store = new MemoryStore()
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft(startDraft(draft, 5000))

    // Rien n'est validé, rien n'est noté : l'ancien critère répondait « brouillon
    // vierge » et laissait l'ajustement passer, en pleine séance.
    await expect(store.adjustTarget('squat', { w: 80 })).rejects.toMatchObject({
      code: 'draft-in-progress',
    })
  })

  it('le laisse passer tant que la séance n’est qu’ouverte', async () => {
    const store = new MemoryStore()
    await store.ready()
    await store.openDraft('A', '2026-09-15')

    const cibles = await store.adjustTarget('squat', { w: 80 })
    expect(cibles.squat.w).toBe(80)
  })
})

describe('l’aller-retour d’export', () => {
  it('conserve le début et la fin d’une séance', async () => {
    const store = new MemoryStore()
    await store.ready()
    let draft = await store.openDraft('A', '2026-09-15')
    draft = startDraft(draft, 5000)
    draft = {
      ...draft,
      sets: draft.sets.map((set) =>
        set.id === 'a-squat:top:0' ? { ...set, status: 'validated' as const } : set,
      ),
    }
    await store.saveDraft(draft)
    await store.finalizeSeance(draft.id)

    const relu = validateImport(JSON.parse(serializeExport(await buildExport(store))))
    const seance = relu.seances.find((candidate) => candidate.date === '2026-09-15')
    expect(seance?.startedAt).toBe(5000)
    expect(seance?.completedAt).toBeGreaterThan(0)
  })
})
