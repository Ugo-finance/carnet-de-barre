/**
 * Le moteur de sauvegarde : ce qui fait partir le carnet sans qu'Ugo y pense — CB-79e.
 *
 * `synchroniser` joue **un** cycle et dit ce qu'il a produit. Le moteur décide quand en
 * jouer, et combien : il enchaîne les cycles jusqu'à un état stable (`a-jour`, ou une
 * décision qui revient à Ugo), et publie un état que l'écran affiche tel quel.
 *
 * Trois règles, et chacune répond à une panne précise :
 *
 * - **un seul passage à la fois.** Deux cycles concurrents prépareraient deux envois
 *   depuis le même état ; le magasin les sérialise, mais l'écran verrait alterner deux
 *   récits. Une demande qui arrive pendant un passage est **retenue**, et rejouée à la fin
 *   de celui-ci : la mutation qui l'a causée ne peut pas être oubliée entre deux cycles ;
 * - **une erreur n'est jamais un succès.** Réseau coupé, session expirée, serveur qui
 *   refuse : l'état devient `en-attente`, avec la raison, et rien n'est acquitté. Le
 *   prochain déclencheur — mutation, retour du réseau, retour au premier plan — reprend ;
 * - **une reconstitution se dit jusqu'à ce qu'elle soit lue.** Une sauvegarde distante qui
 *   a disparu puis a été renvoyée en entier est réparée, mais Ugo doit l'apprendre. Elle
 *   reste attachée à `a-jour` jusqu'à `oublierReconstitution()`.
 *
 * Le moteur ne connaît ni Supabase ni IndexedDB : il reçoit un port, un transport ou
 * `null` quand personne n'est connecté, et une identité d'appareil. Il se teste donc sur
 * un vrai magasin et un faux serveur, sans réseau.
 */

import type { SauvegardePort } from '../db/contracts.ts'
import type { ActionSauvegarde } from '../domain/sauvegarde.ts'
import { synchroniser as synchroniserParDefaut, type Transport } from './transport.ts'

/** Ce qu'une sauvegarde disparue puis renvoyée laisse à dire. */
export interface Reconstitution {
  /** La dernière révision confirmée avant la disparition. */
  revisionDisparue: number
}

export type EtatMoteur =
  /** Personne n'est connecté : rien ne part, et rien ne prétend partir. */
  | { etat: 'deconnecte' }
  /** Un passage est en cours. */
  | { etat: 'en-cours' }
  /** Tout ce qui est enregistré ici est confirmé en face, à cette révision. */
  | { etat: 'a-jour'; revision: number | null; reconstitution?: Reconstitution }
  /** Le dernier passage a échoué ; rien n'est acquitté, le prochain déclencheur reprend. */
  | { etat: 'en-attente'; erreur: string }
  /** Le protocole attend un geste d'Ugo : restauration proposée, conflit ou recul. */
  | { etat: 'decision'; action: ActionSauvegarde }

/**
 * L'annonce durable d'une reconstitution. Le magasin l'écrit dans la transaction qui
 * constate la disparition : le moteur ne la tient pas en mémoire, où une réponse perdue
 * ou un rechargement l'effaceraient.
 */
export interface AnnonceReconstitution {
  reconstitutionNonLue(): Promise<Reconstitution | null>
  oublierReconstitution(): Promise<void>
}

export interface DependancesMoteur {
  port: SauvegardePort & AnnonceReconstitution
  appareil: () => Promise<string>
  /** Le transport d'une session ouverte, ou `null` quand personne n'est connecté. */
  transport: () => Promise<Transport | null>
  /** Remplaçable pour les tests d'orchestration. */
  synchroniser?: typeof synchroniserParDefaut
}

export interface MoteurSauvegarde {
  etat(): EtatMoteur
  /** L'abonné reçoit chaque nouvel état. Rend de quoi se désabonner. */
  abonner(abonne: (etat: EtatMoteur) => void): () => void
  /** Demande un passage. Sans effet visible si un passage tourne déjà : il sera rejoué. */
  demander(): void
  /** Résout la fin du passage en cours et de ceux qu'il a retenus. Utile aux tests. */
  inactif(): Promise<void>
  /** « Garde le mien » devant un conflit ou un recul, à la révision montrée à Ugo. */
  resoudreConflit(revision: number): Promise<void>
  /** Ugo a lu que la sauvegarde avait été reconstituée. */
  oublierReconstitution(): Promise<void>
}

