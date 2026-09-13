/**
 * Les paliers d'échauffement — CB-54.
 *
 * Ugo improvisait ses montées en charge. L'app les calcule désormais depuis la cible du
 * jour. Le contrat et ses valeurs canoniques sont dans `docs/refonte/00-contrat.md` ; ce
 * module ne fait que les produire.
 *
 * Deux principes portent tout le fichier.
 *
 * **La politique est déclarée, jamais déduite.** « Le premier mouvement d'un pattern
 * froid » ne se lit pas dans le nom d'un exercice, et une déduction implicite se
 * tromperait en silence au premier exercice ajouté. Chaque entrée du programme porte donc
 * sa politique, comme `repsAfterRise` et `loadGroup` portent les leurs depuis CB-45.
 *
 * **Une charge hors grille n'existe pas.** Un palier arrondi au mauvais pas envoie Ugo
 * chercher un haltère absent du râtelier, en pleine séance. Tout sort arrondi au pas de la
 * nature de charge, et rien ne sort au-dessous de ce que la barre permet de charger.
 *
 * Fonction pure : aucun import React ni DOM, aucune lecture de base.
 */

import type { LoadKind } from './types.ts'
import { BAR_WEIGHT, weightStepFor } from './program.ts'

/**
 * Ce qu'un exercice reçoit comme échauffement.
 *
 * Les noms disent le **matériel et l'intensité**, jamais l'exercice : deux exercices qui
 * s'échauffent pareil partagent une politique, et un exercice ajouté demain choisit dans
 * cette liste sans qu'on touche au moteur.
 */
export type WarmupPolicy =
  /** Barre à vide puis trois paliers : le premier mouvement lourd d'un pattern froid. */
  | 'barreComplet'
  /** Barre à vide puis un palier : mouvement à la barre sur un corps déjà échauffé. */
  | 'barreReduit'
  /** Jamais à vide, plancher à 60 kg : le soulevé de terre, et lui seul. */
  | 'barrePlancher'
  /** Poids du corps puis une fraction du lest : tractions lestées, pattern tirage froid. */
  | 'lestComplet'
  /** Poids du corps seul : tractions lestées sur un dos déjà sollicité. */
  | 'lestReduit'
  /** Une série légère : le premier exercice d'un pattern encore froid. */
  | 'accessoire'
  /** Rien. Le pattern est déjà chaud, ou il n'y a rien à échauffer. */
  | 'aucun'

/** Un palier, prêt à être proposé tel quel. */
export interface WarmupStep {
  /**
   * La charge à mettre. `null` au poids du corps — il n'y a **pas** de charge à porter,
   * ce qui n'est pas la même chose qu'une charge de zéro.
   */
  weight: number | null
  reps: number
}

/**
 * Comment un palier se dérive de la charge de travail.
 *
 * `barreVide` et `poidsDuCorps` sont des charges absolues, pas des fractions : elles ne
 * bougent pas quand la cible monte.
 */
type PalierSpec =
  | { readonly source: 'barreVide'; readonly reps: number }
  | { readonly source: 'poidsDuCorps'; readonly reps: number }
  | { readonly source: 'fraction'; readonly part: number; readonly reps: number }

interface PolitiqueDef {
  readonly paliers: readonly PalierSpec[]
  /** Charge minimale imposée par le mouvement lui-même, avant celle du matériel. */
  readonly plancher?: number
}

/**
 * Le plancher du soulevé de terre — CB-53, arbitrage d'Ugo du 13.09.2026.
 *
 * La contrainte n'est pas le poids mais la **hauteur de départ de la barre** : sous
 * 60 kg on ne peut plus charger de disques pleine hauteur. 60 kg s'atteignent avec 20 kg
 * par côté, les disques de 20 ayant le même diamètre que ceux de 25. Le document d'origine
 * disait « avec des disques de 25 », ce qui donne 70 kg sur une barre de 20.
 */
const PLANCHER_SOULEVE = 60

