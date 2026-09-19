import { describe, expect, it } from 'vitest'
import {
  acquitter,
  envoiNonResolu,
  envoyer,
  garderLeMien,
  ETAT_INITIAL,
  jamaisSaisi,
  muter,
  operationPour,
  prochaineAction,
  type EtatSauvegarde,
  type LectureDistante,
} from './sauvegarde.ts'

const APPAREIL = 'iphone-15-pro'

const INCONNU: LectureDistante = { etat: 'inconnue' }
const VIDE: LectureDistante = { etat: 'absente' }
const lu = (revision: number, operation: string | null = null): LectureDistante => ({
  etat: 'lue',
  revision,
  operation,
})

/** Un carnet où rien n'est encore parti : n mutations, aucun acquittement. */
function apresMutations(n: number): EtatSauvegarde {
  let courant = ETAT_INITIAL
  for (let i = 0; i < n; i += 1) courant = muter(courant)
  return courant
}

/** Le carnet d'Ugo après quelques séances, toutes envoyées et confirmées. */
function carnetAJour(mutations: number, revision: number): EtatSauvegarde {
  let courant = ETAT_INITIAL
  for (let i = 0; i < mutations; i += 1) courant = muter(courant)
  return mutations === 0 ? courant : acquitter(courant, mutations, revision)
}

/**
 * Invariant de forme, vérifié après chaque transition d'un test : un acquittement ne
 * peut pas dépasser ce qui a été écrit. Le violer produit un état dont aucune décision
 * n'a de sens — et une première version du fichier le construisait dans un test.
 */
function coherent(etat: EtatSauvegarde): EtatSauvegarde {
  expect(etat.generationAcquittee).toBeLessThanOrEqual(etat.generationLocale)
  return etat
}

describe('on ne décide rien avant d’avoir lu le distant', () => {
  it('demande la lecture plutôt que d’envoyer, à la première activation', () => {
    // Le cas qui a coûté un P2 : `null` confondait « pas encore lu » et « rien en
    // face », et l'app décidait d'envoyer sans savoir qu'une sauvegarde existait.
    const local = muter(ETAT_INITIAL)

    expect(prochaineAction(local, INCONNU, APPAREIL)).toEqual({ type: 'lire-distant' })
  })

  it('demande la lecture même quand il n’y a rien à envoyer', () => {
    expect(prochaineAction(ETAT_INITIAL, INCONNU, APPAREIL)).toEqual({ type: 'lire-distant' })
  })

  it('envoie une fois la lecture faite et le distant vide', () => {
    const local = muter(ETAT_INITIAL)

    expect(prochaineAction(local, VIDE, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 1,
      operation: 'iphone-15-pro:1',
    })
  })
})

describe('reconnaître notre propre envoi', () => {
  it('acquitte au lieu de crier au conflit quand la réponse s’est perdue', () => {
    // Le second P2. L'envoi part, le serveur commite, la réponse se perd. Au
    // redémarrage on relit le distant : c'est **notre** opération qui est en face.
    // La traiter en conflit ferait crier au danger là où il n'y a qu'un réseau
    // capricieux — et le vrai conflit, noyé dans les faux, cesserait d'être pris au
    // sérieux.
    const local = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)

    expect(prochaineAction(local, lu(1, operationPour(APPAREIL, 1)), APPAREIL)).toEqual({
      type: 'acquitter-envoi',
      generation: 1,
      revision: 1,
    })
  })

  it('reprend la génération en vol, et non la génération courante', () => {
    // Une mutation a eu lieu pendant la panne : l'opération commitée reste celle de g,
    // pas celle de g+1. Acquitter la courante sauterait g sans l'avoir confirmée.
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)
    const pendantLaPanne = muter(enVol)

    const action = prochaineAction(pendantLaPanne, lu(1, operationPour(APPAREIL, 1)), APPAREIL)

    expect(action).toEqual({ type: 'acquitter-envoi', generation: 1, revision: 1 })
  })

  it('laisse g+1 en attente après avoir acquitté g', () => {
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)
    const pendantLaPanne = muter(enVol)

    const apres = coherent(acquitter(pendantLaPanne, 1, 1))

    expect(prochaineAction(apres, lu(1, operationPour(APPAREIL, 1)), APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 2,
      operation: 'iphone-15-pro:2',
    })
  })

  it('reste un conflit quand l’opération en face vient d’un autre appareil', () => {
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)

    expect(prochaineAction(enVol, lu(4, 'macbook:9'), APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 1,
      revision: 4,
    })
  })
})

