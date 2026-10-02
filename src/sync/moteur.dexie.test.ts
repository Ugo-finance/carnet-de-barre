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
/** L'horloge figée des tests : la date de réussite doit être exactement celle-ci. */
const HEURE = '2026-10-02T09:30:00.000Z'
const horloge = () => new Date(HEURE)

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-moteur-${compteur}`))
  await store.ready()
  return store
}

function moteurSur(store: DexieStore, transport: Transport | null) {
  const moteur = creerMoteur({
    maintenant: horloge,
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
      maintenant: horloge,
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

    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })
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
      derniereReussite: store.derniereReussite.bind(store),
      noterReussite: store.noterReussite.bind(store),
      previewImport: store.previewImport.bind(store),
      restaurerDistant: store.restaurerDistant.bind(store),
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
      maintenant: horloge,
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 2, derniereReussite: HEURE })
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 3, derniereReussite: HEURE })
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
    expect(moteur.etat()).toEqual({
      etat: 'a-jour',
      revision: 1,
      derniereReussite: HEURE,
      reconstitution: annonce,
    })

    // Une séance de plus ne l'efface pas : Ugo ne l'a pas encore vue.
    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({
      etat: 'a-jour',
      revision: 2,
      derniereReussite: HEURE,
      reconstitution: annonce,
    })

    await moteur.oublierReconstitution()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 2, derniereReussite: HEURE })
    // Et l'oubli est durable : un autre démarrage ne la ressort pas.
    const { moteur: apres } = moteurSur(store, serveur)
    apres.demander()
    await apres.inactif()
    expect(apres.etat()).toEqual({ etat: 'a-jour', revision: 2, derniereReussite: HEURE })
  })

  it('n’efface jamais une décision en marquant l’annonce comme lue', async () => {
    // P1 de Codex sur #87 : l'oubli relisait l'annonce, et un passage publiait un conflit
    // pendant cette lecture. La lecture revenue republiait l'ancien « à jour » par-dessus :
    // l'écran disait « à jour » alors que le protocole attendait le geste d'Ugo.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    let retenir = false
    let liberer = () => {}
    let lectureRetenue = () => {}
    const retenue = new Promise<void>((r) => (lectureRetenue = r))
    const port = {
      preparerEnvoi: store.preparerEnvoi.bind(store),
      acquitterEnvoi: store.acquitterEnvoi.bind(store),
      resoudreConflit: store.resoudreConflit.bind(store),
      etatSauvegarde: store.etatSauvegarde.bind(store),
      oublierReconstitution: store.oublierReconstitution.bind(store),
      derniereReussite: store.derniereReussite.bind(store),
      noterReussite: store.noterReussite.bind(store),
      previewImport: store.previewImport.bind(store),
      restaurerDistant: store.restaurerDistant.bind(store),
      async reconstitutionNonLue() {
        if (retenir) {
          retenir = false
          lectureRetenue()
          await new Promise<void>((r) => (liberer = r))
        }
        return store.reconstitutionNonLue()
      },
    }
    const moteur = creerMoteur({
      maintenant: horloge,
      port,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })
    moteur.demander()
    await moteur.inactif()
    serveur.vider()
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({ etat: 'a-jour', reconstitution: { revisionDisparue: 1 } })

    // Un autre appareil écrit, et une séance est enregistrée ici : le prochain passage
    // doit s'arrêter sur un conflit.
    serveur.ecritureTierce()
    await store.adjustTarget('squat', { w: 85 })

    retenir = true
    const oubli = moteur.oublierReconstitution()
    await Promise.race([retenue, new Promise((r) => setTimeout(r, 50))])
    moteur.demander()
    await moteur.inactif()
    liberer()
    await oubli
    await moteur.inactif()

    expect(moteur.etat().etat).toBe('decision')
    expect(await store.reconstitutionNonLue()).toBeNull()
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
      derniereReussite: HEURE,
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
      derniereReussite: HEURE,
      reconstitution: { revisionDisparue: 1 },
    })
  })

  it('s’arrête et le dit quand le distant ne se stabilise pas', async () => {
    const store = await magasinPret()
    const synchroniser = vi.fn(async () => ({ issue: 'a-relire' as const }))
    const moteur = creerMoteur({
      maintenant: horloge,
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
    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })

    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(serveur.carnet?.targets.squat.w).toBe(82.5)
  })
})

describe('la date de la dernière réussite', () => {
  function horlogeReglable(depart: string) {
    let actuelle = depart
    return { lire: () => new Date(actuelle), regler: (iso: string) => (actuelle = iso) }
  }

  it('dit depuis quand rien n’est confirmé, même après un redémarrage hors ligne', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const temps = horlogeReglable('2026-10-01T16:00:00.000Z')
    const moteur = creerMoteur({
      maintenant: temps.lire,
      port: store,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toMatchObject({ derniereReussite: '2026-10-01T16:00:00.000Z' })

    // Le lendemain, en salle, sans réseau : la date est celle d'hier, pas celle de l'échec.
    temps.regler('2026-10-02T18:00:00.000Z')
    serveur.horsLigne = true
    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()
    expect(moteur.etat()).toEqual({
      etat: 'en-attente',
      erreur: 'réseau coupé',
      derniereReussite: '2026-10-01T16:00:00.000Z',
    })

    // Fermée puis rouverte, toujours hors ligne : rien en mémoire, la date est là.
    const rouvert = creerMoteur({
      maintenant: temps.lire,
      port: store,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })
    rouvert.demander()
    await rouvert.inactif()
    expect(rouvert.etat()).toMatchObject({
      etat: 'en-attente',
      derniereReussite: '2026-10-01T16:00:00.000Z',
    })
  })

  it('date un envoi confirmé même si la vérification qui suit échoue', async () => {
    // P2 du robot Codex sur #89 : la génération g est acquittée, puis la relecture du
    // cycle suivant tombe. La réussite de g est réelle ; elle doit être datée.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const ecrireReel = serveur.ecrire.bind(serveur)
    serveur.ecrire = async (e) => {
      const resultat = await ecrireReel(e)
      serveur.horsLigne = true
      return resultat
    }
    const { moteur } = moteurSur(store, serveur)

    moteur.demander()
    await moteur.inactif()

    expect(serveur.ecritures).toBe(1)
    expect(moteur.etat()).toEqual({
      etat: 'en-attente',
      erreur: 'réseau coupé',
      derniereReussite: HEURE,
    })
    expect(await store.derniereReussite()).toBe(HEURE)
  })

  it('ne date pas une simple vérification : seul un envoi confirmé avance la date', async () => {
    // P2 de Codex sur #89 : le lendemain, l'app rouvre, relit le distant, rien ne part.
    // La date affichée comme « dernière sauvegarde réussie » ne doit pas devenir celle
    // de ce passage : aucune séance n'a été mise à l'abri ce jour-là.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const temps = horlogeReglable('2026-10-01T16:00:00.000Z')
    const moteur = creerMoteur({
      maintenant: temps.lire,
      port: store,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })
    moteur.demander()
    await moteur.inactif()

    temps.regler('2026-10-02T08:00:00.000Z')
    moteur.demander()
    await moteur.inactif()

    expect(serveur.ecritures).toBe(1)
    expect(moteur.etat()).toEqual({
      etat: 'a-jour',
      revision: 1,
      derniereReussite: '2026-10-01T16:00:00.000Z',
    })
    expect(await store.derniereReussite()).toBe('2026-10-01T16:00:00.000Z')
  })

  it('garde la réussite du jour quand le stockage refuse de la remplacer', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    const temps = horlogeReglable('2026-10-01T16:00:00.000Z')
    let refuser = false
    const port = Object.assign(Object.create(store) as DexieStore, {
      async noterReussite(quand: string) {
        if (refuser) throw new Error('stockage plein')
        return store.noterReussite(quand)
      },
    })
    const moteur = creerMoteur({
      maintenant: temps.lire,
      port,
      appareil: async () => APPAREIL,
      transport: async () => serveur,
    })
    moteur.demander()
    await moteur.inactif()

    temps.regler('2026-10-02T18:00:00.000Z')
    refuser = true
    await store.adjustTarget('squat', { w: 82.5 })
    moteur.demander()
    await moteur.inactif()

    expect(serveur.ecritures).toBe(2)
    expect(moteur.etat()).toMatchObject({ derniereReussite: '2026-10-02T18:00:00.000Z' })
  })

  it('ne date rien quand rien n’a jamais été confirmé', async () => {
    // Un carnet resté au dossier de départ est « à jour » sans avoir rien envoyé : ce
    // n'est pas une sauvegarde, et l'écran ne doit pas en afficher la date.
    const store = await magasinPret()
    const { moteur } = moteurSur(store, new FauxServeur())
    moteur.demander()
    await moteur.inactif()

    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: null })
    expect(await store.derniereReussite()).toBeNull()
  })

  it('accompagne une décision de la dernière réussite', async () => {
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

    expect(moteur.etat()).toMatchObject({ etat: 'decision', derniereReussite: HEURE })
  })

  it('reste à jour quand la date ne peut pas être retenue', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const port = Object.assign(Object.create(store) as DexieStore, {
      noterReussite: async () => {
        throw new Error('stockage plein')
      },
    })
    const moteur = creerMoteur({
      maintenant: horloge,
      port,
      appareil: async () => APPAREIL,
      transport: async () => new FauxServeur(),
    })
    moteur.demander()
    await moteur.inactif()

    expect(moteur.etat()).toEqual({ etat: 'a-jour', revision: 1, derniereReussite: HEURE })
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
