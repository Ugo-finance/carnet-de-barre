import { describe, expect, it } from 'vitest'
import {
  STALL_SESSIONS,
  planAccessory,
  planLinkedAccessories,
  type AccessoryPerformance,
  type AccessoryPlan,
} from './accessory.ts'
import { findExercise } from './program.ts'
import type { ExerciseDef } from './program.ts'

/** Le développé incliné : haltères, 3×8–12, retour au bas après un saut. */
const DI = findExercise('c-di') as ExerciseDef
/** Les dips lestés : disques, 3×8–10, **sans** retour au bas — la règle d'Ugo. */
const DIPS = findExercise('a-dips') as ExerciseDef
/** Les tractions lestées de la séance A, mêmes règles que les dips. */
const TRACTIONS = findExercise('a-tractions-lestees') as ExerciseDef

function seance(
  date: string,
  weight: number | null,
  ...reps: (number | null)[]
): AccessoryPerformance {
  return { date, weight, reps }
}

describe('sans historique', () => {
  it('propose la charge de départ de la table', () => {
    const plan = planAccessory(DI, [])
    expect(plan).toMatchObject({ weight: 24, outcome: 'depart' })
    expect(plan.reps).toEqual([8, 8, 8])
  })

  it('propose aussi la charge de départ si rien n’a été noté', () => {
    expect(planAccessory(DI, [seance('2026-09-20', null, null, null, null)]).outcome).toBe('depart')
  })
})

describe('la règle de montée', () => {
  it('monte d’un pas quand toutes les séries atteignent le haut', () => {
    // Le cas du coach, mot pour mot : 24 kg en 3×12 → 26 kg en 3×8.
    const plan = planAccessory(DI, [seance('2026-09-20', 24, 12, 12, 12)])

    expect(plan).toMatchObject({ weight: 26, outcome: 'monte' })
    expect(plan.reps).toEqual([8, 8, 8])
  })

  it('ne monte pas si une seule série reste sous le haut', () => {
    // 12/12/11 n'est pas 3×12. Monter ici ferait grimper la charge sur une série
    // qu'Ugo n'a pas faite, et c'est précisément ce que la double progression évite.
    const plan = planAccessory(DI, [seance('2026-09-20', 24, 12, 12, 11)])
    expect(plan).toMatchObject({ weight: 24, outcome: 'maintien' })
  })

  it('ne monte jamais sur une série non notée', () => {
    // Une répétition absente n'est pas une répétition réussie. Le 12.09, Ugo a laissé
    // une série de tractions sans nombre : faire monter une charge là-dessus
    // inventerait une performance.
    const plan = planAccessory(DI, [seance('2026-09-20', 24, 12, 12, null)])
    expect(plan.outcome).toBe('maintien')
  })

  it('garde le haut de la fourchette pour les dips et les tractions', () => {
    // Décision d'Ugo : « 2,5 sans retour plus bas ». Le pas vient de `added`.
    expect(planAccessory(DIPS, [seance('2026-09-20', 10, 10, 10, 10)])).toMatchObject({
      weight: 12.5,
      outcome: 'monte',
    })
    expect(planAccessory(DIPS, [seance('2026-09-20', 10, 10, 10, 10)]).reps).toEqual([10, 10, 10])
    expect(planAccessory(TRACTIONS, [seance('2026-09-20', 10, 10, 10, 10)]).reps).toEqual([
      10, 10, 10,
    ])
  })

  it('applique le pas du matériel, pas un pas universel', () => {
    // Haltères 2 kg, disques 2,5 kg : la même règle donne deux sauts différents.
    expect(planAccessory(DI, [seance('2026-09-20', 24, 12, 12, 12)]).weight).toBe(26)
    expect(planAccessory(DIPS, [seance('2026-09-20', 10, 10, 10, 10)]).weight).toBe(12.5)
  })
})