const POLITIQUES: Record<WarmupPolicy, PolitiqueDef> = {
  barreComplet: {
    paliers: [
      { source: 'barreVide', reps: 8 },
      { source: 'fraction', part: 0.5, reps: 5 },
      { source: 'fraction', part: 0.7, reps: 3 },
      { source: 'fraction', part: 0.87, reps: 1 },
    ],
  },
  barreReduit: {
    paliers: [
      { source: 'barreVide', reps: 10 },
      // Deux tiers, et non « un disque de 10 par côté » : à la seule cible connue les deux
      // lectures donnent 40 kg, et seule la fraction se calcule à une autre cible. Signalé
      // comme à confirmer dans `00-contrat.md` § 6.1.
      { source: 'fraction', part: 2 / 3, reps: 5 },
    ],
  },
  barrePlancher: {
    paliers: [
      { source: 'fraction', part: 0.6, reps: 5 },
      { source: 'fraction', part: 0.78, reps: 3 },
      { source: 'fraction', part: 0.9, reps: 1 },
    ],
    plancher: PLANCHER_SOULEVE,
  },
  lestComplet: {
    paliers: [
      { source: 'poidsDuCorps', reps: 5 },
      { source: 'fraction', part: 0.5, reps: 2 },
    ],
  },
  lestReduit: { paliers: [{ source: 'poidsDuCorps', reps: 5 }] },
  accessoire: { paliers: [{ source: 'fraction', part: 0.6, reps: 8 }] },
  aucun: { paliers: [] },
}

/**
 * Au pas le plus proche, **égalité vers le haut**.
 *
 * Le passage par un entier de pas évite le résidu binaire qu'on traînerait sinon jusque
 * dans un champ de saisie : 0,87 × 92,5 ne doit pas afficher 80,47500000000001.
 */
function arrondirAuPas(valeur: number, pas: number): number {
  return Math.round(Math.round(valeur / pas) * pas * 1000) / 1000
}

/**
 * Les paliers d'échauffement d'un exercice, dans l'ordre où ils se font.
 *
 * `workWeight` est la charge de la **série de travail** : la cible du jour pour un lift
 * piloté par le moteur, la charge proposée pour un accessoire, le lest pour les tractions
 * lestées. `null` quand il n'y en a pas — au poids du corps, ou charge non renseignée.
 *
 * Une charge de travail inconnue n'efface que les paliers qui **en dépendent**. Le poids du
 * corps et la barre à vide ne se déduisent d'aucune cible : les supprimer parce que le lest
 * n'est pas renseigné retirerait à Ugo une montée qui ne demandait rien à personne. Une
 * absence n'est pas une valeur, et elle n'est pas non plus contagieuse.
 */
export function warmupPlan(
  policy: WarmupPolicy,
  loadKind: LoadKind,
  workWeight: number | null,
): WarmupStep[] {
  const politique = POLITIQUES[policy]
  if (politique.paliers.length === 0) return []

  const pas = weightStepFor(loadKind)
  // La barre est son propre plancher : aucun palier ne peut être plus léger qu'elle.
  //
  // La borne est rarement celle qui tranche — dans les politiques à la barre, le palier « à
  // vide » vient en tête et la règle de croissance stricte écarte déjà tout ce qui passe
  // sous 20 kg. Elle sert quand ce palier de tête disparaît lui-même, c'est-à-dire à une
  // cible égale ou inférieure à la barre : sans elle, le plan repartirait alors à 10 kg,
  // qui ne se charge pas. Une défense difficile à atteindre reste une défense (AGENTS.md).
  const plancher = Math.max(politique.plancher ?? 0, loadKind === 'barTotal' ? BAR_WEIGHT : 0)

  const paliers: WarmupStep[] = []
  let dernierePortee: number | null = null

  for (const spec of politique.paliers) {
    if (spec.source === 'poidsDuCorps') {
      paliers.push({ weight: null, reps: spec.reps })
      continue
    }

    let brute: number
    if (spec.source === 'barreVide') {
      brute = BAR_WEIGHT
    } else {
      // Un palier en fraction de la charge de travail ne se calcule pas sans elle.
      if (workWeight == null) continue
      brute = spec.part * workWeight
    }
    const charge = Math.max(arrondirAuPas(brute, pas), plancher)

    // Trois raisons de laisser tomber un palier, toutes ramenées à la même condition : il
    // doit être strictement plus lourd que le précédent retenu, et strictement plus léger
    // que la série de travail. Un palier qui s'efface à cible basse est la conséquence de
    // cette règle, jamais un cas particulier écrit à la main.
    if (workWeight != null && charge >= workWeight) continue
    if (dernierePortee != null && charge <= dernierePortee) continue

    paliers.push({ weight: charge, reps: spec.reps })
    dernierePortee = charge
  }

  return paliers
}
