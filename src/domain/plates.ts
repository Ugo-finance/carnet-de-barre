/**
 * Chargement de la barre — CB-12.
 *
 * L'app doit dire quoi mettre **par côté**, sans que personne n'ait à faire le calcul
 * debout devant le rack. Le point délicat n'est pas le calcul, c'est le cas où la
 * charge demandée n'est pas réalisable : il vaut mieux le dire que rendre une
 * décomposition partielle qui aurait l'air exacte.
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
const toUnits = (kg: number): number => Math.round(kg * UNIT)
const toKg = (units: number): number => units / UNIT

export type PlateLoad =
  /** La charge demandée est exactement celle de la barre à vide. */
  | { kind: 'bar-only' }
  /** Décomposition exacte, de la plaque la plus lourde à la plus légère. */
  | { kind: 'plates'; perSide: number[] }
  /** Charge inférieure à la barre : rien à mettre, et rien à afficher non plus. */
  | { kind: 'below-bar'; bar: number }
  /**
   * Charge non réalisable avec les plaques de la salle, par exemple 21 kg.
   * `closest` donne la charge réalisable la plus proche, pour proposer autre chose
   * plutôt que d'afficher une décomposition fausse.
   */
  | { kind: 'not-loadable'; closest: number }

/** Décompose gloutonnement un demi-chargement. Rend `null` s'il reste un résidu. */
function decompose(sideUnits: number): number[] | null {
  let reste = sideUnits
  const out: number[] = []
  for (const plate of PLATES) {
    const unit = toUnits(plate)
    while (reste >= unit) {
      out.push(plate)
      reste -= unit
    }
  }
  return reste === 0 ? out : null
}

/** Charge réalisable la plus proche, en explorant de part et d'autre. */
function closestLoadable(totalUnits: number): number {
  const smallest = toUnits(PLATES[PLATES.length - 1]) * 2
  const barUnits = toUnits(BAR_WEIGHT)
  for (let ecart = 1; ecart <= smallest; ecart += 1) {
    for (const candidat of [totalUnits - ecart, totalUnits + ecart]) {
      if (candidat < barUnits) continue
      if (candidat === barUnits) return BAR_WEIGHT
      const moitie = (candidat - barUnits) / 2
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
 * ```
 */
export function platesPerSide(total: number): PlateLoad {
  if (!Number.isFinite(total)) return { kind: 'below-bar', bar: BAR_WEIGHT }

  const totalUnits = toUnits(total)
  const barUnits = toUnits(BAR_WEIGHT)

  if (totalUnits < barUnits) return { kind: 'below-bar', bar: BAR_WEIGHT }
  if (totalUnits === barUnits) return { kind: 'bar-only' }

  const sideUnits = (totalUnits - barUnits) / 2
  // Une charge impaire en quarts de kilo ne se répartit pas également des deux côtés.
  if (!Number.isInteger(sideUnits))
    return { kind: 'not-loadable', closest: closestLoadable(totalUnits) }

  const perSide = decompose(sideUnits)
  if (!perSide) return { kind: 'not-loadable', closest: closestLoadable(totalUnits) }

  return { kind: 'plates', perSide }
}

/**
 * Phrase prête à afficher sous la charge cible. Rend `null` quand il n'y a rien à
 * dire, pour que l'interface n'ait pas à filtrer elle-même.
 */
export function describePlates(load: PlateLoad): string | null {
  switch (load.kind) {
    case 'bar-only':
      return 'Barre seule'
    case 'plates':
      return `Par côté : ${load.perSide.map((p) => String(p).replace('.', ',')).join(' + ')}`
    case 'not-loadable':
      return `Charge non réalisable — au plus proche : ${String(load.closest).replace('.', ',')} kg`
    case 'below-bar':
      return null
  }
}