describe('un seul envoi en vol à la fois', () => {
  // Le P2-2 rouvert par la seconde contre-revue. Reconnaître notre commit *quand on le
  // voit* ne fermait qu'une moitié de la panne : tant qu'il n'est pas visible, il peut
  // encore être en cours. L'app envoyait alors g+1 et perdait la trace de g.

  it('reprend l’envoi en vol au lieu d’en lancer un plus récent', () => {
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)
    const pendantLaPanne = muter(enVol) // Ugo valide une série de plus

    // La lecture ne voit rien : le commit de g peut très bien se terminer juste après.
    expect(prochaineAction(pendantLaPanne, VIDE, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 1,
      operation: 'iphone-15-pro:1',
    })
  })

  it('reprend aussi quand le distant est resté à la dernière révision acquittée', () => {
    const enVol = envoyer(muter(carnetAJour(2, 5)), 3, APPAREIL)
    const pendantLaPanne = muter(enVol)

    expect(prochaineAction(pendantLaPanne, lu(5), APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 3,
      operation: 'iphone-15-pro:3',
    })
  })

  it('refuse de remplacer la trace d’une opération sans sort connu', () => {
    // Sans ce refus, `iphone:1` disparaissait de l'état. Son commit tardif devenait
    // indiscernable de l'écriture d'un autre appareil — et, plus grave, les deux
    // écritures pouvaient atterrir en face dans le désordre.
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)

    expect(() => envoyer(muter(enVol), 2, APPAREIL)).toThrow(/sort connu/)
  })

  it('laisse réessayer la même génération, qui est la reprise elle-même', () => {
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)

    expect(envoyer(enVol, 1, APPAREIL).envoiEnVol).toEqual({
      generation: 1,
      operation: 'iphone-15-pro:1',
    })
  })

  it('rouvre la voie à g+1 dès que g est acquitté', () => {
    // C'est `acquitter` qui résout l'envoi, et lui seul : l'invariant
    // « un envoi en vol porte toujours plus que la borne acquittée » n'est pas revérifié
    // ailleurs. Une condition qui l'aurait redoublé dans `envoiNonResolu` s'est révélée
    // inatteignable — aucune mutation ne la faisait rougir — et a été retirée.
    const acquitte = coherent(acquitter(envoyer(muter(ETAT_INITIAL), 1, APPAREIL), 1, 1))

    expect(envoiNonResolu(acquitte)).toBeNull()
    expect(() => envoyer(muter(acquitte), 2, APPAREIL)).not.toThrow()
  })

  it('n’empêche pas le conflit quand un autre appareil a vraiment écrit', () => {
    // La reprise ne doit pas devenir un paravent : un distant tiers reste un conflit.
    const enVol = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)

    expect(prochaineAction(muter(enVol), lu(4, 'macbook:9'), APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 2,
      revision: 4,
    })
  })
})

describe('ce qu’il faut faire maintenant', () => {
  it('ne fait rien quand tout ce qui est local est déjà parti', () => {
    const apres = carnetAJour(3, 7)

    expect(prochaineAction(apres, lu(7), APPAREIL)).toEqual({ type: 'rien' })
  })

  it('envoie la génération courante quand elle est en retard', () => {
    const apres = muter(carnetAJour(2, 4))

    expect(prochaineAction(apres, lu(4), APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 3,
      operation: 'iphone-15-pro:3',
    })
  })

  it('n’envoie rien depuis une base seulement amorcée', () => {
    // Le dossier de départ n'est pas une saisie d'Ugo. L'envoyer écraserait une vraie
    // sauvegarde avec des données de démonstration. La protection ne tient pas à un
    // drapeau mais à une règle : **l'amorçage n'est pas une mutation**, donc la
    // génération reste à zéro et rien n'est jamais « en retard ».
    expect(jamaisSaisi(ETAT_INITIAL)).toBe(true)
    expect(prochaineAction(ETAT_INITIAL, VIDE, APPAREIL)).toEqual({ type: 'rien' })
  })

  it('considère le carnet comme saisi dès la première mutation', () => {
    expect(jamaisSaisi(muter(ETAT_INITIAL))).toBe(false)
  })
})

