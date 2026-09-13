/**
 * Le moteur d'échauffement — CB-54.
 *
 * Les cinq P1 de la contre-revue sur le moteur d'accessoires venaient tous du même endroit :
 * des scénarios partant d'une donnée complète et bien formée. Ce fichier commence donc par
 * ce qui manque, ce qui s'efface et ce qui déborde, et ne descend qu'ensuite vers les valeurs
 * canoniques du contrat.
 */

import { describe, expect, it } from 'vitest'
import { warmupPlan, type WarmupStep } from './warmup.ts'
import { BAR_WEIGHT, SEANCES } from './program.ts'
import type { SeanceType } from './types.ts'

/** Les charges d'un plan, dans l'ordre. Lisible dans le message d'échec. */
function charges(plan: readonly WarmupStep[]): (number | null)[] {
  return plan.map((palier) => palier.weight)
}

describe('ce qui ne produit aucun palier', () => {
  it('rend une liste vide pour la politique « aucun »', () => {
    expect(warmupPlan('aucun', 'barTotal', 100)).toEqual([])
  })

  it('n’invente pas de palier en fraction d’une charge inconnue', () => {
    // Une charge d'accessoire peut être inconnue : le moteur de CB-45 rend `null` quand
    // aucune séance de l'historique n'en porte. Un palier calculé sur `null` vaudrait 0.
    expect(warmupPlan('accessoire', 'perDumbbell', null)).toEqual([])
    expect(warmupPlan('barrePlancher', 'barTotal', null)).toEqual([])
  })

  it('garde en revanche les paliers qui ne dépendent d’aucune cible', () => {
    // Décisif, et c'est le cas réel : les tractions lestées de la séance A ont une charge
    // suggérée qui peut manquer, et leur seul palier est au poids du corps. Le supprimer
    // parce que le lest n'est pas renseigné retirerait une montée qui ne demandait rien.
    expect(warmupPlan('lestReduit', 'added', null)).toEqual([{ weight: null, reps: 5 }])
    expect(charges(warmupPlan('lestComplet', 'added', null))).toEqual([null])
  })

  it('s’efface entièrement quand la cible est au niveau du plancher', () => {
    // Soulevé de terre à 60 kg : les trois paliers remontent au plancher, qui n'est plus
    // strictement sous la charge de travail. Rien à échauffer en dessous.
    expect(warmupPlan('barrePlancher', 'barTotal', 60)).toEqual([])
    expect(warmupPlan('barrePlancher', 'barTotal', 55)).toEqual([])
  })

  it('s’efface quand la série de travail est la barre à vide', () => {
    expect(warmupPlan('barreComplet', 'barTotal', BAR_WEIGHT)).toEqual([])
  })
})

describe('l’arrondi tombe toujours sur la grille de la salle', () => {
  it('arrondit au pas le plus proche', () => {
    // 87 % de 75 vaut 65,25 : au plus proche, 65 et non 67,5.
    expect(charges(warmupPlan('barreComplet', 'barTotal', 75))).toEqual([20, 37.5, 52.5, 65])
    expect(charges(warmupPlan('accessoire', 'barTotal', 100))).toEqual([60])
  })

  it('tranche les égalités vers le haut', () => {
    // 60 % de 15 kg par haltère vaut exactement 9, à égale distance de 8 et de 10 au pas
    // de 2. La règle est écrite : on monte. Sans elle, la salle et l'app diraient deux
    // choses différentes une fois sur deux, sans qu'on sache laquelle.
    expect(charges(warmupPlan('accessoire', 'perDumbbell', 15))).toEqual([10])
  })

  it('suit le pas des haltères, qui vont de 2 en 2', () => {
    // 60 % de 24 vaut 14,4 : 14, et surtout pas 15, qui n'existe pas au râtelier.
    expect(charges(warmupPlan('accessoire', 'perDumbbell', 24))).toEqual([14])
    expect(charges(warmupPlan('accessoire', 'perDumbbell', 30))).toEqual([18])
  })

  it('suit le pas de la presse, qui va de 5 en 5', () => {
    expect(charges(warmupPlan('accessoire', 'machine', 120))).toEqual([70])
  })

  it('ne laisse traîner aucun résidu de calcul binaire', () => {
    // 0,87 × 92,5 vaut 80,475 en réel et 80,47500000000001 en flottant. Ce résidu
    // finirait dans un champ de saisie.
    for (const cible of [92.5, 87.5, 62.5, 47.5, 33]) {
      for (const charge of charges(warmupPlan('barreComplet', 'barTotal', cible))) {
        expect(charge == null || Number.isInteger(charge * 4)).toBe(true)
      }
    }
  })
})

