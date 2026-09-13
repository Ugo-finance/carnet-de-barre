/**
 * L'ajustement manuel, éprouvé sur une vraie IndexedDB — CB-33.
 *
 * Ces tests existent pour la même raison que ceux de la finalisation : une transaction
 * Dexie qui écrit dans une table absente de sa portée lève, et la suite en mémoire ne
 * peut pas le voir puisqu'il n'y a pas de portée en mémoire. `adjustTarget` écrit
 * désormais dans `targets` **et** `meta` ; seule la vraie base prouve que les deux y
 * sont, que l'écriture est atomique, et qu'elle survit à une réouverture.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'

let compteur = 0
const nouvelleBase = (): CarnetDatabase => {
  compteur += 1
  return new CarnetDatabase(`carnet-cibles-${compteur}`)
}

async function magasinPret(): Promise<{ base: CarnetDatabase; store: DexieStore }> {
  const base = nouvelleBase()
  const store = new DexieStore(base)
  await store.ready()
  return { base, store }
}

/** Commence réellement la séance : une série validée, donc plus rien de vierge. */
async function commencer(store: DexieStore, date = '2026-09-12'): Promise<void> {
  const draft = await store.openDraft('C', date)
  await store.saveDraft({
    ...draft,
    sets: draft.sets.map((set, index) =>
      index === 0 ? { ...set, status: 'validated' as const, weight: 92.5, reps: 3 } : set,
    ),
  })
}