describe('le distant porte quelque chose qu’on n’a pas', () => {
  it('propose la restauration à une installation neuve devant un distant existant', () => {
    // Le scénario exact du passage de Safari à l'app installée.
    expect(prochaineAction(ETAT_INITIAL, lu(12), APPAREIL)).toEqual({
      type: 'proposer-restauration',
      revision: 12,
    })
  })

  it('propose sans jamais appliquer, même sans rien de local à défendre', () => {
    const aJour = carnetAJour(2, 5)

    expect(prochaineAction(aJour, lu(9), APPAREIL)).toEqual({
      type: 'proposer-restauration',
      revision: 9,
    })
  })

  it('appelle conflit quand les deux côtés ont avancé', () => {
    // Local en retard **et** distant au-delà de ce qu'on a acquitté : choisir l'un des
    // deux perdrait l'autre. Seul Ugo peut trancher.
    const lesDeux = muter(carnetAJour(2, 5))

    expect(prochaineAction(lesDeux, lu(9), APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 3,
      revision: 9,
    })
  })

  it('teste le conflit avant l’envoi, et non l’inverse', () => {
    // Si l'ordre s'inversait, on écraserait un distant plus récent en croyant
    // simplement rattraper son retard. C'est la même action « envoyer », et elle
    // détruirait l'état d'en face sans que rien ne proteste.
    const lesDeux = muter(carnetAJour(1, 3))

    expect(prochaineAction(lesDeux, lu(8), APPAREIL).type).not.toBe('envoyer')
  })
})

describe('acquitter sans rien effacer', () => {
  it('garde une mutation écrite pendant l’envoi', () => {
    // Le défaut silencieux : Ugo valide une série, l'envoi part, il valide la suivante,
    // la réponse arrive. Un acquittement qui poserait « tout est parti » ferait
    // disparaître la seconde série au premier effacement de stockage.
    //
    // Le test partait d'un état où `g` était **déjà** acquitté avant la mutation : le
    // retour précoce d'`acquitter` s'y déclenchait, et la règle n'était donc pas
    // exercée. Remarque non bloquante de Codex, fondée. La séquence est maintenant la
    // vraie : quatre mutations dont aucune n'est partie, l'envoi de la quatrième, la
    // cinquième écrite pendant l'attente, puis la réponse.
    const pendantEnvoi = muter(envoyer(apresMutations(4), 4, APPAREIL))

    const apres = coherent(acquitter(pendantEnvoi, 4, 10))

    expect(apres.generationAcquittee).toBe(4)
    expect(apres.generationLocale).toBe(5)
    expect(prochaineAction(apres, lu(10), APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 5,
      operation: 'iphone-15-pro:5',
    })
  })

  it('ne recule pas sur la réponse tardive d’une ancienne tentative', () => {
    const aJour = carnetAJour(6, 14)

    const tardive = coherent(acquitter(aJour, 3, 8))

    expect(tardive).toBe(aJour)
    expect(tardive.generationAcquittee).toBe(6)
  })

  it('ne fait pas reculer la révision distante, quelle que soit la réponse reçue', () => {
    // Une vieille réponse porte une vieille révision. La laisser écraser la plus
    // récente ferait ensuite croire à un conflit là où il n'y en a pas.
    //
    // Le scénario se joue sur un état **valide** : sept mutations écrites, six
    // acquittées à la révision 14, et la réponse tardive de la septième porte une
    // révision plus ancienne. Une version antérieure de ce test acquittait une
    // génération jamais écrite — P3 de Codex, fondé : l'état obtenu était incohérent,
    // et ce qu'on y observait ne prouvait rien d'une séquence réelle.
    //
    // **Ce que ce test garantit, exactement** : une propriété de robustesse d'`acquitter`
    // pris isolément, et non un parcours. Depuis que les envois sont sérialisés, aucune
    // séquence distante ne produit *elle-même* une génération qui avance avec une
    // révision qui recule. La borne reste monotone quoi qu'on lui passe, pour qu'une
    // réponse mal numérotée — par le serveur, ou par un appelant futur — ne puisse pas
    // faire halluciner un conflit à l'app. Seconde remarque non bloquante de Codex.
    const sept = muter(carnetAJour(6, 14))

    const apres = coherent(acquitter(sept, 7, 9))

    expect(apres.generationAcquittee).toBe(7)
    expect(apres.revisionAcquittee).toBe(14)
  })

  it('refuse d’acquitter une génération jamais écrite', () => {
    expect(() => acquitter(carnetAJour(2, 5), 3, 9)).toThrow(/jamais écrite/)
  })

  it('libère l’envoi en vol qu’il confirme, et garde un envoi plus récent', () => {
    const deuxEnVol = envoyer(muter(muter(ETAT_INITIAL)), 2, APPAREIL)

    expect(acquitter(deuxEnVol, 1, 1).envoiEnVol).toEqual({
      generation: 2,
      operation: 'iphone-15-pro:2',
    })
    expect(acquitter(deuxEnVol, 2, 2).envoiEnVol).toBeNull()
  })
})