describe('la suite des paliers', () => {
  it('est strictement croissante, quelle que soit la cible', () => {
    // Balayage : à cible basse, deux paliers voisins peuvent arrondir sur la même valeur
    // ou remonter tous deux au plancher. Aucune de ces situations ne doit ressortir.
    for (let cible = 22.5; cible <= 160; cible += 2.5) {
      const portees = charges(warmupPlan('barreComplet', 'barTotal', cible)).filter(
        (charge): charge is number => charge != null,
      )
      const croissantes = portees.every((charge, rang) => rang === 0 || charge > portees[rang - 1]!)
      expect(croissantes, `cible ${cible} : ${portees.join(' · ')}`).toBe(true)
    }
  })

  it('ne propose jamais un palier aussi lourd que la série de travail', () => {
    for (let cible = 22.5; cible <= 160; cible += 2.5) {
      for (const politique of ['barreComplet', 'barreReduit', 'barrePlancher'] as const) {
        for (const palier of warmupPlan(politique, 'barTotal', cible)) {
          expect(palier.weight!, `${politique} à ${cible}`).toBeLessThan(cible)
        }
      }
    }
  })

  it('garde le palier haut à cible basse, et perd celui du bas', () => {
    // P1 de Codex sur #41 et #42. J'avais écrit que « sous 60 kg de cible barre, le palier
    // ~87 % saute » découlait des règles de suite. C'est faux : à 57,5 kg, 87 % vaut 50,025
    // et s'arrondit à 50, strictement sous la charge de travail — il reste. C'est le palier
    // à 50 % qui s'écrase le premier sur la barre à vide, puis celui à 70 %.
    //
    // Les valeurs viennent d'un sondage du moteur sur toute la plage basse, pas d'un second
    // raisonnement : c'est le premier qui avait tort.
    expect(charges(warmupPlan('barreComplet', 'barTotal', 57.5))).toEqual([20, 30, 40, 50])
    expect(charges(warmupPlan('barreComplet', 'barTotal', 50))).toEqual([20, 25, 35, 42.5])
    expect(charges(warmupPlan('barreComplet', 'barTotal', 40))).toEqual([20, 27.5, 35])
    expect(charges(warmupPlan('barreComplet', 'barTotal', 32.5))).toEqual([20, 22.5, 27.5])
    expect(charges(warmupPlan('barreComplet', 'barTotal', 25))).toEqual([20, 22.5])
  })

  it('perd un palier plutôt que d’en répéter un à cible basse', () => {
    // À 30 kg, la moitié et les 70 % arrondissent tous deux sous la barre et s'y écrasent :
    // ils disparaissent au lieu de proposer trois fois « barre seule ».
    expect(charges(warmupPlan('barreComplet', 'barTotal', 30))).toEqual([20, 25])
  })

  it('ne descend jamais sous ce que la barre permet de charger', () => {
    // Propriété de sortie, garantie par deux règles à la fois : le palier « barre à vide »
    // ouvre la marche et la croissance stricte écarte tout ce qui passerait dessous. Le
    // cas où la borne agit seule — cible au niveau de la barre — est éprouvé plus haut.
    for (let cible = 22.5; cible <= 60; cible += 2.5) {
      for (const palier of warmupPlan('barreComplet', 'barTotal', cible)) {
        expect(palier.weight!, `cible ${cible}`).toBeGreaterThanOrEqual(BAR_WEIGHT)
      }
    }
  })

  it('n’applique pas la borne de la barre à ce qui n’est pas une barre', () => {
    // Le contre-test du précédent : 60 % de 24 kg par haltère vaut 14, et ne doit surtout
    // pas remonter à 20 parce qu'une barre de 20 kg existe ailleurs.
    expect(charges(warmupPlan('accessoire', 'perDumbbell', 24))).toEqual([14])
    expect(charges(warmupPlan('lestComplet', 'added', 15))).toEqual([null, 7.5])
  })
})

