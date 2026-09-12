/**
 * Ajustement manuel d'une cible — CB-33.
 *
 * Le moteur décide tout seul, et c'est ce qu'on lui demande. Mais il ne sait pas ce
 * qu'Ugo sait : une charge partie trop haut après trois semaines de coupure, une
 * traction dont la forme s'est dégradée, un changement de salle. L'ajustement manuel
 * est la soupape — le moteur repart de la valeur posée, sans discuter.
 *
 * C'est une action **explicite**. Corriger une séance passée ne touche jamais les
 * cibles (D6) ; seule cette fonction les change à la main.
 */

import { LIFTS } from '../domain/program.ts'
import { roundToStep } from '../domain/progression.ts'
import type { LiftKey, Targets } from '../domain/types.ts'

export interface TargetPatch {
  /** Nouvelle charge visée. Arrondie au pas de 2,5 kg, comme le matériel de la salle. */
  w?: number
  /**
   * Échec en attente. `null` l'efface, ce qui redonne deux essais avant reset.
   *
   * Omettre ce champ en changeant `w` efface aussi l'échec : un échec mémorisé porte
   * sur une charge précise, et il n'a plus de sens une fois la cible déplacée ailleurs.
   */
  fail?: number | null
}

export class TargetAdjustmentError extends Error {}

/**
 * Applique un ajustement. Fonction pure : ni base, ni horloge, ni état global.
 *
 * Refuse une charge absurde plutôt que de l'écrire : une cible négative ou démesurée
 * viendrait d'une faute de frappe, et la corriger après coup demanderait de comprendre
 * d'où vient la valeur.
 */
export function applyTargetPatch(
  targets: Targets,
  lift: LiftKey,
  patch: TargetPatch,
  updatedAt: string,
): Targets {
  const courant = targets[lift]
  const suivant = { ...courant }

  if (patch.w !== undefined) {
    if (!Number.isFinite(patch.w) || patch.w < 0) {
      throw new TargetAdjustmentError('La charge doit être un nombre positif.')
    }
    // Zéro n'a pas le même sens selon l'exercice. Sur un lest (`added`), c'est une
    // cible réelle et courante : revenir aux tractions au poids du corps. Sur une
    // barre, c'est la barre à vide comme objectif — ce n'est pas une progression,
    // c'est une faute de frappe, et `schema.ts` l'accepterait sans rien dire.
    if (patch.w === 0 && LIFTS[lift].loadKind !== 'added') {
      throw new TargetAdjustmentError('Une cible de 0 kg ne veut rien dire pour cet exercice.')
    }
    if (patch.w > 500) {
      throw new TargetAdjustmentError('Cette charge dépasse ce que l’app accepte (500 kg).')
    }
    suivant.w = roundToStep(patch.w)
    // Déplacer la cible périme l'échec mémorisé : il portait sur une autre charge.
    suivant.fail = null
  }

  if (patch.fail !== undefined) {
    // Même raisonnement que pour `w` : un échec à 0 kg de lest est un vrai échec
    // aux tractions au poids du corps, alors qu'il n'a aucun sens sur une barre.
    if (patch.fail !== null) {
      const zeroAdmis = LIFTS[lift].loadKind === 'added'
      if (!Number.isFinite(patch.fail) || patch.fail < 0 || (patch.fail === 0 && !zeroAdmis)) {
        throw new TargetAdjustmentError('La charge en échec doit être un nombre positif.')
      }
    }
    suivant.fail = patch.fail === null ? null : roundToStep(patch.fail)
  }

  if (patch.w === undefined && patch.fail === undefined) return targets

  return { ...targets, [lift]: suivant, updatedAt }
}
