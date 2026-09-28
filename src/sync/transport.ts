/**
 * Le transport de la sauvegarde — CB-79d.
 *
 * Le protocole (`src/domain/sauvegarde.ts`) décide, le magasin (`preparerEnvoi`,
 * `acquitterEnvoi`) se souvient ; ce fichier **fait le voyage** et rapporte ce qu'il a vu.
 * Il ne décide rien : chaque réponse du serveur est traduite en une transition du
 * protocole, et la décision suivante revient au protocole au cycle d'après.
 *
 * ## Deux moitiés, séparées exprès
 *
 * - `synchroniser` orchestre un cycle contre un `Transport` abstrait. Il se teste
 *   entièrement sans réseau, sur un vrai magasin, avec un faux serveur qui perd ses
 *   réponses quand on le lui demande — ce qu'aucun vrai serveur ne fait sur commande.
 * - `transportSupabase` parle au projet distant, et rien d'autre. Il se teste contre la
 *   pile locale, jamais contre le projet d'Ugo.
 *
 * ## Ce que ce fichier ne fait pas
 *
 * Il **n'obtient pas de session**. La connexion par code e-mail est un écran (CB-75a,
 * Codex) ; le transport reçoit un client déjà connecté. Sans session, le serveur refuse
 * explicitement, et ce refus remonte tel quel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CarnetComparable } from '../db/exchange.ts'
import type { SauvegardePort } from '../db/contracts.ts'
import type { ActionSauvegarde, LectureDistante } from '../domain/sauvegarde.ts'
import { SCHEMA_VERSION } from '../domain/schema.ts'

/** Ce que le serveur répond à une écriture. */
export type ResultatEcriture =
  /** Appliquée : la révision est celle que cette écriture a posée. */
  | { motif: 'applique'; revision: number }
  /** Notre opération était déjà appliquée — réponse perdue au tour précédent. */
  | { motif: 'deja-applique'; revision: number }
  /**
   * Refusée : le distant a bougé depuis la révision attendue. `null` quand aucun carnet
   * n'existe en face — ce qui n'est pas la même chose qu'un carnet à révision 0.
   */
  | { motif: 'revision-perimee'; revision: number | null }

export interface EcritureDistante {
  operation: string
  revisionAttendue: number
  appareil: string
  carnet: CarnetComparable
}

/** Le serveur, vu du protocole. */
export interface Transport {
  lire(): Promise<LectureDistante>
  ecrire(ecriture: EcritureDistante): Promise<ResultatEcriture>
}

/** Ce qu'un cycle a produit, pour que l'écran dise la vérité. */
export type IssueCycle =
  /** Rien à faire : tout est parti, le distant n'a pas bougé. */
  | { issue: 'a-jour' }
  /** Un envoi est parti et a été confirmé à cette révision. */
  | { issue: 'envoye'; revision: number }
  /**
   * La sauvegarde distante avait **disparu**, et cet envoi l'a reconstituée en entier —
   * CB-84. Distincte d'`envoye` pour que l'écran puisse le dire : une sauvegarde qui
   * s'évapore sans qu'Ugo le sache est une chose qu'il doit apprendre, même réparée.
   */
  | { issue: 'reconstituee'; revision: number; revisionDisparue: number }
  /** Le distant a bougé entre la lecture et l'écriture. Le cycle suivant tranchera. */
  | { issue: 'a-relire' }
  /** Le protocole demande une décision d'Ugo : restauration proposée ou conflit. */
  | { issue: 'decision'; action: ActionSauvegarde }

/**
 * Un cycle de sauvegarde : lire, décider, envoyer au besoin, acquitter.
 *
 * **Toute erreur réseau remonte telle quelle**, sans rien acquitter. Le magasin garde
 * alors l'envoi en vol et son instantané figé, et le cycle suivant le reprendra sous la
 * même identité. Avaler l'erreur pour afficher « à jour » serait précisément la fausse
 * réussite que le contrat d'écrans interdit.
 */