describe('l’identifiant d’opération', () => {
  it('est stable pour une même génération, pour qu’un réessai soit inoffensif', () => {
    // Tiré au hasard à chaque tentative, il produirait un doublon à la première
    // réponse perdue après commit.
    expect(operationPour(APPAREIL, 12)).toBe(operationPour(APPAREIL, 12))
  })

  it('distingue deux générations, et deux appareils', () => {
    expect(operationPour(APPAREIL, 12)).not.toBe(operationPour(APPAREIL, 13))
    expect(operationPour(APPAREIL, 12)).not.toBe(operationPour('macbook', 12))
  })
})

describe('muter', () => {
  it('avance la génération, ce qui suffit à sortir de l’amorçage', () => {
    const apres = muter(ETAT_INITIAL)

    expect(apres.generationLocale).toBe(1)
    expect(jamaisSaisi(apres)).toBe(false)
  })

  it('ne touche à rien d’autre', () => {
    const avant = carnetAJour(2, 5)
    const apres = muter(avant)

    expect(apres.generationAcquittee).toBe(avant.generationAcquittee)
    expect(apres.revisionAcquittee).toBe(avant.revisionAcquittee)
    expect(apres.envoiEnVol).toBe(avant.envoiEnVol)
  })
})

describe('les séquences complètes', () => {
  it('première séance : lecture, envoi, acquittement', () => {
    let courant = ETAT_INITIAL
    expect(prochaineAction(courant, INCONNU, APPAREIL)).toEqual({ type: 'lire-distant' })
    expect(prochaineAction(courant, VIDE, APPAREIL)).toEqual({ type: 'rien' })

    courant = muter(courant)
    expect(prochaineAction(courant, VIDE, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 1,
      operation: 'iphone-15-pro:1',
    })

    courant = coherent(acquitter(envoyer(courant, 1, APPAREIL), 1, 1))
    expect(prochaineAction(courant, lu(1, 'iphone-15-pro:1'), APPAREIL)).toEqual({ type: 'rien' })
  })

  it('réponse perdue : redémarrage, reconnaissance, acquittement, g+1 en attente', () => {
    // Le parcours complet que la stabilité de `operationPour`, testée seule, ne fermait
    // pas. Il faut reconnaître notre commit en face, pas seulement savoir le renommer.
    let courant = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)
    courant = muter(courant) // Ugo continue pendant la panne

    const face = lu(1, operationPour(APPAREIL, 1))
    expect(prochaineAction(courant, face, APPAREIL)).toEqual({
      type: 'acquitter-envoi',
      generation: 1,
      revision: 1,
    })

    courant = coherent(acquitter(courant, 1, 1))
    expect(prochaineAction(courant, face, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 2,
      operation: 'iphone-15-pro:2',
    })
  })

  it('commit en cours : reprise de g, puis reconnaissance, puis départ de g+1', () => {
    // L'autre moitié de la panne, celle que la première correction laissait ouverte : la
    // lecture arrive **avant** que le commit de g ne soit visible. Le parcours précédent
    // commence après ; celui-ci commence avant.
    let courant = envoyer(muter(ETAT_INITIAL), 1, APPAREIL)
    courant = muter(courant) // Ugo valide une série de plus pendant l'attente

    // 1. Rien en face pour l'instant : on reprend g, on n'envoie surtout pas g+1.
    expect(prochaineAction(courant, VIDE, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 1,
      operation: 'iphone-15-pro:1',
    })
    courant = envoyer(courant, 1, APPAREIL) // la reprise part, même identité

    // 2. Le serveur finit la transaction, la réponse se perd encore. On reconnaît.
    const face = lu(1, operationPour(APPAREIL, 1))
    expect(prochaineAction(courant, face, APPAREIL)).toEqual({
      type: 'acquitter-envoi',
      generation: 1,
      revision: 1,
    })

    // 3. g résolu, g+1 peut enfin partir — et seulement maintenant.
    courant = coherent(acquitter(courant, 1, 1))
    expect(envoiNonResolu(courant)).toBeNull()
    expect(prochaineAction(courant, face, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 2,
      operation: 'iphone-15-pro:2',
    })
  })
})

