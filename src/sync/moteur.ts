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

import {
  StoreError,
  type IdentiteComparaison,
  type ImportPreview,
  type SauvegardePort,
} from '../db/contracts.ts'
import type { Targets } from '../domain/types.ts'
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
  /**
   * Tout ce qui est enregistré ici est confirmé en face, à cette révision.
   * `derniereReussite` est l'instant de cette confirmation ; absente quand rien n'a
   * jamais été confirmé (`revision: null`).
   */
  | {
      etat: 'a-jour'
      revision: number | null
      derniereReussite?: string
      reconstitution?: Reconstitution
    }
  /**
   * Le dernier passage a échoué ; rien n'est acquitté, le prochain déclencheur reprend.
   * `derniereReussite` dit depuis quand le distant n'a plus été confirmé.
   */
  | { etat: 'en-attente'; erreur: string; derniereReussite?: string }
  /** Le protocole attend un geste d'Ugo : restauration proposée, conflit ou recul. */
  | { etat: 'decision'; action: ActionSauvegarde; derniereReussite?: string }

/**
 * L'annonce durable d'une reconstitution. Le magasin l'écrit dans la transaction qui
 * constate la disparition : le moteur ne la tient pas en mémoire, où une réponse perdue
 * ou un rechargement l'effaceraient.
 */
export interface AnnonceReconstitution {
  reconstitutionNonLue(): Promise<Reconstitution | null>
  oublierReconstitution(): Promise<void>
}

/**
 * La date de la dernière confirmation, durable — CB-79f.
 *
 * Elle se lit surtout quand ça ne va pas : « en attente depuis hier 18 h » dit à Ugo
 * combien de séances ne sont pas encore à l'abri. Elle doit donc survivre à un
 * redémarrage hors ligne, où aucun passage ne peut la recalculer.
 */
export interface JournalReussite {
  derniereReussite(): Promise<string | null>
  noterReussite(quand: string): Promise<void>
}

/**
 * Comparer puis restaurer le carnet distant — CB-79g.
 *
 * Les deux opérations du magasin que l'écran de comparaison consomme, par le moteur :
 * l'aperçu est **celui de l'import manuel**, et la restauration passe par le même
 * remplacement atomique, avec l'état de sauvegarde adopté dans la même transaction.
 */
export interface RestaurationDistante {
  previewImport(input: unknown): Promise<ImportPreview>
  restaurerDistant(
    input: unknown,
    identite: IdentiteComparaison,
    revision: number,
  ): Promise<{ seanceCount: number; targets: Targets }>
}

/**
 * Ce que l'écran reçoit pour comparer, et rend pour confirmer.
 *
 * `jeton` est **opaque** pour l'écran : il porte le fichier lu, les empreintes comparées
 * et la révision. La confirmation n'accepte que lui, si bien qu'une restauration ne peut
 * porter que sur ce qui a été montré à Ugo.
 */
export interface ComparaisonDistante {
  apercu: ImportPreview
  revision: number
  jeton: JetonRestauration
}

export interface JetonRestauration {
  readonly fichier: unknown
  readonly identite: IdentiteComparaison
  readonly revision: number
}

/**
 * Exclusion mutuelle des opérations qui touchent au distant — CB-79g.
 *
 * Un passage et une restauration ne doivent jamais se croiser, **même entre deux
 * fenêtres** : P1 du robot Codex sur #90. Une fenêtre envoyait l'ancien carnet pendant que
 * l'autre restaurait ; l'envoi arrivé après réécrivait le serveur avec le carnet abandonné.
 * Le magasin sérialise ses transactions, mais pas les requêtes réseau qui les séparent.
 *
 * L'app passe un verrou du navigateur (`navigator.locks`), partagé par toutes les
 * fenêtres de l'origine. À défaut, le verrou local sérialise au moins cette fenêtre-ci.
 */
export type Verrou = <T>(travail: () => Promise<T>) => Promise<T>

export function creerVerrouLocal(): Verrou {
  let file: Promise<unknown> = Promise.resolve()
  return <T>(travail: () => Promise<T>) => {
    const tour = file.then(travail, travail)
    file = tour.catch(() => undefined)
    return tour
  }
}

