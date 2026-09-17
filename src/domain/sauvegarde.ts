/**
 * Protocole de sauvegarde — CB-78, première pièce de CB-75.
 *
 * Module **pur** : il ne connaît ni réseau, ni Supabase, ni IndexedDB. Il répond à une
 * seule question, et c'est celle où une sauvegarde se perd — *que faut-il faire
 * maintenant, compte tenu de ce qu'on a écrit, de ce qui est parti, et de ce qu'on voit
 * en face ?*
 *
 * Le fournisseur est décidé (Supabase, arbitrage d'Ugo du 17.09) mais ne change rien
 * ici : ce fichier doit rester vrai si on en change un jour. Voir
 * `docs/refonte/21-synchronisation.md` § 4 et § 5.
 *
 * ## Les deux compteurs, et pourquoi il en faut deux
 *
 * - **la génération locale** compte les mutations du carnet sur cet appareil. Elle
 *   avance dans la même transaction IndexedDB que la donnée qu'elle couvre — c'est ce
 *   qui interdit qu'« enregistré » et « partira » divergent ;
 * - **la révision distante** est celle du carnet tel qu'il est stocké en face.
 *
 * Les confondre est le piège central. Une génération acquittée dit *ce qui est parti*,
 * une révision distante dit *ce que le serveur porte* — et un appareil qui n'a jamais
 * rien envoyé peut très bien trouver une révision distante en avance.
 */

/** Ce que l'appareil sait de lui-même et de ce qu'il voit en face. */
export interface EtatSauvegarde {
  /** Dernière génération écrite localement. Croît d'une mutation à l'autre. */
  generationLocale: number
  /**
   * Dernière génération dont l'envoi est **confirmé**. `0` quand rien n'est jamais
   * parti — y compris sur une base seulement amorcée.
   */
  generationAcquittee: number
  /**
   * Révision du carnet distant à la dernière lecture, ou `null` si le distant est vide
   * ou n'a pas encore été lu.
   */
  revisionDistante: number | null
  /**
   * Révision distante correspondant à `generationAcquittee`, ou `null` si rien n'est
   * jamais parti. Sert à distinguer « le distant a avancé à cause de nous » de « le
   * distant a avancé à cause de quelqu'un d'autre ».
   */
  revisionAcquittee: number | null
}

/**
 * Le carnet ne porte-t-il encore aucune saisie d'Ugo ?
 *
 * **Dérivé, et non stocké.** Une première version portait un drapeau
 * `seulementAmorcee` à côté des compteurs. Il ne servait à rien : `muter` l'effaçait,
 * donc « amorcée » impliquait toujours `generationLocale === 0`, et les deux gardes qui
 * l'invoquaient étaient inatteignables. Une mutation retirant l'un d'eux laissait les
 * seize tests verts — c'est ce qui l'a révélé.
 *
 * Un drapeau qui double une information déjà portée par un compteur est une seconde
 * source de vérité, et c'est toujours la copie qui dérive. La règle est donc posée ici,
 * une fois : **l'amorçage n'est pas une mutation**. Charger le dossier de départ
 * n'appelle pas `muter` et ne fait pas avancer la génération.
 */
export function jamaisSaisi(etat: EtatSauvegarde): boolean {
  return etat.generationLocale === 0
}

export type ActionSauvegarde =
  /** Rien à faire : tout ce qui est local est parti, et le distant n'a pas bougé. */
  | { type: 'rien' }
  /** Envoyer cette génération, sous cet identifiant d'opération idempotent. */
  | { type: 'envoyer'; generation: number; operation: string }
  /**
   * Le distant porte quelque chose que cet appareil n'a pas. On **propose**, on
   * n'applique jamais : écraser une saisie locale non envoyée serait perdre ce qu'on
   * prétend protéger.
   */
  | { type: 'proposer-restauration'; revisionDistante: number }
  /**
   * Les deux côtés ont avancé indépendamment. Aucun des deux ne peut être choisi sans
   * qu'Ugo tranche.
   */
  | { type: 'conflit'; generationLocale: number; revisionDistante: number }

