/**
 * Chargement de la barre — CB-12.
 *
 * L'app doit dire quoi mettre **par côté**, sans que personne n'ait à faire le calcul
 * debout devant le rack. Le point délicat n'est pas le calcul, c'est le cas où la
 * charge demandée n'est pas réalisable : il vaut mieux le dire que rendre une
 * décomposition partielle, ou pire, la décomposition d'une charge voisine.
 *
 * Ne s'applique qu'aux charges `barTotal`. Un lest de tractions ou un haltère n'a pas
 * de côtés : appeler cette fonction dessus n'aurait aucun sens.
 */

import { BAR_WEIGHT, PLATES } from './program.ts'

/**
 * Tout se calcule en quarts de kilo, en nombres entiers. La plus petite plaque fait
 * 1,25 kg, donc rien ne se perd, et on évite les 0,7500000001 des flottants.
 */
const UNIT = 4

/** Tolérance de comparaison, pour ne pas rejeter 62,5 à cause d'un 62,499999999. */
const EPSILON = 1e-6

/**
 * Au-delà, on refuse de répondre. Aucune barre ne porte ça, et une valeur corrompue
 * venue d'un import ne doit pas faire tourner une boucle de décomposition assez
 * longtemps pour figer l'écran pendant une séance.
 */
export const MAX_TOTAL = 1000

const toUnits = (kg: number): number => Math.round(kg * UNIT)
const toKg = (units: number): number => units / UNIT
const BAR_UNITS = toUnits(BAR_WEIGHT)

export type PlateLoad =
  /** La charge demandée est exactement celle de la barre à vide. */
  | { kind: 'bar-only' }
  /** Décomposition exacte, de la plaque la plus lourde à la plus légère. */
  | { kind: 'plates'; perSide: number[] }
  /** Charge inférieure à la barre : la barre à elle seule pèse déjà plus. */
  | { kind: 'below-bar'; bar: number }
  /**
   * Charge non réalisable avec les plaques de la salle, par exemple 21 kg, ou charge
   * qui ne tombe pas sur un multiple de 0,25 kg, comme 22,4.
   * `closest` donne la charge réalisable la plus proche, pour proposer autre chose
   * plutôt que d'afficher la décomposition d'une charge qu'on n'a pas demandée.
   */
  | { kind: 'not-loadable'; closest: number }
  /** Valeur hors de ce que l'app accepte de traiter. */
  | { kind: 'out-of-range'; max: number }

/**
 * Décompose un demi-chargement. Rend `null` s'il reste un résidu.
 *
 * Les quantités se calculent par division, pas par soustractions successives : une
 * charge élevée ne coûte donc pas plus de temps qu'une charge courante.
 */
function decompose(sideUnits: number): number[] | null {
  let reste = sideUnits
  const out: number[] = []
  for (const plate of PLATES) {
    const unit = toUnits(plate)
    const count = Math.floor(reste / unit)
    if (count <= 0) continue
    for (let index = 0; index < count; index += 1) out.push(plate)
    reste -= count * unit
  }
  return reste === 0 ? out : null
}

/** Charge réalisable la plus proche, en explorant de part et d'autre. */
function closestLoadable(totalUnits: number): number {
  const smallestPair = toUnits(PLATES[PLATES.length - 1]) * 2
  for (let ecart = 0; ecart <= smallestPair; ecart += 1) {
    for (const candidat of ecart === 0 ? [totalUnits] : [totalUnits - ecart, totalUnits + ecart]) {
      if (candidat < BAR_UNITS) continue
      if (candidat === BAR_UNITS) return BAR_WEIGHT
      const moitie = (candidat - BAR_UNITS) / 2
      if (!Number.isInteger(moitie)) continue
      if (decompose(moitie)) return toKg(candidat)
    }
  }
  return BAR_WEIGHT
}

/**
 * Que mettre de chaque côté d'une barre de 20 kg pour atteindre `total`.
 *
 * ```ts
 * platesPerSide(92.5) // { kind: 'plates', perSide: [25, 10, 1.25] }
 * platesPerSide(20)   // { kind: 'bar-only' }
 * platesPerSide(21)   // { kind: 'not-loadable', closest: 20 }
 * platesPerSide(22.4) // { kind: 'not-loadable', closest: 22.5 } — et surtout pas la
 *                     //   décomposition de 22,5 présentée comme celle de 22,4
 * ```
 */
export function platesPerSide(total: number): PlateLoad {
  if (!Number.isFinite(total)) return { kind: 'out-of-range', max: MAX_TOTAL }
  if (total > MAX_TOTAL) return { kind: 'out-of-range', max: MAX_TOTAL }
  if (total < BAR_WEIGHT - EPSILON) return { kind: 'below-bar', bar: BAR_WEIGHT }

  // Une charge qui ne tombe pas sur un quart de kilo n'existe pas en salle. L'arrondir
  // pour « faire marcher » le calcul reviendrait à répondre à une autre question.
  const exactUnits = total * UNIT
  const totalUnits = Math.round(exactUnits)
  if (Math.abs(exactUnits - totalUnits) > EPSILON) {
    return { kind: 'not-loadable', closest: closestLoadable(totalUnits) }
  }

  if (totalUnits === BAR_UNITS) return { kind: 'bar-only' }

  const sideUnits = (totalUnits - BAR_UNITS) / 2
  // Une charge impaire en quarts de kilo ne se répartit pas également des deux côtés.
  if (!Number.isInteger(sideUnits)) {
    return { kind: 'not-loadable', closest: closestLoadable(totalUnits) }
  }

  const perSide = decompose(sideUnits)
  if (!perSide) return { kind: 'not-loadable', closest: closestLoadable(totalUnits) }

  return { kind: 'plates', perSide }
}

const kg = (value: number): string => String(value).replace('.', ',')

/**
 * Phrase prête à afficher sous la charge cible.
 *
 * Tous les cas parlent, y compris ceux où il n'y a rien à charger : le silence laisse
 * croire que l'app n'a pas compris, alors qu'elle a justement quelque chose à dire.
 */
export function describePlates(load: PlateLoad): string {
  switch (load.kind) {
    case 'bar-only':
      return 'Barre seule'
    case 'plates':
      return `Par côté : ${load.perSide.map((plate) => kg(plate)).join(' + ')}`
    case 'not-loadable':
      return `Charge non réalisable — au plus proche : ${kg(load.closest)} kg`
    case 'below-bar':
      return `La barre pèse déjà ${kg(load.bar)} kg : cette charge n'est pas réalisable à la barre`
    case 'out-of-range':
      return `Charge hors limites — maximum ${kg(load.max)} kg`
  }
}
