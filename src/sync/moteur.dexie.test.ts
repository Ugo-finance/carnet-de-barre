/**
 * Le moteur de sauvegarde, sur un vrai magasin et contre un faux serveur — CB-79e.
 *
 * Ce qui est éprouvé ici n'est pas le protocole (c'est `transport.dexie.test.ts`), mais
 * ce qui le fait tourner : une demande n'est jamais perdue, deux passages ne se croisent
 * jamais, une erreur ne devient jamais « à jour », et ce qu'Ugo doit savoir lui reste
 * affiché.
 */

import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { CarnetDatabase } from '../db/database.ts'
import { DexieStore } from '../db/store.ts'
import { FauxServeur } from '../test/faux-serveur.ts'
import { creerMoteur, type EtatMoteur } from './moteur.ts'
import { transportSupabase, type Transport } from './transport.ts'

const APPAREIL = 'iphone-15-pro'

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-moteur-${compteur}`))
  await store.ready()
  return store
}

function moteurSur(store: DexieStore, transport: Transport | null) {
  const moteur = creerMoteur({
    port: store,
    appareil: async () => APPAREIL,
    transport: async () => transport,
  })
  const etats: EtatMoteur[] = []
  moteur.abonner((etat) => etats.push(etat))
  return { moteur, etats }
}

/** Un serveur qui retient ses lectures tant qu'on ne l'a pas lâché. */
class ServeurRetenu extends FauxServeur {
  enVol = 0
  maxEnVol = 0
  private retenir = true
  private enAttente: (() => void)[] = []

  override async lire() {
    this.enVol += 1
    this.maxEnVol = Math.max(this.maxEnVol, this.enVol)
    if (this.retenir) await new Promise<void>((resoudre) => this.enAttente.push(resoudre))
    this.enVol -= 1
    return super.lire()
  }

  /** Attend qu'une lecture soit bloquée, preuve qu'un passage est en vol. */
  async lectureBloquee(): Promise<void> {
    while (this.enAttente.length === 0) await new Promise((r) => setTimeout(r, 0))
  }

  lacher(): void {
    this.retenir = false
    for (const resoudre of this.enAttente.splice(0)) resoudre()
  }
}

describe('le moteur de sauvegarde', () => {
  it('ne prétend rien quand personne n’est connecté', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const { moteur } = moteurSur(store, null)

    moteur.demander()
    await moteur.inactif()

    expect(moteur.etat()).toEqual({ etat: 'deconnecte' })
    expect((await store.etatSauvegarde()).generationAcquittee).toBe(0)
  })

  it('redevient « déconnecté » quand la session disparaît, au lieu de rester à jour', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    let transport: Transport | null = new FauxServeur()
    const moteur = creerMoteur({
      port: store,
      appareil: async () => APPAREIL,
      transport: async () => transport,
    })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat().etat).toBe('a-jour')

    transport = null
    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'deconnecte' })
  })

  it('envoie une mutation et s’arrête à jour, à la révision confirmée', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur, etats } = moteurSur(store, serveur)

    moteur.demander()
    await moteur.inactif()

    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1 })
    expect(etats.map((e) => e.etat)).toEqual(['en-cours', 'a-jour'])
    expect(serveur.carnet?.targets.squat.w).toBe(80)
    expect(serveur.ecritures).toBe(1)
  })

  it('dit « en attente » sur une panne, n’acquitte rien, et reprend sans doublon', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.horsLigne = true
    const { moteur } = moteurSur(store, serveur)

    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'en-attente', erreur: 'réseau coupé' })
    expect((await store.etatSauvegarde()).generationAcquittee).toBe(0)

    serveur.horsLigne = false
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1 })
    expect(serveur.ecritures).toBe(1)
  })

  it('reprend un envoi dont la réponse s’est perdue, sous la même identité', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.perdreLaReponse = true
    const { moteur } = moteurSur(store, serveur)

    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat().etat).toBe('en-attente')

    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1 })
    // Le commit perdu a été reconnu, pas rejoué comme une seconde écriture.
    expect(serveur.ecritures).toBe(1)
  })

  it('ne lance jamais deux passages à la fois', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new ServeurRetenu()
    const { moteur } = moteurSur(store, serveur)

    moteur.demander()
    await serveur.lectureBloquee()
    moteur.demander()
    moteur.demander()
    serveur.lacher()
    await moteur.inactif()

    expect(serveur.maxEnVol).toBe(1)
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1 })
  })

  it('rejoue une demande reçue pendant un passage qui se croyait fini', async () => {
    // Le pire instant : le passage vient de constater « à jour », et une séance est
    // enregistrée avant qu'il ne rende la main. Sa demande arrive pendant un passage ; si
    // elle était ignorée, la séance attendrait le prochain déclencheur — peut-être la
    // séance suivante — en affichant « à jour ».
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    let piege = true
    const port = {
      preparerEnvoi: store.preparerEnvoi.bind(store),
      acquitterEnvoi: store.acquitterEnvoi.bind(store),
      resoudreConflit: store.resoudreConflit.bind(store),
      reconstitutionNonLue: store.reconstitutionNonLue.bind(store),
      oublierReconstitution: store.oublierReconstitution.bind(store),
      async etatSauvegarde() {
        if (piege && serveur.ecritures === 1) {
          piege = false
          await store.adjustTarget('squat', { w: 82.5 })
          moteur.demander()
        }
        return store.etatSauvegarde()
      },
    }
    const moteur = creerMoteur({
      port,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })

    moteur.demander()
    await moteur.inactif()

    expect(piege).toBe(false)
    expect(serveur.carnet?.targets.squat.w).toBe(82.5)
    const etat = await store.etatSauvegarde()
    expect(etat.generationAcquittee).toBe(etat.generationLocale)
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 2 })
  })

  it('s’arrête sur un conflit, puis envoie le carnet local quand Ugo le garde', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur } = moteurSur(store, serveur)
    moteur.demander()
    await moteur.inactif()

    serveur.ecritureTierce()
    await store.adjustTarget('squat', { w: 85 })
    moteur.demander()
    await moteur.inactif()

    const etat = moteur.etat()
    expect(etat.etat).toBe('decision')
    if (etat.etat !== 'decision') return
    expect(etat.action.type).toBe('conflit')
    expect(serveur.carnet?.targets.squat.w).toBe(80)

    await moteur.resoudreConflit(2)
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 3 })
    expect(serveur.carnet?.targets.squat.w).toBe(85)
  })

  it('garde l’annonce d’une sauvegarde reconstituée jusqu’à ce qu’Ugo l’ait lue', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur } = moteurSur(store, serveur)
    moteur.demander()
    await moteur.inactif()

    serveur.vider()
    moteur.demander()
    await moteur.inactif()
    const annonce = { revisionDisparue: 1 }
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, reconstitution: annonce })

    // Une séance de plus ne l'efface pas : Ugo ne l'a pas encore vue.
    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 2, reconstitution: annonce })

    await moteur.oublierReconstitution()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 2 })
    // Et l'oubli est durable : un autre démarrage ne la ressort pas.
    const { moteur: apres } = moteurSur(store, serveur)
    apres.demander()
    await apres.inactif()
    expect(apres.etat()).toEqual({ etat: 'a-jour', revision: 2 })
  })

  it('annonce la reconstitution même quand la réponse de l’envoi s’est perdue', async () => {
    // P2 du robot Codex sur #87 : le serveur applique la reconstitution, la réponse se
    // perd, et le passage suivant ne voit qu'un `envoye` reconnu. L'annonce ne doit pas
    // dépendre de la réponse qui l'a portée.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur } = moteurSur(store, serveur)
    moteur.demander()
    await moteur.inactif()

    serveur.vider()
    serveur.perdreLaReponse = true
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat().etat).toBe('en-attente')

    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({
      etat: 'a-jour',
      revision: 1,
      reconstitution: { revisionDisparue: 1 },
    })
  })

  it('annonce encore la reconstitution après un redémarrage de l’app', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur } = moteurSur(store, serveur)
    moteur.demander()
    await moteur.inactif()
    serveur.vider()
    moteur.demander()
    await moteur.inactif()

    // Un nouveau moteur, comme après une fermeture de l'app : rien en mémoire.
    const { moteur: redemarre } = moteurSur(store, serveur)
    redemarre.demander()
    await redemarre.inactif()
    expect(redemarre.etat()).toEqual({
      etat: 'a-jour',
      revision: 1,
      reconstitution: { revisionDisparue: 1 },
    })
  })

  it('s’arrête et le dit quand le distant ne se stabilise pas', async () => {
    const store = await magasinPret()
    const synchroniser = vi.fn(async () => ({ issue: 'a-relire' as const }))
    const moteur = creerMoteur({
      port: store,
      appareil: async () => APPAREIL,
      transport: async () => new FauxServeur(),
      synchroniser,
    })

    moteur.demander()
    await moteur.inactif()

    expect(moteur.etat().etat).toBe('en-attente')
    expect(synchroniser).toHaveBeenCalledTimes(8)
  })

  it('continue de sauvegarder quand un écran abonné plante', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const { moteur } = moteurSur(store, serveur)
    moteur.abonner(() => {
      throw new Error('écran cassé')
    })

    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1 })

    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(serveur.carnet?.targets.squat.w).toBe(82.5)
  })
})

describe('le magasin prévient le moteur', () => {
  it('après le commit d’une mutation, jamais avant, et pas pour une transaction annulée', async () => {
    compteur += 1
    const base = new CarnetDatabase(`carnet-signal-${compteur}`)
    const store = new DexieStore(base)
    await store.ready()
    let appels = 0
    store.surMutationCarnet(() => {
      appels += 1
    })
    const noter = () => store['noterMutationCarnet']()

    await base.transaction('rw', base.meta, async () => {
      await noter()
      await base.meta.get('preferences')
      // Toujours dans la transaction : la mutation peut encore être annulée.
      expect(appels).toBe(0)
    })
    expect(appels).toBe(1)

    await expect(
      base.transaction('rw', base.meta, async () => {
        await noter()
        throw new Error('annulée après avoir noté')
      }),
    ).rejects.toThrow('annulée')
    await new Promise((r) => setTimeout(r, 20))
    expect(appels).toBe(1)
    expect((await store.etatSauvegarde()).generationLocale).toBe(1)
  })

  it('refuse de noter une mutation hors transaction', async () => {
    const store = await magasinPret()
    await expect(store['noterMutationCarnet']()).rejects.toThrow(/hors transaction/)
  })

  it('prévient à chaque mutation réelle du carnet', async () => {
    const store = await magasinPret()
    let appels = 0
    store.surMutationCarnet(() => {
      appels += 1
    })
    const [seance] = await store.listSeances()

    await store.adjustTarget('squat', { w: 80 })
    await store.updateSeance(seance!.id, { notes: 'corrigée' })
    await store.deleteSeance(seance!.id)

    expect(appels).toBe(3)
  })

  it('garde la même identité d’appareil d’un démarrage à l’autre', async () => {
    compteur += 1
    const nom = `carnet-appareil-${compteur}`
    const premier = await new DexieStore(new CarnetDatabase(nom)).identifiantAppareil()
    const second = await new DexieStore(new CarnetDatabase(nom)).identifiantAppareil()
    const ailleurs = await (await magasinPret()).identifiantAppareil()

    expect(premier).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toBe(premier)
    expect(ailleurs).not.toBe(premier)
  })
})

describe('le transport réel sans session', () => {
  it('refuse de lire plutôt que de prendre un carnet invisible pour un carnet disparu', async () => {
    const from = vi.fn()
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
      from,
    } as unknown as SupabaseClient

    await expect(transportSupabase(client).lire()).rejects.toThrow(/Aucune session/)
    expect(from).not.toHaveBeenCalled()
  })
})
