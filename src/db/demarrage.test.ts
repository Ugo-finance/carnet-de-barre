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

  it('reste une séance en cours sans qu’on lui invente une heure de départ', () => {
    // La seule perte que le projet refuse absolument — faire disparaître une séance
    // réelle à la faveur d'une mise à jour — est évitée par le **repli** du prédicat,
    // pas par une date fabriquée. Une première version datait le démarrage depuis
    // `createdAt` : P1 de Codex sur #54, fondé. `createdAt` est l'instant où l'accueil
    // s'est affiché, et une carte de durée l'aurait présenté comme réel.
    const relu = hydrateDraft(stocke({ notes: 'Dos chargé' }))
    expect(relu.startedAt).toBeNull()
    expect(isDraftActive(relu)).toBe(true)
  })

  it('reste une séance en cours quand sa seule information est une note d’accessoire', () => {
    // Interaction entre CB-69 et ce lot : les deux agissent au **même point de lecture**,
    // l'un repliant les accessoires libres dans les notes, l'autre décidant du démarrage.
    //
    // L'ordre des deux est indifférent, et je l'ai vérifié plutôt que supposé : décider
    // après le pliage garde le test vert, la note ayant simplement changé de champ. Ce
    // que ce test tient vraiment, c'est que le critère continue de **regarder les
    // accessoires** — l'en retirer le fait tomber. Sans ça, une séance réelle ouverte
    // avant la mise à jour, et dont Ugo n'a noté que ses curls, redeviendrait
    // reconstructible sur de nouvelles cibles.
    const relu = hydrateDraft(
      stocke({ accessories: [{ exerciseId: 'a-curls', done: false, note: '12 kg' }] }),
    )
    expect(relu.startedAt).toBeNull()
    expect(isDraftActive(relu)).toBe(true)
    // Et la note, elle, a bien été rapatriée.
    expect(relu.notes).toBe('Curls : 12 kg')
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

describe('le magasin en mémoire répond comme celui du téléphone', () => {
  it('démarre le type demandé quand le brouillon ouvert est vierge', async () => {
    // Les deux implémentations du même contrat doivent répondre pareil, sinon un test
    // écrit contre la mauvaise ne prouve rien. P1 de Codex sur #54.
    const store = new MemoryStore()
    await store.ready()
    await store.openDraft('A', '2026-09-15')

    const demarre = await store.startSession('B', '2026-09-17', { now: 5000 })
    expect(demarre.type).toBe('B')
    expect(demarre.date).toBe('2026-09-17')
  })

  it('ne remplace jamais une séance commencée par celle qu’on demande', async () => {
    // D9 : rien ne se perd. C'est à l'interface de proposer explicitement d'abandonner.
    const store = new MemoryStore()
    await store.ready()
    const draft = await store.startSession('C', '2026-09-20', { now: 5000 })
    await store.saveDraft({ ...draft, notes: 'Dos chargé' })

    const reprise = await store.startSession('A', '2026-09-21', { now: 9000 })
    expect(reprise.type).toBe('C')
    expect(reprise.notes).toBe('Dos chargé')
    expect(reprise.startedAt).toBe(5000)
  })
})
