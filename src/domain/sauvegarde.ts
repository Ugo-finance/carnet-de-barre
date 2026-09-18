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
 * Les confondre est le premier piège. Une génération acquittée dit *ce qui est parti*,
 * une révision distante dit *ce que le serveur porte* — et un appareil qui n'a jamais
 * rien envoyé peut très bien trouver une révision distante en avance.
 *
 * ## Deux états qu'une première version confondait
 *
 * Ils ont chacun coûté un P2 à la contre-revue de #71, et les deux produisaient une
 * décision fausse **sans rien signaler** :
 *
 * 1. **« pas encore lu » n'est pas « rien en face ».** Un `null` unique laissait
 *    `prochaineAction` répondre « envoyer » alors qu'aucune lecture distante n'avait eu
 *    lieu. C'est précisément la première activation avec un carnet local, celle où une
 *    sauvegarde existante doit être proposée avant tout envoi.
 * 2. **une révision distante qu'on n'a pas acquittée n'est pas forcément celle d'un
 *    autre appareil.** Elle peut être la nôtre, commitée par une opération dont la
 *    réponse s'est perdue. La traiter en conflit ferait crier au danger là où il n'y a
 *    qu'un réseau capricieux — et le vrai conflit, noyé dans les faux, cesserait d'être
 *    pris au sérieux.
 * 3. **un envoi sans réponse n'est pas un envoi qui n'a pas eu lieu.** Reconnaître notre
 *    commit *une fois qu'on le voit* ne suffisait pas : tant qu'il n'est pas visible, il
 *    peut encore être en cours. Une seconde contre-revue de #71 l'a montré — `g` partait,
 *    Ugo validait une série de plus, la lecture ne voyait rien, et l'app envoyait `g+1`
 *    en écrasant la trace de `g`. Voir « un seul envoi en vol » ci-dessous.
 *
 * ## Un seul envoi en vol à la fois
 *
 * Tant qu'une opération n'a pas de sort connu, **c'est elle qu'on reprend**, sous la même
 * identité, et aucune autre ne part. La règle ferme deux trous d'un coup :
 *
 * - la **fausse alerte** : sans la trace de `g`, son commit tardif devient indiscernable
 *   de l'écriture d'un autre appareil, et l'app crie au conflit sans qu'il y en ait ;
 * - la **perte silencieuse**, plus grave : si `g+1` part pendant que `g` est toujours en
 *   cours, rien n'ordonne les deux écritures en face. `g` commité *après* `g+1` reposerait
 *   un carnet plus ancien par-dessus le plus récent — et l'app afficherait « à jour ».
 *
 * Le prix est connu et assumé : la reprise renvoie l'instantané de `g`, donc un aller-retour
 * de plus avant que `g+1` ne parte. Le magasin doit garder **l'instantané de `g`** pour ce
 * réessai, pas celui de `g+1` sous la même identité.
 */

/**
 * Ce qu'on sait du carnet distant.
 *
 * Trois états, et non deux : l'ignorance a sa propre valeur. Sans elle, ne pas savoir
 * se confond avec savoir qu'il n'y a rien.
 */
export type LectureDistante =
  /** Aucune lecture n'a encore eu lieu. On ne sait pas. */
  | { etat: 'inconnue' }
  /** Lecture réussie : il n'y a rien en face. */
  | { etat: 'absente' }
  /** Lecture réussie : voici la révision, et l'opération qui l'a posée. */
  | { etat: 'lue'; revision: number; operation: string | null }

/** L'envoi parti dont la réponse n'est pas revenue. */
export interface EnvoiEnVol {
  generation: number
  operation: string
}

/** Ce que l'appareil sait de lui-même. */
export interface EtatSauvegarde {
  /** Dernière génération écrite localement. Croît d'une mutation à l'autre. */
  generationLocale: number
  /**
   * Dernière génération dont l'envoi est **confirmé**. `0` quand rien n'est jamais
   * parti. Invariant : jamais supérieure à `generationLocale`.
   */
  generationAcquittee: number
  /**
   * Révision distante correspondant à `generationAcquittee`, ou `null` si rien n'est
   * jamais parti. Sert à distinguer « le distant a avancé à cause de nous » de « le
   * distant a avancé à cause de quelqu'un d'autre ».
   */
  revisionAcquittee: number | null
  /**
   * L'envoi dont on attend encore la réponse, ou `null`.
   *
   * C'est lui qui permet de reconnaître notre propre commit quand la réponse s'est
   * perdue : au redémarrage, une révision distante portant **cette** opération est la
   * nôtre, pas celle d'un autre appareil.
   */
  envoiEnVol: EnvoiEnVol | null
}