describe('les bornes d’envoyer', () => {
  // P2 de Codex sur #71. Ce qu'il visait n'était pas le code mais ma justification :
  // j'avais écrit que l'invariant tenait « par construction », alors qu'il ne tenait
  // que tant que l'appelant était correct. Ce n'est pas la même chose, et la différence
  // est exactement ce qui se paie plus tard.

  it('refuse une génération déjà acquittée, et laisse l’état intact', () => {
    // Sa reproduction, rejouée. Sans la borne, la trace recréée ne disparaissait plus :
    // `acquitter` la court-circuite par son retour précoce, donc l'app reprenait pour
    // toujours un envoi déjà arrivé.
    const apres = coherent(acquitter(envoyer(muter(ETAT_INITIAL), 1, APPAREIL), 1, 1))

    expect(() => envoyer(apres, 1, APPAREIL)).toThrow(/déjà acquittée/)
    // L'état n'a pas bougé : rien à faire, et aucune trace en vol.
    expect(prochaineAction(apres, lu(1, operationPour(APPAREIL, 1)), APPAREIL)).toEqual({
      type: 'rien',
    })
    expect(envoiNonResolu(apres)).toBeNull()
  })

  it('refuse une génération jamais écrite', () => {
    expect(() => envoyer(carnetAJour(2, 5), 3, APPAREIL)).toThrow(/jamais écrite/)
  })

  it('laisse passer la génération courante en retard', () => {
    const enRetard = muter(carnetAJour(2, 5))

    expect(envoyer(enRetard, 3, APPAREIL).envoiEnVol).toEqual({
      generation: 3,
      operation: 'iphone-15-pro:3',
    })
  })
})

describe('sortir d’un conflit', () => {
  /** Deux appareils ont écrit, et Ugo continue sa séance sur celui-ci. */
  function enConflit(): EtatSauvegarde {
    return muter(carnetAJour(2, 5))
  }
  const DISTANT_TIERS = lu(9, 'macbook:4')

  it('sans résolution, le conflit ne se lève jamais et plus rien ne part', () => {
    // Le défaut tel qu'Ugo l'aurait vécu, et la raison d'être de `garderLeMien`.
    // Constaté en exécutant le scénario de l'écran de Codex contre ce module.
    let courant = enConflit()
    expect(prochaineAction(courant, DISTANT_TIERS, APPAREIL).type).toBe('conflit')

    // Il quitte l'écran en gardant son carnet : aucune décision n'est enregistrée.
    expect(prochaineAction(courant, DISTANT_TIERS, APPAREIL).type).toBe('conflit')

    // Il valide trois séries de plus. Elles ne partiront pas davantage.
    courant = muter(muter(muter(courant)))
    expect(prochaineAction(courant, DISTANT_TIERS, APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 6,
      revision: 9,
    })
  })

  it('après « garde le mien », l’envoi reprend à la génération courante', () => {
    const resolu = garderLeMien(enConflit(), 9)

    expect(prochaineAction(resolu, DISTANT_TIERS, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 3,
      operation: 'iphone-15-pro:3',
    })
  })

  it('ne touche à aucune génération : rien n’est déclaré parti', () => {
    // La résolution dit « ignore ce qu'il y a en face », jamais « c'est envoyé ».
    const avant = enConflit()
    const apres = coherent(garderLeMien(avant, 9))

    expect(apres.generationLocale).toBe(avant.generationLocale)
    expect(apres.generationAcquittee).toBe(avant.generationAcquittee)
  })

  it('ne fait pas reculer la borne si l’écran montrait une révision plus ancienne', () => {
    const aJour = carnetAJour(2, 14)

    expect(garderLeMien(aJour, 9).revisionAcquittee).toBe(14)
  })

  it('laisse en place un envoi dont le sort reste inconnu', () => {
    // Résoudre un conflit ne résout pas une opération en vol : ce sont deux questions
    // distinctes, et les confondre ferait repartir g+1 avant que g ne soit tranché.
    const enVol = envoyer(muter(carnetAJour(2, 5)), 3, APPAREIL)

    const resolu = garderLeMien(enVol, 9)

    expect(envoiNonResolu(resolu)).toEqual({ generation: 3, operation: 'iphone-15-pro:3' })
    expect(prochaineAction(resolu, DISTANT_TIERS, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 3,
      operation: 'iphone-15-pro:3',
    })
  })

  it('n’empêche pas un conflit ultérieur, sur une révision plus récente', () => {
    // La résolution vaut pour ce qui a été vu, pas pour l'avenir. Un nouvel écart
    // distant redevient un conflit, sinon « garde le mien » serait un interrupteur
    // qui éteint l'alarme pour de bon.
    const resolu = garderLeMien(enConflit(), 9)

    expect(prochaineAction(resolu, lu(12, 'macbook:5'), APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 3,
      revision: 12,
    })
  })
})
