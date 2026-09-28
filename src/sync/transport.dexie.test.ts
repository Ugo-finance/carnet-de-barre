/**
 * Le transport, sur un vrai magasin et contre un faux serveur — CB-79d.
 *
 * Le faux serveur reproduit la sémantique de `appliquer_sauvegarde` telle que les tests
 * SQL la garantissent : création seulement depuis la révision 0, idempotence par
 * opération, révision contrôlée. Ce qu'il sait faire en plus, et que le vrai ne fait pas
 * sur commande : **perdre sa réponse après avoir écrit**. C'est la panne qui a façonné le
 * protocole, et il faut pouvoir la déclencher.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from '../db/database.ts'
import { DexieStore } from '../db/store.ts'
import type { CarnetComparable } from '../db/exchange.ts'
import type { LectureDistante } from '../domain/sauvegarde.ts'
import {
  lireResultat,
  synchroniser,
  type EcritureDistante,
  type ResultatEcriture,
  type Transport,
} from './transport.ts'

const APPAREIL = 'iphone-15-pro'

class FauxServeur implements Transport {
  revision: number | null = null
  derniere: string | null = null
  carnet: CarnetComparable | null = null
  ecritures = 0
  /** Écrit, puis fait comme si la réponse s'était perdue. */
  perdreLaReponse = false
  /** Coupe le réseau : aucune requête n'arrive. */
  horsLigne = false
  /** Ce qui se passe en face entre notre lecture et notre écriture. */
  avantEcriture: (() => void) | null = null

  async lire(): Promise<LectureDistante> {
    if (this.horsLigne) throw new Error('réseau coupé')
    if (this.revision === null) return { etat: 'absente' }
    return { etat: 'lue', revision: this.revision, operation: this.derniere }
  }

  async ecrire(e: EcritureDistante): Promise<ResultatEcriture> {
    if (this.horsLigne) throw new Error('réseau coupé')
    this.avantEcriture?.()
    this.avantEcriture = null
    if (this.revision === null) {
      if (e.revisionAttendue !== 0) return { motif: 'revision-perimee', revision: null }
      this.revision = 0
    }
    if (this.derniere === e.operation) return { motif: 'deja-applique', revision: this.revision }
    if (this.revision !== e.revisionAttendue) {
      return { motif: 'revision-perimee', revision: this.revision }
    }
    this.revision += 1
    this.derniere = e.operation
    this.carnet = structuredClone(e.carnet)
    this.ecritures += 1
    if (this.perdreLaReponse) {
      this.perdreLaReponse = false
      throw new Error('réponse perdue')
    }
    return { motif: 'applique', revision: this.revision }
  }

  /** Le projet distant est vidé : plus aucun carnet en face. */
  vider(): void {
    this.revision = null
    this.derniere = null
    this.carnet = null
  }

  /** Un autre appareil écrit. */
  ecritureTierce(): void {
    this.revision = (this.revision ?? 0) + 1
    this.derniere = 'macbook:1'
  }
}

let compteur = 0
async function magasinPret(): Promise<DexieStore> {
  compteur += 1
  const store = new DexieStore(new CarnetDatabase(`carnet-transport-${compteur}`))
  await store.ready()
  return store
}

describe('un cycle de sauvegarde', () => {
  it('n’envoie rien depuis un carnet resté au dossier de départ', async () => {
    const store = await magasinPret()
    const serveur = new FauxServeur()

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-jour' })
    expect(serveur.ecritures).toBe(0)
  })

  it('envoie le carnet modifié, et l’acquitte à la révision posée', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 1 })

    expect(serveur.carnet?.targets.squat.w).toBe(80)
    const etat = await store.etatSauvegarde()
    expect(etat.generationAcquittee).toBe(etat.generationLocale)
    expect(etat.revisionAcquittee).toBe(1)
    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-jour' })
  })

  it('n’acquitte rien quand le réseau est coupé, et reprend au retour', async () => {
    // L'écran ne doit jamais dire « sauvegardé » sur une erreur avalée.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.horsLigne = true

    await expect(synchroniser(store, serveur, APPAREIL)).rejects.toThrow(/réseau coupé/)
    expect((await store.etatSauvegarde()).generationAcquittee).toBe(0)

    serveur.horsLigne = false
    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 1 })
  })
})

describe('la réponse perdue après écriture', () => {
  it('se reconnaît au cycle suivant, sans second incrément', async () => {
    // La panne qui a façonné le protocole : le serveur écrit, la réponse se perd.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.perdreLaReponse = true

    await expect(synchroniser(store, serveur, APPAREIL)).rejects.toThrow(/perdue/)
    expect((await store.etatSauvegarde()).generationAcquittee).toBe(0)

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 1 })
    expect(serveur.ecritures).toBe(1)
    expect(serveur.revision).toBe(1)
  })

  it('laisse partir ensuite ce qu’Ugo a saisi pendant la panne', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.perdreLaReponse = true
    await expect(synchroniser(store, serveur, APPAREIL)).rejects.toThrow()

    await store.adjustTarget('bench', { w: 75 }) // pendant la panne

    await synchroniser(store, serveur, APPAREIL) // reconnaît g
    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 2 })
    expect(serveur.carnet?.targets.bench.w).toBe(75)
  })
})