/**
 * Au-delà, le distant bouge plus vite que nous ne lisons, ou le protocole tourne en rond.
 * Dans les deux cas, continuer ne dirait rien de plus : on s'arrête et on le dit.
 */
const CYCLES_PAR_PASSAGE = 8

function messageDe(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'Erreur inconnue.'
}

export function creerMoteur(dependances: DependancesMoteur): MoteurSauvegarde {
  const synchroniser = dependances.synchroniser ?? synchroniserParDefaut
  const abonnes = new Set<(etat: EtatMoteur) => void>()
  let courant: EtatMoteur = { etat: 'deconnecte' }
  let passage: Promise<void> | null = null
  let retenu = false

  function publier(suivant: EtatMoteur): void {
    courant = suivant
    for (const abonne of abonnes) {
      try {
        abonne(suivant)
      } catch {
        // Un écran qui plante en recevant l'état ne doit pas arrêter la sauvegarde.
      }
    }
  }

  async function aJour(revision: number | null): Promise<EtatMoteur> {
    const annonce = await dependances.port.reconstitutionNonLue()
    return annonce
      ? { etat: 'a-jour', revision, reconstitution: annonce }
      : { etat: 'a-jour', revision }
  }

  async function unPassage(): Promise<void> {
    let transport: Transport | null
    let appareil: string
    try {
      transport = await dependances.transport()
      if (!transport) {
        publier({ etat: 'deconnecte' })
        return
      }
      appareil = await dependances.appareil()
    } catch (cause) {
      publier({ etat: 'en-attente', erreur: messageDe(cause) })
      return
    }

    publier({ etat: 'en-cours' })
    for (let cycle = 0; cycle < CYCLES_PAR_PASSAGE; cycle += 1) {
      try {
        const issue = await synchroniser(dependances.port, transport, appareil)
        switch (issue.issue) {
          case 'a-jour': {
            const { revisionAcquittee } = await dependances.port.etatSauvegarde()
            publier(await aJour(revisionAcquittee))
            return
          }
          case 'reconstituee':
          case 'envoye':
          case 'a-relire':
            // Un envoi confirmé peut en laisser un autre derrière lui ; un refus de
            // révision appelle une relecture. Le cycle suivant le dira.
            continue
          case 'decision':
            publier({ etat: 'decision', action: issue.action })
            return
        }
      } catch (cause) {
        publier({ etat: 'en-attente', erreur: messageDe(cause) })
        return
      }
    }
    publier({
      etat: 'en-attente',
      erreur: 'La sauvegarde distante change sans se stabiliser. Nouvel essai au prochain passage.',
    })
  }

  async function tourner(): Promise<void> {
    try {
      do {
        retenu = false
        await unPassage()
      } while (retenu)
    } finally {
      // Sans quoi un seul passage interrompu bloquerait le moteur pour toute la session :
      // chaque demande suivante serait « retenue » derrière un passage qui n'existe plus.
      passage = null
    }
  }

  const moteur: MoteurSauvegarde = {
    etat: () => courant,

    abonner(abonne) {
      abonnes.add(abonne)
      return () => {
        abonnes.delete(abonne)
      }
    },

    demander() {
      if (passage) {
        retenu = true
        return
      }
      passage = tourner()
    },

    async inactif() {
      while (passage) await passage
    },

    async resoudreConflit(revision) {
      // Pas besoin d'attendre un passage en cours : le magasin sérialise la résolution
      // avec la préparation d'un envoi, et la demande qui suit est rejouée s'il tourne.
      await dependances.port.resoudreConflit(revision)
      moteur.demander()
    },

    async oublierReconstitution() {
      await dependances.port.oublierReconstitution()
      if (courant.etat === 'a-jour') publier(await aJour(courant.revision))
    },
  }
  return moteur
}