export type ActionSauvegarde =
  /** On ne sait pas ce qu'il y a en face. Rien ne se décide avant de l'avoir lu. */
  | { type: 'lire-distant' }
  /** Rien à faire : tout ce qui est local est parti, et le distant n'a pas bougé. */
  | { type: 'rien' }
  /**
   * Envoyer cette génération, sous cet identifiant d'opération idempotent.
   *
   * C'est aussi l'action de **reprise** : quand un envoi est en vol sans réponse, c'est
   * lui qui revient ici, à l'identique. Le réessai est inoffensif parce que l'identité
   * ne bouge pas — le serveur reconnaît l'opération déjà appliquée.
   */
  | { type: 'envoyer'; generation: number; operation: string }
  /**
   * Notre propre envoi a bien été commité : la réponse s'était perdue. On acquitte sans
   * renvoyer, et sans crier au conflit.
   */
  | { type: 'acquitter-envoi'; generation: number; revision: number }
  /**
   * Le distant porte quelque chose que cet appareil n'a pas. On **propose**, on
   * n'applique jamais : écraser une saisie locale non envoyée serait perdre ce qu'on
   * prétend protéger.
   */
  | { type: 'proposer-restauration'; revision: number }
  /**
   * Les deux côtés ont avancé indépendamment. Aucun des deux ne peut être choisi sans
   * qu'Ugo tranche.
   */
  | { type: 'conflit'; generationLocale: number; revision: number }

/**
 * Le carnet ne porte-t-il encore aucune saisie d'Ugo ?
 *
 * **Dérivé, et non stocké.** Une première version portait un drapeau `seulementAmorcee`
 * à côté des compteurs. Il ne servait à rien : `muter` l'effaçait, donc « amorcée »
 * impliquait toujours `generationLocale === 0`, et les deux gardes qui l'invoquaient
 * étaient inatteignables. Une mutation retirant l'un d'eux laissait les seize tests
 * verts — c'est ce qui l'a révélé.
 *
 * La règle est donc posée ici, une fois : **l'amorçage n'est pas une mutation**.
 * Charger le dossier de départ n'appelle pas `muter` et ne fait pas avancer la
 * génération.
 */
export function jamaisSaisi(etat: EtatSauvegarde): boolean {
  return etat.generationLocale === 0
}

/**
 * L'identifiant d'opération : stable pour une génération donnée, sur un appareil donné.
 *
 * C'est lui qui rend un réessai inoffensif. Une réponse perdue après commit distant
 * fait rejouer l'envoi ; le serveur reconnaît l'opération déjà appliquée et n'incrémente
 * pas une seconde fois. Le tirer au hasard à chaque tentative produirait un doublon à la
 * première coupure réseau.
 *
 * Sa stabilité ne suffit pourtant pas à fermer le parcours « réponse perdue après
 * commit » : encore faut-il **reconnaître** notre commit en face plutôt que de le
 * prendre pour celui d'un autre. C'est le rôle d'`envoiEnVol`.
 */
export function operationPour(appareil: string, generation: number): string {
  return `${appareil}:${generation}`
}

/**
 * L'envoi dont le sort est encore inconnu, s'il y en a un.
 *
 * **Une seule ligne, et c'est délibéré.** Une version de cette fonction ajoutait
 * `generation > generationAcquittee`, pour écarter un envoi dont la réponse serait déjà
 * arrivée. La mutation qui retirait cette condition ne faisait rougir personne : c'est
 * `acquitter` qui efface l'envoi qu'il confirme, donc l'invariant
 * `envoiEnVol === null || envoiEnVol.generation > generationAcquittee` **tient par
 * construction**. La condition était une seconde implémentation de la même règle,
 * inatteignable, et une garde inatteignable donne l'illusion de protéger.
 *
 * C'est exactement ce qui avait éliminé le drapeau `seulementAmorcee`. La règle vit là
 * où elle est maintenue — dans `acquitter` — et nulle part ailleurs.
 */
export function envoiNonResolu(etat: EtatSauvegarde): EnvoiEnVol | null {
  return etat.envoiEnVol
}