describe('entre deux montées', () => {
  it('repropose la charge et ce qu’Ugo a réellement fait, série par série', () => {
    // Le fil de sa propre progression : il doit voir 10/9/8 pour savoir quoi battre.
    // Pré-remplir 8/8/8 lui ferait refaire la séance d'avant sans le savoir.
    const plan = planAccessory(DI, [seance('2026-09-20', 24, 10, 9, 8)])

    expect(plan).toMatchObject({ weight: 24, outcome: 'maintien' })
    expect(plan.reps).toEqual([10, 9, 8])
  })

  it('remplace une série non notée par le bas de la fourchette', () => {
    expect(planAccessory(DI, [seance('2026-09-20', 24, 10, null, 8)]).reps).toEqual([10, 8, 8])
  })

  it('suit la progression complète décrite par le coach', () => {
    // 8/8/8 → 10/9/8 → 12/12/12 → 26 kg. Chaque étape est calculée à partir de la
    // précédente, comme l'app le fera séance après séance.
    const etape1 = planAccessory(DI, [seance('2026-09-06', 24, 8, 8, 8)])
    expect(etape1).toMatchObject({ weight: 24, outcome: 'maintien' })

    const etape2 = planAccessory(DI, [
      seance('2026-09-13', 24, 10, 9, 8),
      seance('2026-09-06', 24, 8, 8, 8),
    ])
    expect(etape2).toMatchObject({ weight: 24, outcome: 'maintien' })
    expect(etape2.reps).toEqual([10, 9, 8])

    const etape3 = planAccessory(DI, [
      seance('2026-09-20', 24, 12, 12, 12),
      seance('2026-09-13', 24, 10, 9, 8),
      seance('2026-09-06', 24, 8, 8, 8),
    ])
    expect(etape3).toMatchObject({ weight: 26, outcome: 'monte' })
    expect(etape3.reps).toEqual([8, 8, 8])
  })
})

describe('la règle de blocage', () => {
  it('redescend d’un cran après trois séances sans rien gagner', () => {
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
      seance('2026-09-06', 24, 8, 8, 8),
    ])

    expect(plan).toMatchObject({ weight: 22, outcome: 'blocage' })
    expect(plan.reps).toEqual([8, 8, 8])
  })

  it('ne bloque pas si une seule répétition a été gagnée quelque part', () => {
    // 8/8/8 → 9/8/8 : un total supérieur suffit à prouver que la charge n'est pas
    // un mur. Bloquer ici ferait redescendre Ugo alors qu'il progresse.
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 9, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
      seance('2026-09-06', 24, 8, 8, 8),
    ])
    expect(plan.outcome).toBe('maintien')
  })

  it('ne bloque pas avant trois séances à la même charge', () => {
    const deux = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
    ])
    expect(deux.outcome).toBe('maintien')
  })

  it('ne compte que les séances faites à cette charge', () => {
    // Deux séances à 24 et une à 22 : le mur de 24 n'a pas encore été frappé trois fois.
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
      seance('2026-09-06', 22, 8, 8, 8),
    ])
    expect(plan.outcome).toBe('maintien')
  })

  it('ne descend jamais sous zéro', () => {
    // Un lest négatif n'existe pas. Sur une charge déjà minimale, rester vaut mieux
    // que proposer une absurdité.
    const plan = planAccessory(DIPS, [
      seance('2026-09-20', 0, 8, 8, 8),
      seance('2026-09-13', 0, 8, 8, 8),
      seance('2026-09-06', 0, 8, 8, 8),
    ])
    expect(plan.weight).toBe(0)
  })

  it('exige exactement trois séances, ni deux ni quatre', () => {
    // Le seuil est une constante nommée : si elle bouge, ce test doit bouger avec, et
    // pas silencieusement suivre l'implémentation.
    expect(STALL_SESSIONS).toBe(3)
  })
})

