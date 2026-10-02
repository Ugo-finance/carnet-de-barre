/**
 * Comparer, restaurer, garder le mien — CB-79g.
 *
 * Les trois gestes par lesquels Ugo sort d'une décision, sur un vrai magasin et contre
 * un faux serveur. Chacun est éprouvé par ce qu'il **ne doit pas** faire : la
 * comparaison n'écrit rien, la restauration ne renvoie rien, et aucun des deux ne
 * s'applique à autre chose que ce qui a été montré.
 */

import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { CarnetDatabase } from '../db/database.ts'
import { DexieStore } from '../db/store.ts'
import { FauxServeur } from '../test/faux-serveur.ts'
import { creerMoteur } from './moteur.ts'
import { transportSupabase, type Transport } from './transport.ts'

const APPAREIL = 'iphone-15-pro'

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-restauration-${compteur}`))
  await store.ready()
  return store
}

/** L'horloge des tests : chaque appel avance d'une minute, pour des dates distinctes. */
let minute = 0
const horloge = () => new Date(Date.UTC(2026, 9, 2, 8, minute++))

function moteurSur(store: DexieStore, transport: Transport | null) {
  return creerMoteur({
    maintenant: horloge,
    port: store,
    appareil: async () => APPAREIL,
    transport: async () => transport,
  })
}

/** Un téléphone sauvegardé, puis un autre appareil qui pousse un autre carnet. */
async function autreAppareilAEcrit() {
  const store = await magasinPret()
  await store.adjustTarget('squat', { w: 80 })
  const serveur = new FauxServeur()
  const moteur = moteurSur(store, serveur)
  moteur.demander()
  await moteur.inactif()

  const autre = await store.exportAll()
  const carnetDistant = {
    seances: autre.seances.slice(0, 3),
    targets: { ...autre.targets, squat: { ...autre.targets.squat, w: 100 } },
  }
  serveur.ecritureTierce(carnetDistant)
  return { store, serveur, moteur, carnetDistant }
}

describe('comparer avec la sauvegarde distante', () => {
  it('refuse sans session, et dit « rien » quand il n’y a pas de sauvegarde', async () => {
    const store = await magasinPret()
    await expect(moteurSur(store, null).comparer()).rejects.toThrow(/Connecte-toi/)
    expect(await moteurSur(store, new FauxServeur()).comparer()).toBeNull()
  })

  it('montre les deux carnets réels, sans rien écrire', async () => {
    const { store, moteur, carnetDistant } = await autreAppareilAEcrit()
    const avant = await store.etatSauvegarde()
    const seancesAvant = await store.listSeances()

    const comparaison = await moteur.comparer()

    expect(comparaison?.revision).toBe(2)
    expect(comparaison?.apercu.seanceCount).toBe(3)
    expect(comparaison?.apercu.targets.squat.w).toBe(100)
    expect(comparaison?.apercu.replacing.seanceCount).toBe(seancesAvant.length)
    expect(comparaison?.apercu.replacing.targets.squat.w).toBe(80)
    expect(carnetDistant.seances).toHaveLength(3)
    // Rien n'a bougé ici : ni le carnet, ni l'état de sauvegarde.
    expect(await store.etatSauvegarde()).toEqual(avant)
    expect(await store.listSeances()).toEqual(seancesAvant)
  })

  it('refuse une sauvegarde dans une version que cette app ne lit pas', async () => {
    const store = await magasinPret()
    const serveur = new FauxServeur()
    serveur.lireCarnet = async () => ({
      revision: 4,
      fichier: { schemaVersion: 999, targets: {}, seances: [] },
    })

    await expect(moteurSur(store, serveur).comparer()).rejects.toThrow(/version 999/)
  })
})

describe('restaurer la sauvegarde distante', () => {
  it('remplace le carnet local, et ne renvoie rien au serveur qui le porte déjà', async () => {
    const { store, serveur, moteur } = await autreAppareilAEcrit()
    const comparaison = (await moteur.comparer())!
    const ecritures = serveur.ecritures

    await moteur.restaurer(comparaison.jeton)
    await moteur.inactif()

    expect(await store.listSeances()).toHaveLength(3)
    expect((await store.getTargets()).squat.w).toBe(100)
    const etat = await store.etatSauvegarde()
    expect(etat.generationAcquittee).toBe(etat.generationLocale)
    expect(etat.revisionAcquittee).toBe(2)
    expect(etat.envoiEnVol).toBeNull()
    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', revision: 2 })
    expect(serveur.ecritures).toBe(ecritures)
  })

  it('date la restauration : le téléphone porte ce que porte le serveur', async () => {
    const { store, moteur } = await autreAppareilAEcrit()
    const avant = await store.derniereReussite()

    await moteur.restaurer((await moteur.comparer())!.jeton)
    await moteur.inactif()

    const apres = await store.derniereReussite()
    expect(apres).not.toBeNull()
    expect(apres! > (avant ?? '')).toBe(true)
    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', derniereReussite: apres })
  })

  it('sort d’un conflit en abandonnant les saisies locales non envoyées', async () => {
    const { store, serveur, moteur } = await autreAppareilAEcrit()
    await store.adjustTarget('bench', { w: 70 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({ etat: 'decision', action: { type: 'conflit' } })

    await moteur.restaurer((await moteur.comparer())!.jeton)
    await moteur.inactif()

    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', revision: 2 })
    expect((await store.getTargets()).squat.w).toBe(100)
    expect(serveur.carnet?.targets.squat.w).toBe(100)
  })

  it('oublie un envoi resté sans réponse : il portait un carnet abandonné', async () => {
    // Un envoi part, la réponse ne revient pas, un autre appareil écrit. Restaurer le
    // distant abandonne ce que portait cet envoi. S'il restait « en vol », le passage
    // suivant le reprendrait, sous son ancienne identité, par-dessus le carnet choisi.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const moteur = moteurSur(store, serveur)
    moteur.demander()
    await moteur.inactif()

    await store.adjustTarget('bench', { w: 70 })
    serveur.avantEcriture = () => {
      throw new Error('réponse jamais arrivée')
    }
    moteur.demander()
    await moteur.inactif()
    expect((await store.etatSauvegarde()).envoiEnVol).not.toBeNull()

    const exporte = await store.exportAll()
    serveur.ecritureTierce({
      seances: exporte.seances.slice(0, 3),
      targets: { ...exporte.targets, squat: { ...exporte.targets.squat, w: 100 } },
    })

    const ecritures = serveur.ecritures
    await moteur.restaurer((await moteur.comparer())!.jeton)
    await moteur.inactif()

    expect((await store.etatSauvegarde()).envoiEnVol).toBeNull()
    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', revision: 2 })
    expect(serveur.ecritures).toBe(ecritures)
    expect(serveur.carnet?.targets.squat.w).toBe(100)
  })

  it('refuse si le carnet local a changé depuis la comparaison, sans rien écrire', async () => {
    const { store, moteur } = await autreAppareilAEcrit()
    const comparaison = (await moteur.comparer())!
    await store.adjustTarget('bench', { w: 72.5 })
    const apresSaisie = await store.listSeances()

    await expect(moteur.restaurer(comparaison.jeton)).rejects.toMatchObject({
      code: 'stale-preview',
    })
    expect(await store.listSeances()).toEqual(apresSaisie)
    expect((await store.getTargets()).bench.w).toBe(72.5)
  })

  it('refuse pendant une séance en cours', async () => {
    const { store, moteur } = await autreAppareilAEcrit()
    const comparaison = (await moteur.comparer())!
    await store.openDraft('A', '2026-10-02')

    await expect(moteur.restaurer(comparaison.jeton)).rejects.toMatchObject({
      code: 'draft-in-progress',
    })
    expect((await store.getTargets()).squat.w).toBe(80)
  })

  it('repropose quand le distant a encore bougé après la comparaison', async () => {
    // La restauration porte sur la révision montrée. Si un autre appareil réécrit entre
    // l'aperçu et la confirmation, l'état ne doit pas dire « à jour » sur une révision
    // dépassée : le passage suivant le voit et propose de nouveau.
    const { serveur, moteur } = await autreAppareilAEcrit()
    const comparaison = (await moteur.comparer())!
    serveur.ecritureTierce()

    await moteur.restaurer(comparaison.jeton)
    await moteur.inactif()

    expect(moteur.etat()).toMatchObject({
      etat: 'decision',
      action: { type: 'proposer-restauration', revision: 3 },
    })
  })
})

describe('garder le mien', () => {
  it('n’est accepté que pour la décision affichée et sa révision', async () => {
    const { store, moteur } = await autreAppareilAEcrit()
    await expect(moteur.resoudreConflit(2)).rejects.toThrow(/ne correspond plus/)

    await store.adjustTarget('bench', { w: 70 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({ etat: 'decision', action: { revision: 2 } })

    await expect(moteur.resoudreConflit(1)).rejects.toThrow(/ne correspond plus/)
    await moteur.resoudreConflit(2)
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', revision: 3 })
  })

  it('ne vaut pas pour une restauration proposée : rien de local à garder', async () => {
    const { moteur } = await autreAppareilAEcrit()
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({
      etat: 'decision',
      action: { type: 'proposer-restauration' },
    })
    await expect(moteur.resoudreConflit(2)).rejects.toThrow(/ne correspond plus/)
  })
})

describe('la lecture du carnet distant réel', () => {
  function clientSimule(reponses: {
    session?: boolean
    entetes: ({ revision: number; schema_version: number | null } | null)[]
    cibles?: unknown
  }) {
    const entetes = [...reponses.entetes]
    const from = vi.fn((table: string) => {
      if (table === 'carnet') {
        return {
          select: () => ({
            maybeSingle: async () => ({ data: entetes.shift() ?? null, error: null }),
          }),
        }
      }
      if (table === 'seance') {
        return {
          select: () => ({
            order: async () => ({ data: [{ contenu: { id: 's1' } }], error: null }),
          }),
        }
      }
      return {
        select: () => ({
          maybeSingle: async () => ({
            data: reponses.cibles === undefined ? null : { contenu: reponses.cibles },
            error: null,
          }),
        }),
      }
    })
    const client = {
      auth: {
        getSession: async () => ({
          data: { session: reponses.session === false ? null : { user: {} } },
          error: null,
        }),
      },
      from,
    } as unknown as SupabaseClient
    return { client, from }
  }

  it('refuse sans session, sans interroger les tables', async () => {
    const { client, from } = clientSimule({ session: false, entetes: [] })
    await expect(transportSupabase(client).lireCarnet()).rejects.toThrow(/Aucune session/)
    expect(from).not.toHaveBeenCalled()
  })

  it('rend « rien » quand aucun carnet n’existe en face', async () => {
    const { client } = clientSimule({ entetes: [null] })
    expect(await transportSupabase(client).lireCarnet()).toBeNull()
  })

  it('refuse une lecture pendant laquelle le distant a changé', async () => {
    const { client } = clientSimule({
      entetes: [
        { revision: 4, schema_version: 2 },
        { revision: 5, schema_version: 2 },
      ],
      cibles: { squat: {} },
    })
    await expect(transportSupabase(client).lireCarnet()).rejects.toThrow(/a changé pendant/)
  })

  it('refuse un carnet sans cibles plutôt que de le présenter comme valable', async () => {
    const { client } = clientSimule({
      entetes: [
        { revision: 4, schema_version: 2 },
        { revision: 4, schema_version: 2 },
      ],
    })
    await expect(transportSupabase(client).lireCarnet()).rejects.toThrow(/incomplète/)
  })

  it('rend une version absente comme 0, que l’aperçu refusera', async () => {
    const { client } = clientSimule({
      entetes: [
        { revision: 4, schema_version: null },
        { revision: 4, schema_version: null },
      ],
      cibles: { squat: {} },
    })
    expect(await transportSupabase(client).lireCarnet()).toEqual({
      revision: 4,
      fichier: { schemaVersion: 0, targets: { squat: {} }, seances: [{ id: 's1' }] },
    })
  })
})