/**
 * Que faire maintenant.
 *
 * L'ordre des cas n'est pas indifférent :
 *
 * - **l'ignorance passe avant tout.** Décider sans avoir lu le distant, c'est décider au
 *   hasard ;
 * - **reconnaître notre propre envoi passe avant le conflit**, sinon une réponse perdue
 *   déclencherait une alerte pour rien ;
 * - **le conflit passe avant l'envoi**, sinon on écraserait un distant plus récent en
 *   croyant simplement rattraper son retard ;
 * - **la reprise d'un envoi non résolu passe avant tout nouvel envoi**, sinon `g+1`
 *   partirait pendant que `g` est encore en cours, et les deux écritures arriveraient en
 *   face sans ordre garanti.
 */
export function prochaineAction(
  etat: EtatSauvegarde,
  distant: LectureDistante,
  appareil: string,
): ActionSauvegarde {
  if (distant.etat === 'inconnue') return { type: 'lire-distant' }

  const enRetard = etat.generationLocale > etat.generationAcquittee

  if (distant.etat === 'lue') {
    // Notre envoi a bien atterri ; seule la réponse s'est perdue.
    if (etat.envoiEnVol && distant.operation === etat.envoiEnVol.operation) {
      return {
        type: 'acquitter-envoi',
        generation: etat.envoiEnVol.generation,
        revision: distant.revision,
      }
    }

    const distantAAvance =
      etat.revisionAcquittee === null || distant.revision > etat.revisionAcquittee
    if (distantAAvance) {
      // Rien de local à défendre : on propose. C'est le scénario « nouvelle installation
      // avec distant existant », celui du passage de Safari à l'app installée.
      if (!enRetard) return { type: 'proposer-restauration', revision: distant.revision }
      return {
        type: 'conflit',
        generationLocale: etat.generationLocale,
        revision: distant.revision,
      }
    }
  }

  // Un envoi sans réponse se reprend sous sa propre identité. Rien de plus récent ne part
  // tant qu'il n'est pas résolu : voir « un seul envoi en vol » en tête de fichier.
  const enVol = envoiNonResolu(etat)
  if (enVol) {
    return { type: 'envoyer', generation: enVol.generation, operation: enVol.operation }
  }

  if (!enRetard) return { type: 'rien' }

  return {
    type: 'envoyer',
    generation: etat.generationLocale,
    operation: operationPour(appareil, etat.generationLocale),
  }
}

/**
 * Noter qu'un envoi est parti, avant d'en connaître le sort.
 *
 * **Refuse d'écraser un envoi non résolu** par une génération différente. Sans ce refus,
 * la trace de `g` disparaissait au profit de `g+1` : son commit tardif devenait
 * indiscernable de celui d'un autre appareil, et les deux écritures pouvaient atterrir
 * dans le désordre. Un réessai de la **même** génération reste permis — c'est la reprise,
 * et elle est idempotente par construction.
 */
export function envoyer(
  etat: EtatSauvegarde,
  generation: number,
  appareil: string,
): EtatSauvegarde {
  const enVol = envoiNonResolu(etat)
  if (enVol && enVol.generation !== generation) {
    throw new Error(
      `Envoi de la génération ${generation} alors que ${enVol.operation} n'a pas de sort connu.`,
    )
  }
  return {
    ...etat,
    envoiEnVol: { generation, operation: operationPour(appareil, generation) },
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
 * Il ne recule pas non plus : une ancienne tentative dont la réponse arrive en retard ne
 * doit pas défaire un acquittement plus récent, ni faire reculer la révision distante —
 * ce dernier point ferait ensuite croire à un conflit là où il n'y en a pas.
 *
 * **Précondition** : `generation <= etat.generationLocale`. Acquitter une génération
 * jamais écrite n'a pas de sens, et l'invariant `generationAcquittee <= generationLocale`
 * doit tenir après l'appel.
 */
export function acquitter(
  etat: EtatSauvegarde,
  generation: number,
  revision: number,
): EtatSauvegarde {
  if (generation > etat.generationLocale) {
    throw new Error(
      `Acquittement de la génération ${generation}, jamais écrite (locale : ${etat.generationLocale}).`,
    )
  }
  if (generation <= etat.generationAcquittee) return etat

  return {
    ...etat,
    generationAcquittee: generation,
    revisionAcquittee: Math.max(etat.revisionAcquittee ?? 0, revision),
    // L'envoi n'est plus en vol s'il portait cette génération ; un envoi plus récent,
    // lui, reste en attente de sa propre réponse.
    envoiEnVol: etat.envoiEnVol && etat.envoiEnVol.generation > generation ? etat.envoiEnVol : null,
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

/** L'état d'un carnet qui n'a jamais rien envoyé. */
export const ETAT_INITIAL: EtatSauvegarde = {
  generationLocale: 0,
  generationAcquittee: 0,
  revisionAcquittee: null,
  envoiEnVol: null,
}