describe('les trois trous que mes scénarios ne pouvaient pas voir', () => {
  // Trois P1 de Codex sur la première tête. Mes dix-sept tests partaient tous d'un
  // historique **complet, bien formé et monotone** — le cas auquel je pensais. Aucun
  // ne décrivait une séance écourtée, une répétition non notée, ni un retour sur une
  // charge après l'avoir allégée. Le code était défendable, les scénarios étaient
  // creux, et c'est la troisième fois de la journée que le défaut est là et pas
  // ailleurs.

  it('une séance écourtée ne fait pas monter la charge', () => {
    // Ugo valide une série sur trois puis termine la séance. `[12]` n'est pas `3×12`.
    const plan = planAccessory(DI, [seance('2026-09-20', 24, 12)])
    expect(plan).toMatchObject({ weight: 24, outcome: 'maintien' })
  })

  it('et ne rétrécit jamais la séance suivante', () => {
    // Le pire des deux effets : le nombre de séries venait de l'historique, donc une
    // séance écourtée une fois l'aurait été **pour toujours**.
    expect(planAccessory(DI, [seance('2026-09-20', 24, 12)]).reps).toHaveLength(3)
    expect(planAccessory(DI, [seance('2026-09-20', 24, 8, 8)]).reps).toHaveLength(3)
  })

  it('une répétition non notée ne prouve aucun blocage', () => {
    // Règle dure du projet, déjà tenue par le moteur des cinq mouvements suivis : une
    // valeur inconnue n'est jamais un échec. Ugo a peut-être fait sa troisième série
    // sans la noter — lui baisser la charge pour ça serait la punir d'une saisie.
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, null),
      seance('2026-09-13', 24, 8, 8, null),
      seance('2026-09-06', 24, 8, 8, null),
    ])
    expect(plan).toMatchObject({ weight: 24, outcome: 'maintien' })
  })

  it('ne bloque que sur des séances consécutives à la même charge', () => {
    // 24, puis allègement à 22, puis deux anciens passages à 24. Agréger sans regarder
    // la suite faisait redescendre Ugo au moment précis où il revenait sur la charge.
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, 8),
      seance('2026-09-13', 22, 8, 8, 8),
      seance('2026-09-06', 24, 8, 8, 8),
      seance('2026-08-30', 24, 8, 8, 8),
    ])
    expect(plan).toMatchObject({ weight: 24, outcome: 'maintien' })
  })

  it('bloque toujours sur trois séances vraiment consécutives', () => {
    // Le pendant du test précédent : la correction ne doit pas avoir désarmé la règle.
    const plan = planAccessory(DI, [
      seance('2026-09-20', 24, 8, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
      seance('2026-09-06', 24, 8, 8, 8),
      seance('2026-08-30', 22, 8, 8, 8),
    ])
    expect(plan).toMatchObject({ weight: 22, outcome: 'blocage' })
  })
})

describe('une charge non notée n’efface pas la charge connue', () => {
  // Cinquième P1 de Codex, même famille que les quatre autres : l'inconnue traitée
  // comme une information. Ugo oublie de noter le poids une fois, et l'app repartait
  // de la charge de départ — 26 kg durement gagnés redevenaient 24.

  it('ignore la séance sans poids et garde la dernière charge connue', () => {
    const plan = planAccessory(DI, [
      seance('2026-09-27', null, 10, 9, 8),
      seance('2026-09-20', 26, 10, 9, 8),
    ])

    expect(plan).toMatchObject({ weight: 26, outcome: 'maintien' })
  })

  it('ne laisse pas une séance sans poids interrompre un blocage', () => {
    // Trois séances stériles à 24, avec un poids non noté glissé au milieu. La séance
    // invisible ne doit ni compter ni couper la suite.
    const plan = planAccessory(DI, [
      seance('2026-09-27', 24, 8, 8, 8),
      seance('2026-09-20', null, 8, 8, 8),
      seance('2026-09-13', 24, 8, 8, 8),
      seance('2026-09-06', 24, 8, 8, 8),
    ])

    expect(plan).toMatchObject({ weight: 22, outcome: 'blocage' })
  })

  it('n’aligne pas le groupe vers le bas à cause d’un poids oublié', () => {
    const plans = planLinkedAccessories([
      {
        exercise: DIPS,
        history: [seance('2026-09-27', null, 8, 8, 8), seance('2026-09-20', 12.5, 8, 8, 8)],
      },
      { exercise: TRACTIONS, history: [seance('2026-09-20', 12.5, 8, 8, 8)] },
    ])

    expect(plans.get('a-dips')?.weight).toBe(12.5)
    expect(plans.get('a-tractions-lestees')?.weight).toBe(12.5)
  })
})

describe('un exercice sans fourchette', () => {
  it('ne décide rien plutôt que d’inventer un seuil', () => {
    // Les tractions lestées de la séance A n'avaient pas de fourchette avant CB-45 :
    // il n'existait aucun « haut » à atteindre. Ce cas doit rendre la charge de départ
    // sans rien déclencher, pas se rabattre sur une valeur choisie au jugé.
    const sansFourchette: ExerciseDef = { ...DI, repsRange: undefined, reps: 8 }
    const plan = planAccessory(sansFourchette, [seance('2026-09-20', 24, 12, 12, 12)])

    expect(plan).toMatchObject({ weight: 24, outcome: 'depart' })
    expect(plan.reps).toEqual([8, 8, 8])
  })
})