export async function synchroniser(
  port: SauvegardePort,
  transport: Transport,
  appareil: string,
): Promise<IssueCycle> {
  const distant = await transport.lire()
  const { action, carnet, reconstitution } = await port.preparerEnvoi(appareil, distant)

  switch (action.type) {
    case 'rien':
      return { issue: 'a-jour' }

    case 'acquitter-envoi':
      // Notre commit était déjà en face, la réponse s'était perdue.
      await port.acquitterEnvoi(action.generation, action.revision)
      return { issue: 'envoye', revision: action.revision }

    case 'envoyer': {
      if (!carnet) throw new Error('Envoi décidé sans instantané figé.')
      // La révision attendue est la dernière **acquittée**, et non la dernière lue. C'est
      // elle que le serveur compare sous verrou : si le distant a bougé depuis, il refuse.
      // Après `garderLeMien`, elle vaut la révision montrée à Ugo — c'est le contrôle
      // dont dépendait la résolution d'un conflit.
      const etat = await port.etatSauvegarde()
      const resultat = await transport.ecrire({
        operation: action.operation,
        revisionAttendue: etat.revisionAcquittee ?? 0,
        appareil,
        carnet,
      })
      if (resultat.motif === 'revision-perimee') return { issue: 'a-relire' }
      await port.acquitterEnvoi(action.generation, resultat.revision)
      return reconstitution
        ? {
            issue: 'reconstituee',
            revision: resultat.revision,
            revisionDisparue: reconstitution.revisionDisparue,
          }
        : { issue: 'envoye', revision: resultat.revision }
    }

    case 'sauvegarde-disparue':
      // Le magasin la traite lui-même, dans la transaction qui prépare l'envoi : elle ne
      // devrait jamais arriver jusqu'ici. Si elle arrive, un port ne l'a pas prise en
      // charge, et continuer ferait croire qu'une sauvegarde existe encore.
      throw new Error('Sauvegarde distante disparue, non prise en charge par le magasin.')

    case 'lire-distant':
      // Impossible ici : la lecture vient d'avoir lieu. Si le protocole la redemande,
      // c'est que `lire()` a rendu « inconnue », et le dire vaut mieux que boucler.
      throw new Error('Le distant n’a pas pu être lu.')

    case 'proposer-restauration':
    case 'conflit':
      return { issue: 'decision', action }
  }
}

/** Ce que la table `carnet` rend à la lecture. */
interface LigneCarnet {
  revision: number
  derniere_operation: string | null
}

/**
 * Le transport réel, sur un client **déjà connecté**.
 *
 * Les règles de ligne du schéma ne laissent voir au client que son propre carnet : la
 * lecture n'a donc pas à filtrer par utilisateur, et ne le fait pas — un filtre ici
 * laisserait croire que la protection est dans le client, alors qu'elle est en face.
 */
export function transportSupabase(client: SupabaseClient): Transport {
  return {
    async lire() {
      const { data, error } = await client
        .from('carnet')
        .select('revision, derniere_operation')
        .maybeSingle<LigneCarnet>()
      if (error) throw new Error(`Lecture du carnet distant impossible : ${error.message}`)
      if (!data) return { etat: 'absente' }
      return { etat: 'lue', revision: data.revision, operation: data.derniere_operation }
    },

    async ecrire({ operation, revisionAttendue, appareil, carnet }) {
      const { data, error } = await client.rpc('appliquer_sauvegarde', {
        p_operation: operation,
        p_revision_attendue: revisionAttendue,
        p_schema_version: SCHEMA_VERSION,
        p_appareil: appareil,
        p_seances: carnet.seances,
        p_cibles: carnet.targets,
      })
      if (error) throw new Error(`Sauvegarde refusée par le serveur : ${error.message}`)
      return lireResultat(data)
    },
  }
}

/**
 * Valide la réponse de la fonction distante au lieu de la croire.
 *
 * Un motif inconnu ou une révision absente là où il en faut une lèvent : acquitter sur
 * une réponse qu'on ne comprend pas ferait dire « sauvegardé » à l'écran sans que rien ne
 * le prouve.
 */
export function lireResultat(brut: unknown): ResultatEcriture {
  if (typeof brut !== 'object' || brut === null) {
    throw new Error('Réponse du serveur illisible.')
  }
  const { motif, revision } = brut as { motif?: unknown; revision?: unknown }
  if (motif === 'applique' || motif === 'deja-applique') {
    if (typeof revision !== 'number') throw new Error(`Réponse « ${motif} » sans révision.`)
    return { motif, revision }
  }
  if (motif === 'revision-perimee') {
    if (revision !== null && typeof revision !== 'number') {
      throw new Error('Réponse « revision-perimee » à la révision illisible.')
    }
    return { motif, revision }
  }
  throw new Error(`Motif de réponse inconnu : ${String(motif)}.`)
}
