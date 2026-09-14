/**
 * Regroupement des séances par semaine — CB-66.
 *
 * L'historique répondait jusqu'ici à « est-ce que ma séance est bien là ? », une
 * question qu'on se pose le soir même et qui se satisfait d'une liste à plat. Il doit
 * maintenant répondre à « qu'est-ce que j'ai fait cette semaine ? », qui est une
 * question de volume et non de vérification.
 *
 * La règle qui tient tout le module : **la semaine est dérivée, jamais écrite**. Une
 * séance garde sa date métier telle qu'elle a été enregistrée ; le lundi de sa semaine
 * est recalculé à chaque affichage. Stocker le groupe ferait exister deux vérités sur
 * la même séance, et c'est la copie qui dériverait — une correction de date en D6
 * laisserait la séance dans son ancienne semaine sans que rien ne proteste.
 */

import { addDays, weekdayOf } from './schedule.ts'
import type { Seance } from './types.ts'

/**
 * Le lundi de la semaine civile qui contient cette date.
 *
 * Semaine ISO, donc du lundi au dimanche. `weekdayOf` rend la convention de
 * `getUTCDay` — 0 pour dimanche — qu'il faut ramener à 7 avant de reculer, sinon un
 * dimanche repartirait d'un jour en avant et atterrirait sur le lundi **suivant**.
 * C'est précisément le jour où Ugo fait sa séance C.
 */
export function lundiDeLaSemaine(isoDate: string): string {
  const jour = weekdayOf(isoDate)
  if (Number.isNaN(jour)) return isoDate
  const depuisLundi = jour === 0 ? 6 : jour - 1
  return addDays(isoDate, -depuisLundi)
}

export interface SemaineGroupee {
  /** Date civile du lundi, `AAAA-MM-JJ`. Sert de clé de rendu et d'étiquette. */
  lundi: string
  /** Le dimanche qui la ferme, pour l'intitulé « du … au … ». */
  dimanche: string
  /** Les séances de cette semaine, de la plus récente à la plus ancienne. */
  seances: Seance[]
}

/**
 * Les séances du plus récent au plus ancien, à date égale la dernière enregistrée
 * d'abord.
 *
 * Deux séances le même jour sont permises (D5). Rendre `0` à date égale laissait
 * l'ordre des clés IndexedDB décider, qui n'a aucun rapport avec l'heure : c'est alors
 * la mauvaise des deux qui pouvait s'afficher dépliée en haut, juste au moment où Ugo
 * vient vérifier que sa séance du soir est bien là.
 *
 * `ts` est l'instant de finalisation. Il manque aux séances du dossier de départ, qui
 * n'ont qu'une date : elles passent donc après celles qui en ont, ce qui est le bon
 * ordre puisqu'elles sont toutes anciennes.
 */
export function parOrdreAntichronologique(seances: readonly Seance[]): Seance[] {
  return seances.toSorted((a, b) =>
    a.date === b.date ? (b.ts ?? 0) - (a.ts ?? 0) : a.date < b.date ? 1 : -1,
  )
}

/**
 * Les séances groupées par semaine, de la plus récente à la plus ancienne.
 *
 * Le tri vit ici et non dans l'écran : sans lui, le groupement dépendrait de l'ordre
 * d'arrivée, et deux magasins qui rendent l'historique dans des sens opposés — c'est
 * le cas des nôtres — donneraient deux historiques différents.
 *
 * Les semaines sans aucune séance n'apparaissent pas. Une semaine vide n'est pas une
 * information : l'historique dit ce qui a été fait, et une absence se lit déjà dans le
 * saut de dates entre deux groupes.
 */
export function grouperParSemaine(seances: readonly Seance[]): SemaineGroupee[] {
  const groupes: SemaineGroupee[] = []

  for (const seance of parOrdreAntichronologique(seances)) {
    const lundi = lundiDeLaSemaine(seance.date)
    const courant = groupes.at(-1)
    if (courant?.lundi === lundi) {
      courant.seances.push(seance)
    } else {
      groupes.push({ lundi, dimanche: addDays(lundi, 6), seances: [seance] })
    }
  }

  return groupes
}
