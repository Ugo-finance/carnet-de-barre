/**
 * La génération de sauvegarde, sur une vraie IndexedDB — CB-79b.
 *
 * Le défaut que ces tests verrouillent est **silencieux par nature** : une séance
 * enregistrée dont la génération n'a pas bougé n'a l'air de rien. Elle ne partira jamais,
 * et l'app dira « à jour ». Rien dans l'interface ne peut le montrer, donc rien d'autre
 * qu'un test ne peut le trouver.
 *
 * Les tests en mémoire ne prouveraient rien ici : ce qui est en cause, c'est ce qui se
 * passe quand une écriture s'interrompt entre deux instructions, et seule une vraie base
 * transactionnelle a cette propriété.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { SAUVEGARDE_KEY } from './sauvegarde.ts'
import type { LectureDistante } from '../domain/sauvegarde.ts'
import { setId } from './draft.ts'

const APPAREIL = 'iphone-15-pro'
const VIDE: LectureDistante = { etat: 'absente' }

let compteur = 0
async function magasinPret(): Promise<{ base: CarnetDatabase; store: DexieStore }> {
  compteur += 1
  const base = new CarnetDatabase(`carnet-sauvegarde-${compteur}`)
  const store = new DexieStore(base)
  await store.ready()
  return { base, store }
}

async function generation(store: DexieStore): Promise<number> {
  return (await store.etatSauvegarde()).generationLocale
}

describe('la génération avance avec la donnée qu’elle couvre', () => {
  it('ne bouge pas à l’amorçage : charger le dossier de départ n’est pas une saisie', async () => {
    // La règle qui protège une vraie sauvegarde distante. Si l'amorçage comptait, une
    // installation neuve se croirait « en retard » et enverrait ses données de
    // démonstration par-dessus le carnet d'Ugo.
    const { store } = await magasinPret()

    expect(await generation(store)).toBe(0)
    expect(await store.listSeances()).not.toHaveLength(0)
  })

  it('avance d’un cran quand une séance réelle est finalisée', async () => {
    // La plus importante des cinq, et celle que j'avais oubliée : c'est la séance
    // qu'Ugo vient de faire. Si elle n'avance pas la génération, elle ne part jamais —
    // et c'est précisément la donnée que la sauvegarde existe pour protéger.
    const { store } = await magasinPret()
    const brouillon = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({
      ...brouillon,
      sets: brouillon.sets.map((set) =>
        set.id === setId('a-squat', 'top', 0)
          ? { ...set, weight: 75, reps: 4, rpe: 8, status: 'validated' as const }
          : set,
      ),
    })
    const avant = await generation(store)

    const resultat = await store.finalizeSeance(brouillon.id)

    expect(resultat.applied).toBe(true)
    expect(await generation(store)).toBe(avant + 1)
  })

  it('avance d’un cran quand une séance est corrigée', async () => {
    const { store } = await magasinPret()
    const [seance] = await store.listSeances()
    const avant = await generation(store)

    await store.updateSeance(seance.id, { notes: 'corrigée' })

    expect(await generation(store)).toBe(avant + 1)
  })

  it('avance d’un cran quand une séance est supprimée', async () => {
    // Cette écriture n'avait aucune transaction : elle ne posait qu'une ligne.
    const { store } = await magasinPret()
    const [seance] = await store.listSeances()
    const avant = await generation(store)

    await store.deleteSeance(seance.id)

    expect(await generation(store)).toBe(avant + 1)
  })

  it('avance d’un cran quand une cible est ajustée', async () => {
    const { store } = await magasinPret()
    const avant = await generation(store)

    await store.adjustTarget('squat', { w: 80 })

    expect(await generation(store)).toBe(avant + 1)
  })

  it('avance d’un cran quand tout le carnet est remplacé', async () => {
    const { store } = await magasinPret()
    const complet = await store.exportAll()
    const fichier = { ...complet, seances: complet.seances.slice(0, 3) }
    const apercu = await store.previewImport(fichier)
    const avant = await generation(store)

    await store.importReplace(fichier, apercu.identite)

    expect(await generation(store)).toBe(avant + 1)
  })

  it('ne bouge pas pour un brouillon : ce lot sauvegarde le carnet finalisé', async () => {
    // Avancer à chaque frappe enverrait des dizaines de fois la même séance sans rien
    // protéger de plus. Le contrat de CB-75a le dit, et cette garde l'exécute.
    const { store } = await magasinPret()
    const avant = await generation(store)

    const brouillon = await store.openDraft('C', '2026-09-20')
    await store.saveDraft({ ...brouillon, notes: 'en cours de saisie' })
    await store.clearDraft()

    expect(await generation(store)).toBe(avant)
  })

  it('ne bouge pas quand l’écriture de la donnée échoue', async () => {
    // Le cœur du lot. Si la génération avançait hors de la transaction, une correction
    // refusée laisserait une génération en avance : l'app enverrait un carnet inchangé,
    // ce qui est inoffensif. L'inverse ne l'est pas, et c'est pourquoi les deux vont
    // ensemble — on ne peut pas garantir l'un sans l'autre.
    const { store } = await magasinPret()
    const [seance] = await store.listSeances()
    const avant = await generation(store)

    await expect(store.updateSeance(seance.id, { date: 'pas une date' })).rejects.toThrow()

    expect(await generation(store)).toBe(avant)
    expect((await store.listSeances()).find((s) => s.id === seance.id)?.date).toBe(seance.date)
  })

  it('annule la génération si l’écriture échoue après elle, dans la même transaction', async () => {
    // La preuve que les deux écritures sont bien atomiques : on fait échouer la table
    // `meta` en plein milieu. Ni la séance ni la génération ne doivent survivre.
    const { base, store } = await magasinPret()
    const [seance] = await store.listSeances()
    const avant = await generation(store)
    const putOrigine = base.meta.put.bind(base.meta)
    base.meta.put = (() => {
      throw new Error('écriture meta refusée')
    }) as unknown as typeof base.meta.put

    await expect(store.updateSeance(seance.id, { notes: 'perdue' })).rejects.toThrow(/refusée/)
    base.meta.put = putOrigine

    expect(await generation(store)).toBe(avant)
    expect((await store.listSeances()).find((s) => s.id === seance.id)?.notes).toBe(seance.notes)
  })

  it('repart de zéro sur une base écrite avant ce lot', async () => {
    const { base, store } = await magasinPret()
    await base.meta.delete(SAUVEGARDE_KEY)

    expect(await generation(store)).toBe(0)
  })
})

describe('la file d’envoi durable', () => {
  it('ne propose rien tant que rien n’a été saisi', async () => {
    const { store } = await magasinPret()

    expect((await store.preparerEnvoi(APPAREIL, VIDE)).action).toEqual({ type: 'rien' })
  })

  it('exige d’avoir lu le distant avant toute décision', async () => {
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })

    const prepare = await store.preparerEnvoi(APPAREIL, { etat: 'inconnue' })

    expect(prepare.action).toEqual({ type: 'lire-distant' })
    expect(prepare.carnet).toBeNull()
  })

  it('fige l’instantané, et le réessai renvoie le même contenu', async () => {
    // La contrainte nommée par Codex sur #71. Un réessai porte la **même** identité
    // d'opération ; renvoyer le carnet d'aujourd'hui sous l'identité d'hier ferait
    // diverger ce que le serveur a enregistré de ce que nous croyons lui avoir envoyé.
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const premier = await store.preparerEnvoi(APPAREIL, VIDE)
    expect(premier.action).toMatchObject({ type: 'envoyer', generation: 1 })

    // Ugo continue pendant que la réponse se fait attendre.
    await store.adjustTarget('bench', { w: 75 })

    const reprise = await store.preparerEnvoi(APPAREIL, VIDE)

    expect(reprise.action).toEqual(premier.action)
    expect(reprise.carnet).toEqual(premier.carnet)
    expect(reprise.carnet?.targets.bench.w).not.toBe(75)
  })

  it('survit à un redémarrage : l’instantané est en base, pas en mémoire', async () => {
    const { base, store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const premier = await store.preparerEnvoi(APPAREIL, VIDE)
    await store.adjustTarget('bench', { w: 75 })

    // Un autre magasin sur la même base : c'est ce que fait un rechargement.
    const apresRedemarrage = new DexieStore(base)
    await apresRedemarrage.ready()
    const reprise = await apresRedemarrage.preparerEnvoi(APPAREIL, VIDE)

    expect(reprise.action).toEqual(premier.action)
    expect(reprise.carnet).toEqual(premier.carnet)
  })

  it('libère l’instantané une fois l’envoi acquitté, et laisse partir la suite', async () => {
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    await store.preparerEnvoi(APPAREIL, VIDE)
    await store.adjustTarget('bench', { w: 75 })

    await store.acquitterEnvoi(1, 1)

    const suivant = await store.preparerEnvoi(APPAREIL, {
      etat: 'lue',
      revision: 1,
      operation: null,
    })
    expect(suivant.action).toMatchObject({ type: 'envoyer', generation: 2 })
    // Cette fois le carnet envoyé est celui d'aujourd'hui, cible de développé comprise.
    expect(suivant.carnet?.targets.bench.w).toBe(75)
  })

  it('reconnaît notre propre commit quand la réponse s’est perdue', async () => {
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const envoi = await store.preparerEnvoi(APPAREIL, VIDE)
    const operation = envoi.action.type === 'envoyer' ? envoi.action.operation : ''

    const apres = await store.preparerEnvoi(APPAREIL, { etat: 'lue', revision: 1, operation })

    expect(apres.action).toEqual({ type: 'acquitter-envoi', generation: 1, revision: 1 })
  })

  it('un conflit suspend les envois, et « garde le mien » les relance', async () => {
    // Le parcours qu'Ugo verra. Sans la résolution, le conflit est définitif et plus
    // aucune séance ne repart — c'est ce trou qui a justifié `garderLeMien`.
    const { store } = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const tiers: LectureDistante = { etat: 'lue', revision: 9, operation: 'macbook:4' }

    expect((await store.preparerEnvoi(APPAREIL, tiers)).action).toMatchObject({ type: 'conflit' })

    await store.resoudreConflit(9)

    expect((await store.preparerEnvoi(APPAREIL, tiers)).action).toMatchObject({
      type: 'envoyer',
      generation: 1,
    })
  })
})
