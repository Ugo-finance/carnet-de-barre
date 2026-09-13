import { describe, expect, it } from 'vitest'
import { STALL_SESSIONS, planAccessory, type AccessoryPerformance } from './accessory.ts'
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