describe('ajustement manuel sur une vraie base', () => {
  it('écrit la cible et sa trace sans sortir de la portée transactionnelle', async () => {
    // Sans `meta` dans la portée, Dexie lèverait ici — et il l'aurait fait au premier
    // ajustement réel sur le téléphone, jamais avant.
    const { store } = await magasinPret()

    const apres = await store.adjustTarget('squat', { w: 77.5 })

    expect(apres.squat.w).toBe(77.5)
    const journal = await store.listTargetAdjustments()
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ lift: 'squat', after: { w: 77.5 } })
    expect(journal[0].before.w).toBe(75)
  })

  it('date la trace du jour, comme la cible elle-même', async () => {
    const { store } = await magasinPret()

    const apres = await store.adjustTarget('deadlift', { w: 85 })
    const [trace] = await store.listTargetAdjustments()

    expect(trace.at).toBe(apres.updatedAt)
    expect(trace.at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('empile les ajustements dans l’ordre, sans écraser les précédents', async () => {
    const { store } = await magasinPret()

    await store.adjustTarget('squat', { w: 77.5 })
    await store.adjustTarget('bench', { w: 72.5 })
    await store.adjustTarget('squat', { w: 80 })

    const journal = await store.listTargetAdjustments()
    expect(journal.map((trace) => [trace.lift, trace.after.w])).toEqual([
      ['squat', 77.5],
      ['bench', 72.5],
      ['squat', 80],
    ])
    // La trace précédente garde bien l'état d'avant, pas l'état courant.
    expect(journal[2].before.w).toBe(77.5)
  })

  it('survit à une réouverture de la base', async () => {
    // Le journal ne sert à rien s'il disparaît en fermant l'app : c'est précisément
    // des semaines plus tard qu'on lui demandera pourquoi une cible est là.
    const { base, store } = await magasinPret()
    await store.adjustTarget('tractions', { w: 17.5 })
    base.close()

    const rouverte = new CarnetDatabase(base.name)
    const journal = await new DexieStore(rouverte).listTargetAdjustments()

    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ lift: 'tractions', after: { w: 17.5 } })
  })

  it('n’écrit rien du tout quand l’ajustement est refusé', async () => {
    // Une cible refusée qui laisserait une trace ferait mentir le journal.
    const { store } = await magasinPret()

    await expect(store.adjustTarget('squat', { w: 750 })).rejects.toThrow(/500 kg/)

    expect((await store.getTargets()).squat.w).toBe(75)
    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('ne journalise pas un patch qui n’ajuste rien', async () => {
    const { store } = await magasinPret()

    await store.adjustTarget('squat', {})

    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('journalise l’effacement d’un échec en attente', async () => {
    // « Repartir à zéro » est aussi une décision d'Ugo, et elle change ce que le
    // moteur fera au prochain échec. Elle mérite donc la même trace.
    const { store } = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })

    await store.adjustTarget('bench', { fail: null })

    const journal = await store.listTargetAdjustments()
    expect(journal).toHaveLength(2)
    expect(journal[1].before.fail).toBe(70)
    expect(journal[1].after.fail).toBeNull()
  })

  it('est vide tant qu’aucun ajustement n’a eu lieu', async () => {
    const { store } = await magasinPret()
    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('refuse d’ajuster pendant une séance en cours, même sans passer par l’écran', async () => {
    // L'invariant doit vivre au point d'écriture, pas seulement dans l'interface.
    // L'écran peut lire « pas de brouillon » une fraction de seconde avant que la
    // séance n'en ouvre un ; une seconde fenêtre contourne l'interface entièrement.
    // Dans les deux cas, la cible déplacée rendrait la séance impossible à enregistrer.
    const { store } = await magasinPret()
    await commencer(store)
    const avant = await store.getTargets()

    await expect(store.adjustTarget('squat', { w: 80 })).rejects.toThrow(/séance est en cours/)

    expect((await store.getTargets()).squat.w).toBe(avant.squat.w)
    expect(await store.listTargetAdjustments()).toEqual([])
  })

  it('refuse aussi d’effacer un échec en attente pendant une séance', async () => {
    // « Repartir à zéro » change la cible autant qu'un déplacement de charge.
    const { store } = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    await commencer(store)

    await expect(store.adjustTarget('bench', { fail: null })).rejects.toThrow(/séance est en cours/)

    expect((await store.getTargets()).bench.fail).toBe(70)
  })

  it('laisse ajuster de nouveau une fois la séance finalisée', async () => {
    const { store } = await magasinPret()
    const draft = await store.openDraft('C', '2026-09-12')
    await store.saveDraft({
      ...draft,
      sets: draft.sets.map((set) => ({ ...set, status: 'validated' as const })),
    })
    await store.finalizeSeance(draft.id)

    const apres = await store.adjustTarget('squat', { w: 80 })
    expect(apres.squat.w).toBe(80)
  })

  it('ajuste malgré un brouillon vierge, et le reconstruit sur la nouvelle cible', async () => {
    // Le cas réel : Ugo finalise sa séance, l'écran d'accueil rouvre aussitôt un
    // brouillon vide, et il veut corriger une charge en sortant de la salle.
    const { store } = await magasinPret()
    const vierge = await store.openDraft('A', '2026-09-15')
    expect(vierge.baseTargets.squat.w).toBe(75)

    const apres = await store.adjustTarget('squat', { w: 80 })

    expect(apres.squat.w).toBe(80)
    const reconstruit = await store.loadDraft()
    // Les cibles de référence suivent : sans ça, la finalisation lèverait
    // `stale-targets` et la séance suivante serait inenregistrable.
    expect(reconstruit?.baseTargets.squat.w).toBe(80)
    // Et les séries pré-remplies aussi, sinon l'écran afficherait l'ancienne charge.
    const top = reconstruit?.sets.find((set) => set.exerciseId === 'a-squat' && set.role === 'top')
    expect(top?.weight).toBe(80)
  })

  it('garde le même identifiant de brouillon en le reconstruisant', async () => {
    // Un identifiant neuf ferait diverger la copie que l'écran de séance tient en
    // mémoire, sans qu'il s'en aperçoive.
    const { store } = await magasinPret()
    const vierge = await store.openDraft('A', '2026-09-15')

    await store.adjustTarget('squat', { w: 80 })

    expect((await store.loadDraft())?.id).toBe(vierge.id)
  })

  it('permet d’enchaîner finalisation, ajustement, puis nouvelle séance', async () => {
    // Le parcours d'acceptation complet du ticket, bout en bout.
    const { store } = await magasinPret()
    const premier = await store.openDraft('C', '2026-09-12')
    await store.saveDraft({
      ...premier,
      sets: premier.sets.map((set) => ({ ...set, status: 'validated' as const })),
    })
    await store.finalizeSeance(premier.id)

    // L'écran rouvre un brouillon dès l'affichage.
    await store.openDraft('C', '2026-09-12')
    await store.adjustTarget('squat', { w: 80 })

    // Puis la séance suivante se saisit et s'enregistre sans `stale-targets`.
    const suivant = await store.loadDraft()
    await store.saveDraft({
      ...suivant!,
      sets: suivant!.sets.map((set) => ({ ...set, status: 'validated' as const })),
    })
    const resultat = await store.finalizeSeance(suivant!.id)
    expect(resultat.seance.date).toBe('2026-09-12')
    expect(await store.listSeances()).toHaveLength(14)
  })

  it('ne rallume ni n’éteint l’écran en reconstruisant le brouillon', async () => {
    // La reconstruction remet les charges à jour. La préférence d'écran n'est pas une
    // donnée de séance : la voir sauter au moment où Ugo ajuste une cible lui
    // éteindrait l'écran en pleine salle sans qu'il ait rien demandé.
    const { store } = await magasinPret()
    const vierge = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({ ...vierge, keepAwake: true })

    await store.adjustTarget('squat', { w: 80 })

    const reconstruit = await store.loadDraft()
    expect(reconstruit?.keepAwake).toBe(true)
    expect(reconstruit?.baseTargets.squat.w).toBe(80)
  })

  it('ne reconstruit rien quand il n’y a pas de brouillon du tout', async () => {
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    expect(await store.loadDraft()).toBeUndefined()
  })
})