describe('le plancher du soulevé de terre', () => {
  it('remonte un palier trop léger à 60 kg', () => {
    // 60 % de 92,5 vaut 55,5, sous la hauteur de disque utilisable. Le palier part à 60.
    expect(charges(warmupPlan('barrePlancher', 'barTotal', 92.5))).toEqual([60, 72.5, 82.5])
  })

  it('ne commence jamais à la barre à vide', () => {
    for (let cible = 62.5; cible <= 200; cible += 2.5) {
      const premier = warmupPlan('barrePlancher', 'barTotal', cible)[0]
      if (premier) expect(premier.weight, `cible ${cible}`).toBeGreaterThanOrEqual(60)
    }
  })

  it('n’impose son plancher à aucune autre politique', () => {
    // Le plancher appartient au mouvement, pas au matériel : un squat à 70 kg garde son
    // palier à 35, bien au-dessous de 60.
    expect(charges(warmupPlan('barreComplet', 'barTotal', 70))).toContain(35)
  })
})

describe('les paliers canoniques du contrat', () => {
  // Les valeurs de `docs/refonte/00-contrat.md` § 4, aux cibles du 13.09.2026. Elles
  // passent par la politique **déclarée dans le programme**, pas par une politique choisie
  // ici : un exercice dont la politique changerait par erreur ferait tomber ce test.
  const CIBLES: Record<string, number | null> = {
    'a-squat': 75,
    'a-bench-vol': 60,
    'a-tractions-lestees': 10,
    'a-dips': 10,
    'a-curls': 12,
    'a-elevations': 8,
    'b-bench': 70,
    'b-tractions': 15,
    'b-rowing': 22,
    'b-dm': 20,
    'b-face-pulls': 25,
    'b-abdos': null,
    'c-deadlift': 92.5,
    'c-di': 24,
    'c-presse': 120,
    'c-tractions-pdc': null,
    'c-elevations': 8,
  }

  const ATTENDU: Record<string, WarmupStep[]> = {
    'a-squat': [
      { weight: 20, reps: 8 },
      { weight: 37.5, reps: 5 },
      { weight: 52.5, reps: 3 },
      { weight: 65, reps: 1 },
    ],
    'a-bench-vol': [
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
    ],
    'a-tractions-lestees': [{ weight: null, reps: 5 }],
    'a-dips': [],
    'a-curls': [],
    'a-elevations': [],
    'b-bench': [
      { weight: 20, reps: 8 },
      { weight: 35, reps: 5 },
      { weight: 50, reps: 3 },
      { weight: 60, reps: 1 },
    ],
    'b-tractions': [
      { weight: null, reps: 5 },
      { weight: 7.5, reps: 2 },
    ],
    'b-rowing': [],
    'b-dm': [],
    'b-face-pulls': [],
    'b-abdos': [],
    'c-deadlift': [
      { weight: 60, reps: 5 },
      { weight: 72.5, reps: 3 },
      { weight: 82.5, reps: 1 },
    ],
    'c-di': [{ weight: 14, reps: 8 }],
    'c-presse': [],
    'c-tractions-pdc': [],
    'c-elevations': [],
  }

  const exercices = (['A', 'B', 'C'] as const).flatMap((type: SeanceType) => [
    ...SEANCES[type].exercises,
  ])

  it('couvre tout le programme, sans exercice oublié', () => {
    // Sinon un exercice ajouté demain passerait à travers la table ci-dessus sans bruit.
    expect(exercices.map((exercice) => exercice.id).toSorted()).toEqual(
      Object.keys(ATTENDU).toSorted(),
    )
  })

  it.each(exercices.map((exercice) => [exercice.id, exercice] as const))('%s', (id, exercice) => {
    expect(warmupPlan(exercice.warmup, exercice.loadKind, CIBLES[id]!)).toEqual(ATTENDU[id])
  })

  it('donne les comptes annoncés par la maquette : 23, 22 et 16 séries', () => {
    // La roadmap demandait de vérifier ces nombres contre le programme réel avant de s'en
    // servir. Ils ne tomberont juste qu'une fois les optionnels structurés (CB-69) : ce
    // test mesure donc les paliers seuls, la part que ce lot livre.
    const paliers = (type: SeanceType) =>
      SEANCES[type].exercises.reduce(
        (total, exercice) =>
          total + warmupPlan(exercice.warmup, exercice.loadKind, CIBLES[exercice.id]!).length,
        0,
      )

    expect({ A: paliers('A'), B: paliers('B'), C: paliers('C') }).toEqual({ A: 7, B: 6, C: 4 })
  })
})