export interface DependancesMoteur {
  port: SauvegardePort & AnnonceReconstitution & JournalReussite & RestaurationDistante
  appareil: () => Promise<string>
  /** Le transport d'une session ouverte, ou `null` quand personne n'est connecté. */
  transport: () => Promise<Transport | null>
  /** Remplaçable pour les tests d'orchestration. */
  synchroniser?: typeof synchroniserParDefaut
  /** L'horloge, remplaçable pour les tests. */
  maintenant?: () => Date
  /** Voir `Verrou`. Par défaut, un verrou propre à ce moteur. */
  verrou?: Verrou
}

export interface MoteurSauvegarde {
  etat(): EtatMoteur
  /** L'abonné reçoit chaque nouvel état. Rend de quoi se désabonner. */
  abonner(abonne: (etat: EtatMoteur) => void): () => void
  /** Demande un passage. Sans effet visible si un passage tourne déjà : il sera rejoué. */
  demander(): void
  /** Résout la fin du passage en cours et de ceux qu'il a retenus. Utile aux tests. */
  inactif(): Promise<void>
  /**
   * « Garde le mien » devant un conflit ou un recul, à la révision montrée à Ugo.
   * Refusé hors de cette décision, ou pour une autre révision que la sienne.
   */
  resoudreConflit(revision: number): Promise<void>
  /**
   * Lire le carnet distant et le comparer au carnet local, **sans rien écrire**.
   * `null` quand il n'y a aucune sauvegarde distante.
   */
  comparer(): Promise<ComparaisonDistante | null>
  /** Remplacer le carnet local par celui qui a été comparé. */
  restaurer(jeton: JetonRestauration): Promise<{ seanceCount: number; targets: Targets }>
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
  const maintenant = dependances.maintenant ?? (() => new Date())
  const verrou = dependances.verrou ?? creerVerrouLocal()
  const abonnes = new Set<(etat: EtatMoteur) => void>()
  let courant: EtatMoteur = { etat: 'deconnecte' }
  let passage: Promise<void> | null = null
  /** La dernière réussite de cette session, si le stockage a refusé de la retenir. */
  let reussiteDeSession: string | undefined
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

  /**
   * Retenir l'instant d'une confirmation distante, et le rendre.
   *
   * Best effort : la sauvegarde a réussi, une date non retenue ne doit pas la faire
   * passer pour un échec.
   */
  async function noterReussite(): Promise<string> {
    const quand = maintenant().toISOString()
    reussiteDeSession = quand
    try {
      await dependances.port.noterReussite(quand)
    } catch {
      // La réussite est réelle, seule sa trace manque.
    }
    return quand
  }

  /**
   * L'état « à jour », avec la date du **dernier envoi confirmé**.
   *
   * « À jour » se constate souvent sans rien envoyer : l'app rouvre, relit le distant,
   * rien n'a bougé. Ce constat n'est pas une sauvegarde, et ne date rien — P2 de Codex
   * sur #89. Seuls `envoye` et `reconstituee` notent une réussite.
   *
   * Une révision `null` — rien jamais confirmé, carnet du dossier de départ — n'a pas de
   * date par construction : seul un envoi confirmé en écrit une.
   */
  async function aJour(revision: number | null): Promise<EtatMoteur> {
    const annonce = await dependances.port.reconstitutionNonLue()
    return {
      etat: 'a-jour',
      revision,
      ...(await depuis()),
      ...(annonce ? { reconstitution: annonce } : {}),
    }
  }

  /** La dernière réussite connue, pour dire depuis quand ça ne va plus. */
  async function depuis(): Promise<{ derniereReussite?: string }> {
    let quand: string | null = null
    try {
      quand = await dependances.port.derniereReussite()
    } catch {
      // Lecture impossible : la réussite de cette session, s'il y en a eu une, suffit.
    }
    // La plus récente des deux : si la trace d'aujourd'hui a été refusée, celle d'hier
    // ne doit pas la remplacer. Les dates ISO se comparent comme des chaînes.
    const plusRecente = [quand, reussiteDeSession].filter(Boolean).toSorted().pop()
    return plusRecente ? { derniereReussite: plusRecente } : {}
  }