/**
 * L'identifiant d'opération : stable pour une génération donnée, sur un appareil donné.
 *
 * C'est lui qui rend un réessai inoffensif. Une réponse perdue après commit distant
 * fait rejouer l'envoi ; le serveur reconnaît l'opération déjà appliquée et n'incrémente
 * pas une seconde fois. Le tirer au hasard à chaque tentative, au contraire, produirait
 * un doublon à la première coupure réseau.
 */
export function operationPour(appareil: string, generation: number): string {
  return `${appareil}:${generation}`
}

/**
 * Que faire maintenant.
 *
 * L'ordre des cas n'est pas indifférent : le conflit se teste **avant** l'envoi, sinon
 * on écraserait un distant plus récent en croyant simplement rattraper son retard.
 */
export function prochaineAction(etat: EtatSauvegarde, appareil: string): ActionSauvegarde {
  const enRetard = etat.generationLocale > etat.generationAcquittee
  const distantInconnu = etat.revisionDistante !== null && etat.revisionAcquittee === null
  const distantAAvance =
    etat.revisionDistante !== null &&
    etat.revisionAcquittee !== null &&
    etat.revisionDistante > etat.revisionAcquittee

  // Le distant porte un état qu'on n'a pas produit.
  if (distantInconnu || distantAAvance) {
    // Rien de local à défendre : on propose. C'est le scénario « nouvelle installation
    // avec distant existant », celui du passage de Safari à l'app installée — la base
    // n'y porte que le dossier de départ, qui n'est pas une saisie d'Ugo.
    if (!enRetard) {
      return { type: 'proposer-restauration', revisionDistante: etat.revisionDistante! }
    }
    return {
      type: 'conflit',
      generationLocale: etat.generationLocale,
      revisionDistante: etat.revisionDistante!,
    }
  }

  if (!enRetard) return { type: 'rien' }

  return {
    type: 'envoyer',
    generation: etat.generationLocale,
    operation: operationPour(appareil, etat.generationLocale),
  }
}

/**
 * Prendre acte d'un envoi confirmé.
 *
 * **La règle qui fait tout le fichier** : acquitter la génération `g` ne doit jamais
 * effacer une génération `g+1` écrite *pendant* l'envoi. Ugo valide une série, l'envoi
 * part, il valide la suivante, la réponse arrive — si l'acquittement écrivait
 * « tout est parti », la seconde série ne repartirait jamais et disparaîtrait au
 * premier effacement de stockage. P3 de Codex sur #68, et le défaut est silencieux :
 * rien ne le signale, l'app affiche « à jour » et elle a tort.
 *
 * L'acquittement ne fait donc qu'**avancer une borne**, jamais poser un état final.
 *
 * Il ne recule pas non plus : une ancienne tentative dont la réponse arrive en retard
 * ne doit pas défaire un acquittement plus récent. C'est le même `max`, dans l'autre
 * sens.
 */
export function acquitter(
  etat: EtatSauvegarde,
  generation: number,
  revisionDistante: number,
): EtatSauvegarde {
  if (generation <= etat.generationAcquittee) return etat

  return {
    ...etat,
    generationAcquittee: generation,
    revisionDistante: Math.max(etat.revisionDistante ?? 0, revisionDistante),
    revisionAcquittee: Math.max(etat.revisionAcquittee ?? 0, revisionDistante),
  }
}

/**
 * Enregistrer une mutation locale.
 *
 * Appelée **dans la transaction** qui écrit la séance, la correction ou la suppression.
 * Hors transaction, la génération pourrait avancer sans sa donnée, ou l'inverse.
 */
export function muter(etat: EtatSauvegarde): EtatSauvegarde {
  return { ...etat, generationLocale: etat.generationLocale + 1 }
}

/** L'état d'un carnet qui n'a jamais rien envoyé ni rien vu en face. */
export const ETAT_INITIAL: EtatSauvegarde = {
  generationLocale: 0,
  generationAcquittee: 0,
  revisionDistante: null,
  revisionAcquittee: null,
}
