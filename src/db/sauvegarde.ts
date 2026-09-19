/**
 * La sauvegarde, rendue durable — CB-79b, partie locale.
 *
 * `src/domain/sauvegarde.ts` décide ; ce fichier lui donne une mémoire qui survit à la
 * fermeture de l'onglet. Toujours aucun réseau : le transport et Supabase viennent après.
 *
 * ## Pourquoi l'état vit dans `meta`, et pas ailleurs
 *
 * Il doit être écrit **dans la même transaction** que la donnée qu'il couvre. `meta` est
 * déjà verrouillée par la plupart des écritures du carnet, et un effacement volontaire de
 * l'historique ne la touche pas — la même raison qui y fait vivre le marqueur d'amorçage.
 *
 * ## Ce que « la même transaction » évite
 *
 * Deux écritures séparées laissent exister un instant où la séance est enregistrée et la
 * génération ne l'est pas. Un plantage là — iOS tue un onglet en arrière-plan sans
 * prévenir — et la séance existe sans jamais devoir partir. Elle ne serait pas
 * sauvegardée, et **rien ne le signalerait** : l'app afficherait « à jour ».
 *
 * L'inverse, génération avancée sans sa donnée, coûte seulement un envoi inutile. Les
 * deux sont évitables ensemble, et pour le même prix.
 */

import type { EtatSauvegarde } from '../domain/sauvegarde.ts'
import { ETAT_INITIAL, muter } from '../domain/sauvegarde.ts'
import type { CarnetComparable } from './exchange.ts'

export const SAUVEGARDE_KEY = 'sauvegarde'

/**
 * L'instantané figé d'une génération partie, gardé tant que son sort est inconnu.
 *
 * Contrainte nommée par Codex sur #71, et elle découle de la sérialisation : un réessai
 * porte la **même** identité d'opération, donc il doit porter le même contenu. Renvoyer
 * le carnet d'aujourd'hui sous l'identité d'hier ferait diverger ce que le serveur a
 * enregistré de ce que nous croyons lui avoir envoyé.
 *
 * Le carnet pèse 5 Ko. Le figer coûte moins que le raisonnement qu'il évite.
 */
export interface InstantaneEnVol {
  generation: number
  carnet: CarnetComparable
}

export interface LigneSauvegarde {
  etat: EtatSauvegarde
  instantane: InstantaneEnVol | null
}

export const SAUVEGARDE_INITIALE: LigneSauvegarde = { etat: ETAT_INITIAL, instantane: null }

/**
 * Relit la ligne stockée, ou rend l'état de départ.
 *
 * Une base d'avant ce lot n'a pas cette clé. Elle repart donc de zéro, ce qui est
 * exactement juste : rien n'est jamais parti, et la première décision du protocole sera
 * de lire le distant avant d'écrire quoi que ce soit.
 */
export function lireSauvegarde(valeur: unknown): LigneSauvegarde {
  if (!estLigne(valeur)) return SAUVEGARDE_INITIALE
  return valeur
}

function estLigne(valeur: unknown): valeur is LigneSauvegarde {
  if (typeof valeur !== 'object' || valeur === null) return false
  const candidat = valeur as Partial<LigneSauvegarde>
  const etat = candidat.etat
  if (typeof etat !== 'object' || etat === null) return false
  return (
    typeof etat.generationLocale === 'number' &&
    typeof etat.generationAcquittee === 'number' &&
    (etat.revisionAcquittee === null || typeof etat.revisionAcquittee === 'number')
  )
}

/**
 * Enregistre qu'une mutation du carnet a eu lieu.
 *
 * **Le carnet, pas le brouillon.** Ce lot sauvegarde les séances finalisées et les
 * cibles ; une série en cours de saisie reste sur le téléphone. Faire avancer la
 * génération à chaque frappe enverrait des dizaines de fois la même séance et ne
 * protégerait rien de plus.
 */
export function noterMutation(ligne: LigneSauvegarde): LigneSauvegarde {
  return { ...ligne, etat: muter(ligne.etat) }
}
