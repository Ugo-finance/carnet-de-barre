import { describe, expect, it } from 'vitest'
import {
  acquitter,
  ETAT_INITIAL,
  jamaisSaisi,
  muter,
  operationPour,
  prochaineAction,
  type EtatSauvegarde,
} from './sauvegarde.ts'

const APPAREIL = 'iphone-15-pro'

function etat(over: Partial<EtatSauvegarde> = {}): EtatSauvegarde {
  return { ...ETAT_INITIAL, ...over }
}

/** Le carnet d'Ugo après quelques séances : des mutations locales, rien de spécial. */
function carnetVivant(mutations: number): EtatSauvegarde {
  let courant = ETAT_INITIAL
  for (let i = 0; i < mutations; i += 1) courant = muter(courant)
  return courant
}

describe('ce qu’il faut faire maintenant', () => {
  it('ne fait rien quand tout ce qui est local est déjà parti', () => {
    const apres = acquitter(carnetVivant(3), 3, 7)

    expect(prochaineAction(apres, APPAREIL)).toEqual({ type: 'rien' })
  })

  it('envoie la génération courante quand elle est en retard', () => {
    const apres = muter(acquitter(carnetVivant(2), 2, 4))

    expect(prochaineAction(apres, APPAREIL)).toEqual({
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
    expect(prochaineAction(ETAT_INITIAL, APPAREIL)).toEqual({ type: 'rien' })
  })

  it('considère le carnet comme saisi dès la première mutation', () => {
    expect(jamaisSaisi(muter(ETAT_INITIAL))).toBe(false)
  })
})

describe('le distant porte quelque chose qu’on n’a pas', () => {
  it('propose la restauration à une installation neuve devant un distant existant', () => {
    // Le scénario exact du passage de Safari à l'app installée : base amorcée d'un
    // côté, carnet complet de l'autre.
    const neuve = etat({ revisionDistante: 12 })

    expect(prochaineAction(neuve, APPAREIL)).toEqual({
      type: 'proposer-restauration',
      revisionDistante: 12,
    })
  })

  it('propose sans jamais appliquer, même sans rien de local à défendre', () => {
    const aJour = acquitter(carnetVivant(2), 2, 5)
    const quelquUnDAutreAEcrit = { ...aJour, revisionDistante: 9 }

    expect(prochaineAction(quelquUnDAutreAEcrit, APPAREIL)).toEqual({
      type: 'proposer-restauration',
      revisionDistante: 9,
    })
  })

  it('appelle conflit quand les deux côtés ont avancé', () => {
    // Local en retard **et** distant au-delà de ce qu'on a acquitté : choisir l'un des
    // deux perdrait l'autre. Seul Ugo peut trancher.
    const aJour = acquitter(carnetVivant(2), 2, 5)
    const lesDeux = muter({ ...aJour, revisionDistante: 9 })

    expect(prochaineAction(lesDeux, APPAREIL)).toEqual({
      type: 'conflit',
      generationLocale: 3,
      revisionDistante: 9,
    })
  })

  it('teste le conflit avant l’envoi, et non l’inverse', () => {
    // Si l'ordre s'inversait, on écraserait un distant plus récent en croyant
    // simplement rattraper son retard. C'est la même action « envoyer », et elle
    // détruirait l'état d'en face sans que rien ne proteste.
    const aJour = acquitter(carnetVivant(1), 1, 3)
    const lesDeux = muter({ ...aJour, revisionDistante: 8 })

    expect(prochaineAction(lesDeux, APPAREIL).type).not.toBe('envoyer')
  })
})

describe('acquitter sans rien effacer', () => {
  it('garde une mutation écrite pendant l’envoi', () => {
    // Le défaut silencieux : Ugo valide une série, l'envoi part, il valide la suivante,
    // la réponse arrive. Un acquittement qui poserait « tout est parti » ferait
    // disparaître la seconde série au premier effacement de stockage.
    const avantEnvoi = carnetVivant(4)
    const pendantEnvoi = muter(avantEnvoi)

    const apres = acquitter(pendantEnvoi, 4, 10)

    expect(apres.generationAcquittee).toBe(4)
    expect(apres.generationLocale).toBe(5)
    expect(prochaineAction(apres, APPAREIL)).toEqual({
      type: 'envoyer',
      generation: 5,
      operation: 'iphone-15-pro:5',
    })
  })

  it('ne recule pas sur la réponse tardive d’une ancienne tentative', () => {
    const aJour = acquitter(carnetVivant(6), 6, 14)

    const tardive = acquitter(aJour, 3, 8)

    expect(tardive).toBe(aJour)
    expect(tardive.generationAcquittee).toBe(6)
  })

  it('n’avance pas la révision distante sur une réponse tardive', () => {
    // Une vieille réponse porte une vieille révision. La laisser écraser la plus
    // récente ferait ensuite croire à un conflit là où il n'y en a pas.
    const aJour = acquitter(carnetVivant(6), 6, 14)

    expect(acquitter(aJour, 7, 9).revisionDistante).toBe(14)
  })

  it('n’invente aucun état au-delà des trois compteurs', () => {
    // Toute information supplémentaire serait une seconde source de vérité, et c'est
    // toujours la copie qui dérive.
    const envoye = acquitter(muter(ETAT_INITIAL), 1, 1)

    expect(Object.keys(envoye).toSorted()).toEqual([
      'generationAcquittee',
      'generationLocale',
      'revisionAcquittee',
      'revisionDistante',
    ])
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
    const avant = acquitter(carnetVivant(2), 2, 5)
    const apres = muter(avant)

    expect(apres.generationAcquittee).toBe(avant.generationAcquittee)
    expect(apres.revisionDistante).toBe(avant.revisionDistante)
    expect(apres.revisionAcquittee).toBe(avant.revisionAcquittee)
  })
})

describe('la séquence complète d’une séance', () => {
  it('part d’une base amorcée et laisse un carnet à jour', () => {
    // Le parcours réel : rien, puis une séance finalisée, puis son envoi confirmé.
    let courant = ETAT_INITIAL
    expect(prochaineAction(courant, APPAREIL)).toEqual({ type: 'rien' })

    courant = muter(courant)
    const aEnvoyer = prochaineAction(courant, APPAREIL)
    expect(aEnvoyer).toEqual({ type: 'envoyer', generation: 1, operation: 'iphone-15-pro:1' })

    courant = acquitter(courant, 1, 1)
    expect(prochaineAction(courant, APPAREIL)).toEqual({ type: 'rien' })
  })
})