describe('charge commune aux dips et aux tractions', () => {
  // Décision d'Ugo du 13.09.2026 : « charge commune, montée quand les deux passent ».
  // Il enchaîne les deux avec les mêmes disques ; deux suggestions divergentes
  // l'obligeraient à recharger la ceinture au milieu du superset.
  const groupe = (
    dips: AccessoryPerformance[],
    tractions: AccessoryPerformance[],
  ): Map<string, AccessoryPlan> =>
    planLinkedAccessories([
      { exercise: DIPS, history: dips },
      { exercise: TRACTIONS, history: tractions },
    ])

  it('monte les deux quand les deux atteignent le haut', () => {
    const plans = groupe(
      [seance('2026-09-20', 10, 10, 10, 10)],
      [seance('2026-09-20', 10, 10, 10, 10)],
    )

    expect(plans.get('a-dips')).toMatchObject({ weight: 12.5, outcome: 'monte' })
    expect(plans.get('a-tractions-lestees')).toMatchObject({ weight: 12.5, outcome: 'monte' })
  })

  it('ne monte aucun des deux si un seul a passé', () => {
    // Le cœur de l'arbitrage : les dips ont mérité 12,5 kg, les tractions non. Monter
    // imposerait aux tractions une charge qu'Ugo n'a pas tenue.
    const plans = groupe(
      [seance('2026-09-20', 10, 10, 10, 10)],
      [seance('2026-09-20', 10, 9, 9, 8)],
    )

    expect(plans.get('a-dips')).toMatchObject({ weight: 10, outcome: 'maintien' })
    expect(plans.get('a-tractions-lestees')).toMatchObject({ weight: 10, outcome: 'maintien' })
  })

  it('garde des répétitions propres à chaque exercice', () => {
    // La charge est commune, l'effort ne l'est pas : il doit voir 10/10/10 aux dips et
    // 9/9/8 aux tractions, sinon il perd le fil de ce qu'il a à battre sur chacun.
    const plans = groupe(
      [seance('2026-09-20', 10, 10, 10, 10)],
      [seance('2026-09-20', 10, 9, 9, 8)],
    )

    expect(plans.get('a-dips')?.reps).toEqual([10, 10, 10])
    expect(plans.get('a-tractions-lestees')?.reps).toEqual([9, 9, 8])
  })

  it('ne redescend que si les deux sont bloqués', () => {
    const bloque = [
      seance('2026-09-20', 10, 8, 8, 8),
      seance('2026-09-13', 10, 8, 8, 8),
      seance('2026-09-06', 10, 8, 8, 8),
    ]
    const progresse = [
      seance('2026-09-20', 10, 9, 8, 8),
      seance('2026-09-13', 10, 8, 8, 8),
      seance('2026-09-06', 10, 8, 8, 8),
    ]

    expect(groupe(bloque, progresse).get('a-dips')).toMatchObject({ outcome: 'maintien' })
    expect(groupe(bloque, bloque).get('a-dips')).toMatchObject({ weight: 7.5, outcome: 'blocage' })
    expect(groupe(bloque, bloque).get('a-tractions-lestees')?.weight).toBe(7.5)
  })

  it('réaligne vers le bas deux charges qui auraient divergé', () => {
    // Ne jamais proposer une charge qu'Ugo n'a pas tenue sur les deux mouvements.
    const plans = groupe([seance('2026-09-20', 12.5, 8, 8, 8)], [seance('2026-09-20', 10, 8, 8, 8)])

    expect(plans.get('a-dips')?.weight).toBe(10)
    expect(plans.get('a-tractions-lestees')?.weight).toBe(10)
  })

  it('ne fait pas hériter un exercice jamais fait de la charge de l’autre', () => {
    // P1 de Codex. Les dips tirent 12,5 kg, les tractions n'ont aucun historique : les
    // aligner sur 12,5 ferait de l'absence de preuve une preuve, ce que le moteur
    // refuse partout ailleurs. La référence d'un membre sans passé est son départ.
    const plans = groupe([seance('2026-09-20', 12.5, 8, 8, 8)], [])

    expect(plans.get('a-dips')?.weight).toBe(10)
    expect(plans.get('a-tractions-lestees')?.weight).toBe(10)
  })

  it('n’a rien à décider sans le moindre historique', () => {
    const plans = groupe([], [])
    expect(plans.get('a-dips')).toMatchObject({ weight: 10, outcome: 'depart' })
  })
})