  async function enAttente(erreur: string): Promise<void> {
    publier({ etat: 'en-attente', erreur, ...(await depuis()) })
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
      await enAttente(messageDe(cause))
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
            // Une génération vient d'être confirmée : elle est datée tout de suite. Si le
            // cycle suivant échoue, « en attente depuis » doit partir de cet envoi-ci, et
            // non du précédent — P2 du robot Codex sur #89.
            // Un envoi confirmé peut aussi en laisser un autre derrière lui : on continue.
            await noterReussite()
            continue
          case 'a-relire':
            // Le distant a bougé entre la lecture et l'écriture : le cycle suivant relit.
            continue
          case 'decision':
            publier({ etat: 'decision', action: issue.action, ...(await depuis()) })
            return
        }
      } catch (cause) {
        await enAttente(messageDe(cause))
        return
      }
    }
    await enAttente(
      'La sauvegarde distante change sans se stabiliser. Nouvel essai au prochain passage.',
    )
  }

  async function tourner(): Promise<void> {
    try {
      do {
        retenu = false
        await verrou(unPassage)
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

    async comparer() {
      const transport = await dependances.transport()
      if (!transport) throw new Error('Connecte-toi pour comparer avec la sauvegarde.')
      const distant = await transport.lireCarnet()
      if (!distant) return null
      // Le même aperçu qu'un fichier collé : il refuse une version inconnue ou une
      // structure incohérente, et fige les empreintes que la confirmation contrôlera.
      const apercu = await dependances.port.previewImport(distant.fichier)
      return {
        apercu,
        revision: distant.revision,
        jeton: { fichier: distant.fichier, identite: apercu.identite, revision: distant.revision },
      }
    },

    async restaurer(jeton) {
      // Réussie ou refusée, la restauration se termine par un passage : refusée parce que
      // le distant a bougé, l'écran doit apprendre ce qu'il porte désormais.
      try {
        return await verrou(async () => {
          // Sous le verrou, plus aucune fenêtre n'écrit : relire ici dit si le distant est
          // encore celui qui a été comparé. S'il a bougé — un envoi d'une autre fenêtre
          // vient d'arriver, un autre appareil a écrit — restaurer reviendrait à poser sur
          // le téléphone un carnet que le serveur ne porte plus.
          const transport = await dependances.transport()
          if (!transport) throw new Error('Connecte-toi pour restaurer la sauvegarde.')
          const distant = await transport.lire()
          if (distant.etat !== 'lue' || distant.revision !== jeton.revision) {
            throw new StoreError(
              'stale-preview',
              'La sauvegarde a changé depuis la comparaison. Refais la comparaison avant de restaurer.',
            )
          }
          const remplace = await dependances.port.restaurerDistant(
            jeton.fichier,
            jeton.identite,
            jeton.revision,
          )
          // Le téléphone porte maintenant exactement ce que porte le serveur à cette
          // révision : c'est une sauvegarde confirmée, et l'écran peut la dater.
          await noterReussite()
          return remplace
        })
      } finally {
        moteur.demander()
      }
    },

    async resoudreConflit(revision) {
      // « Garde le mien » efface un carnet distant : il ne vaut que pour la décision
      // affichée, et pour la révision qu'elle a montrée. Un écran resté ouvert sur un état
      // dépassé ne doit pas pouvoir trancher à la place de l'état courant.
      const decision = courant.etat === 'decision' ? courant.action : null
      if (
        !decision ||
        (decision.type !== 'conflit' && decision.type !== 'sauvegarde-reculee') ||
        decision.revision !== revision
      ) {
        throw new Error('Ce choix ne correspond plus à l’état de la sauvegarde. Recharge la page.')
      }
      // Pas besoin d'attendre un passage en cours : le magasin sérialise la résolution
      // avec la préparation d'un envoi, et la demande qui suit est rejouée s'il tourne.
      await dependances.port.resoudreConflit(revision)
      moteur.demander()
    },

    async oublierReconstitution() {
      await dependances.port.oublierReconstitution()
      // L'état se republie par un passage, jamais d'ici — P1 de Codex sur #87. Publier
      // depuis l'oubli, c'était décider sur un état lu avant un `await` : un passage qui
      // publiait un conflit entre-temps était recouvert par l'ancien « à jour ». Un
      // passage ne se croise avec aucun autre, et il relit l'annonce après son effacement.
      moteur.demander()
    },
  }
  return moteur
}
