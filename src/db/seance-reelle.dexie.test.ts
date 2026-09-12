/**
 * Répétition générale de la séance du 12.09.2026 — sur une vraie IndexedDB.
 *
 * Ugo s'entraîne un **samedi**, qui n'est pas un jour de rotation (C = dimanche,
 * A = mardi, B = jeudi). C'est précisément le cas qui a produit un P1 : la séance
 * proposée est celle de **demain**, et un brouillon daté de demain aurait enregistré
 * la séance au mauvais jour, faussant l'historique et l'export.
 *
 * Ce fichier ne teste pas une fonction : il rejoue le parcours entier, de l'ouverture
 * de l'app à l'export, sur les mêmes objets que le téléphone. Les tests unitaires
 * prouvent chaque pièce ; celui-ci prouve qu'elles sont branchées — le défaut qui a
 * rendu les écrans Cibles et Export inatteignables était exactement de cette nature.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { currentSession, isScheduledSessionDone, todayInZurich } from '../domain/schedule.ts'
import { parseImport } from '../domain/schema.ts'
import { serializeExport } from './exchange.ts'
import type { Draft } from '../domain/types.ts'

/** Samedi 12.09.2026, 18 h à Zurich. */
const SAMEDI_SOIR = new Date('2026-09-12T16:00:00Z')

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-reelle-${compteur}`))
  await store.ready()
  return store
}

/** Ce que fait l'écran : valider chaque série à la charge proposée. */
function toutValider(draft: Draft): Draft {
  return {
    ...draft,
    sets: draft.sets.map((set) => ({
      ...set,
      status: 'validated' as const,
      weight: set.targetWeight,
      reps: set.targetReps,
      rpe: set.role === 'top' ? 8 : null,
    })),
  }
}

describe('la séance de ce soir, de bout en bout', () => {
  it('propose la séance C de demain mais date le brouillon d’aujourd’hui', async () => {
    // Le cœur du P1 : le **type** est une suggestion, la **date** ne l'est pas.
    const store = await magasinPret()
    const aujourdhui = todayInZurich(SAMEDI_SOIR)
    expect(aujourdhui).toBe('2026-09-12')

    const suggestion = currentSession(SAMEDI_SOIR, isScheduledSessionDone(aujourdhui, []))
    expect(suggestion.type).toBe('C')
    // Le champ s'appelle `scheduledDate` depuis CB-14, précisément parce que `date`
    // se confondait avec « aujourd'hui ». C'est la date du calendrier, pas celle du jour.
    expect(suggestion.scheduledDate).toBe('2026-09-13')
    expect(suggestion.isToday).toBe(false)

    const draft = await store.openDraft(suggestion.type, aujourdhui)
    expect(draft.date).toBe('2026-09-12')
    expect(draft.type).toBe('C')
  })

  it('enregistre la séance au samedi et fait progresser les cibles', async () => {
    const store = await magasinPret()
    const aujourdhui = todayInZurich(SAMEDI_SOIR)
    const avant = await store.getTargets()

    const draft = await store.openDraft('C', aujourdhui)
    await store.saveDraft(toutValider(draft))
    const resultat = await store.finalizeSeance(draft.id)

    expect(resultat.seance.date).toBe('2026-09-12')
    expect(resultat.seance.type).toBe('C')
    // Les séries validées doivent survivre : c'est tout l'enjeu de la soirée.
    expect(resultat.seance.lines.length).toBeGreaterThan(0)
    // Le soulevé de terre est le mouvement piloté de la séance C.
    expect(resultat.targets.deadlift.w).toBeGreaterThan(avant.deadlift.w)
    expect(resultat.events.length).toBeGreaterThan(0)
  })

  it('ajoute la séance à l’historique sans écraser les douze de départ', async () => {
    const store = await magasinPret()
    const depart = await store.listSeances()
    expect(depart).toHaveLength(12)

    const draft = await store.openDraft('C', todayInZurich(SAMEDI_SOIR))
    await store.saveDraft(toutValider(draft))
    await store.finalizeSeance(draft.id)

    const apres = await store.listSeances()
    expect(apres).toHaveLength(13)
    expect(apres.some((seance) => seance.date === '2026-09-12')).toBe(true)
  })

  it('ferme le brouillon, pour que rien ne traîne après la séance', async () => {
    const store = await magasinPret()
    const draft = await store.openDraft('C', todayInZurich(SAMEDI_SOIR))
    await store.saveDraft(toutValider(draft))
    await store.finalizeSeance(draft.id)

    expect(await store.loadDraft()).toBeUndefined()
  })

  it('produit un export relisible, qui contient la séance du soir', async () => {
    // C'est ce texte qu'Ugo me collera après sa séance. S'il n'est pas relisible, la
    // soirée est enregistrée dans son téléphone et nulle part ailleurs.
    const store = await magasinPret()
    const draft = await store.openDraft('C', todayInZurich(SAMEDI_SOIR))
    await store.saveDraft(toutValider(draft))
    await store.finalizeSeance(draft.id)

    const texte = serializeExport(await store.exportAll())
    const relu = parseImport(JSON.parse(texte))

    expect(relu.ok).toBe(true)
    if (!relu.ok) return
    // Plus besoin de `as` depuis CB-04 : `ImportResult` est discriminé sur `format`,
    // donc ce `return` suffit à donner le bon type à `relu.data`.
    if (relu.format !== 'current') return
    const fichier = relu.data
    const duSoir = fichier.seances.find((seance) => seance.date === '2026-09-12')
    expect(duSoir).toBeDefined()
    expect(duSoir?.type).toBe('C')
    expect(duSoir?.lines.length).toBeGreaterThan(0)
    // Les cibles exportées sont celles d'après progression : c'est ce qui sert à
    // préparer la séance suivante.
    expect(fichier.targets.deadlift.w).toBe((await store.getTargets()).deadlift.w)
  })

  it('survit à une fermeture de l’app en pleine séance', async () => {
    // Le cas le plus banal : l'écran s'éteint, iOS décharge l'onglet, il rouvre.
    const base = new CarnetDatabase(`carnet-reelle-reprise-${(compteur += 1)}`)
    const store = new DexieStore(base)
    await store.ready()

    const draft = await store.openDraft('C', todayInZurich(SAMEDI_SOIR))
    const moitie = {
      ...draft,
      sets: draft.sets.map((set, index) =>
        index === 0 ? { ...set, status: 'validated' as const, weight: 95, reps: 3, rpe: 8 } : set,
      ),
    }
    await store.saveDraft(moitie)
    base.close()

    const rouvert = new DexieStore(new CarnetDatabase(base.name))
    const repris = await rouvert.loadDraft()

    expect(repris?.id).toBe(draft.id)
    expect(repris?.date).toBe('2026-09-12')
    expect(repris?.sets[0].status).toBe('validated')
    expect(repris?.sets[0].weight).toBe(95)
  })
})