describe('un autre appareil a écrit', () => {
  it('propose la restauration quand rien de local n’attend', async () => {
    const store = await magasinPret()
    const serveur = new FauxServeur()
    serveur.ecritureTierce()

    const issue = await synchroniser(store, serveur, APPAREIL)

    expect(issue).toEqual({
      issue: 'decision',
      action: { type: 'proposer-restauration', revision: 1 },
    })
    expect(serveur.ecritures).toBe(0)
  })

  it('remonte un conflit, et n’écrase rien, quand du local attend aussi', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.ecritureTierce()

    const issue = await synchroniser(store, serveur, APPAREIL)

    expect(issue).toMatchObject({ issue: 'decision', action: { type: 'conflit' } })
    expect(serveur.ecritures).toBe(0)
  })

  it('après « garde le mien », envoie contre la révision montrée à Ugo', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.ecritureTierce()
    await synchroniser(store, serveur, APPAREIL)

    await store.resoudreConflit(1)

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 2 })
    expect(serveur.carnet?.targets.squat.w).toBe(80)
  })

  it('n’écrase pas un distant qui a encore bougé depuis l’affichage', async () => {
    // Le contrôle dont dépend `garderLeMien` : Ugo a vu la révision 1, mais le macbook a
    // écrit la 2 entre-temps. Écraser ici détruirait un changement que personne n'a vu.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    serveur.ecritureTierce()
    await synchroniser(store, serveur, APPAREIL)
    await store.resoudreConflit(1)

    serveur.ecritureTierce() // révision 2, jamais montrée

    const issue = await synchroniser(store, serveur, APPAREIL)
    expect(issue).toMatchObject({ issue: 'decision', action: { type: 'conflit', revision: 2 } })
    expect(serveur.ecritures).toBe(0)
  })
})

describe('la course entre lecture et écriture', () => {
  it('ne prend pas un refus pour une réussite quand un autre appareil écrit entre les deux', async () => {
    // Ce que le protocole ne peut pas voir : la lecture montrait un distant à jour, et
    // le macbook écrit juste avant que notre envoi n'arrive. C'est le serveur, sous
    // verrou, qui refuse — et ce refus ne doit surtout pas être acquitté. Sans ce test,
    // aucun parcours ne produisait de refus à l'écriture, et acquitter dessus passait.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    await synchroniser(store, serveur, APPAREIL) // révision 1, à jour

    await store.adjustTarget('bench', { w: 75 })
    serveur.avantEcriture = () => serveur.ecritureTierce() // révision 2, en plein vol

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-relire' })
    expect(serveur.carnet?.targets.bench.w).not.toBe(75)
    const etat = await store.etatSauvegarde()
    expect(etat.generationAcquittee).toBeLessThan(etat.generationLocale)
    expect(etat.revisionAcquittee).toBe(1)

    // Le cycle suivant voit la révision 2 et remonte le conflit, sans écraser.
    expect(await synchroniser(store, serveur, APPAREIL)).toMatchObject({
      issue: 'decision',
      action: { type: 'conflit', revision: 2 },
    })
  })
})

describe('une sauvegarde distante disparue — CB-84', () => {
  it('se reconstitue en entier, et le cycle le dit au lieu d’afficher « à jour »', async () => {
    // La reproduction qui a ouvert le ticket : une écriture, puis « à jour » pour toujours.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    await synchroniser(store, serveur, APPAREIL)

    serveur.vider()

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({
      issue: 'reconstituee',
      revision: 1,
      revisionDisparue: 1,
    })
    expect(serveur.carnet?.targets.squat.w).toBe(80)
    expect(serveur.carnet?.seances).toHaveLength((await store.listSeances()).length)
    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-jour' })
    expect(serveur.ecritures).toBe(2)
  })

  it('emporte aussi ce qui attendait encore au moment de la disparition', async () => {
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    await synchroniser(store, serveur, APPAREIL)
    await store.adjustTarget('bench', { w: 75 })

    serveur.vider()

    expect(await synchroniser(store, serveur, APPAREIL)).toMatchObject({ issue: 'reconstituee' })
    expect(serveur.carnet?.targets.bench.w).toBe(75)
  })

  it('survit à une réponse perdue pendant la reconstitution', async () => {
    // L'oubli de l'acquis est persisté avec l'envoi en vol : au cycle suivant, notre
    // commit est reconnu en face, et ni la disparition ni l'envoi ne se rejouent.
    const store = await magasinPret()
    await store.adjustTarget('squat', { w: 80 })
    const serveur = new FauxServeur()
    await synchroniser(store, serveur, APPAREIL)
    serveur.vider()
    serveur.perdreLaReponse = true

    await expect(synchroniser(store, serveur, APPAREIL)).rejects.toThrow(/perdue/)

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'envoye', revision: 1 })
    expect(serveur.ecritures).toBe(2)
  })

  it('ne se déclenche jamais pour un carnet resté au dossier de départ', async () => {
    const store = await magasinPret()
    const serveur = new FauxServeur()

    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-jour' })
    expect(await synchroniser(store, serveur, APPAREIL)).toEqual({ issue: 'a-jour' })
    expect(serveur.ecritures).toBe(0)
  })
})

describe('lire la réponse du serveur', () => {
  it('accepte les trois motifs attendus', () => {
    expect(lireResultat({ motif: 'applique', revision: 3 })).toEqual({
      motif: 'applique',
      revision: 3,
    })
    expect(lireResultat({ motif: 'deja-applique', revision: 3 })).toEqual({
      motif: 'deja-applique',
      revision: 3,
    })
    expect(lireResultat({ motif: 'revision-perimee', revision: null })).toEqual({
      motif: 'revision-perimee',
      revision: null,
    })
  })

  it('refuse une réponse qu’elle ne comprend pas, plutôt que d’acquitter dessus', () => {
    expect(() => lireResultat(null)).toThrow(/illisible/)
    expect(() => lireResultat({ motif: 'applique' })).toThrow(/sans révision/)
    expect(() => lireResultat({ motif: 'applique', revision: '3' })).toThrow(/sans révision/)
    expect(() => lireResultat({ motif: 'ok', revision: 3 })).toThrow(/inconnu/)
  })
})
