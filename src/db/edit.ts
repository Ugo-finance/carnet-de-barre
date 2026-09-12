/**
 * Corriger une série d'une séance enregistrée — CB-34.
 *
 * Le cas réel : Ugo tape 95 au lieu de 92,5, valide, et s'en aperçoit en relisant.
 * Jusqu'ici il ne pouvait que **supprimer la séance entière**, donc perdre le reste
 * pour corriger un chiffre.
 *
 * Deux règles gouvernent ce fichier.
 *
 * **D6 : rien ne touche aux cibles.** Les cibles d'aujourd'hui sont le produit de tout
 * ce qui s'est passé depuis ; les recalculer depuis un point du passé effacerait chaque
 * décision prise entre-temps, ajustements manuels compris. Corriger l'histoire ne
 * réécrit pas le présent.
 *
 * **Le résumé est reproduit par la fonction qui l'a produit.** `lines` et `tops` sont
 * dérivés des séries ; après correction ils sont re-dérivés par `deriveSeance`, pas
 * rafistolés. Une seconde implémentation divergerait au premier changement de notation,
 * et l'historique mélangerait deux formats sans que rien ne le signale.
 */

import { deriveSeance } from './derive.ts'
import type { Seance, SetLog } from '../domain/types.ts'

export class SeanceEditError extends Error {}

/** Ce qu'une correction peut changer sur une série. Le reste est structurel. */
export type SetPatch = Partial<Pick<SetLog, 'weight' | 'reps' | 'rpe' | 'status'>>

/**
 * Applique la correction et rend le **patch** à passer à `updateSeance`.
 *
 * Fonction pure : ni base, ni horloge. Elle rend seulement les champs qui changent,
 * pour que l'appelant n'ait pas à reconstruire une séance entière — et donc pas
 * l'occasion d'en altérer un champ sans le vouloir.
 */
export function reviseSet(
  seance: Seance,
  setId: string,
  patch: SetPatch,
): Pick<Seance, 'sets' | 'lines' | 'tops'> {
  // Une séance du dossier de départ n'a que des lignes écrites à la main : il n'y a
  // aucune série à corriger, et en inventer à partir du texte serait fabriquer des
  // données qu'Ugo n'a jamais saisies.
  if (!seance.sets) {
    throw new SeanceEditError(
      'Cette séance vient du carnet papier : seules ses notes peuvent être corrigées.',
    )
  }

  const cible = seance.sets.find((set) => set.id === setId)
  if (!cible) {
    throw new SeanceEditError('Cette série n’existe pas dans cette séance.')
  }

  if (patch.weight !== undefined && patch.weight !== null) {
    if (!Number.isFinite(patch.weight) || patch.weight < 0 || patch.weight > 500) {
      throw new SeanceEditError('Cette charge est hors de ce que l’app accepte.')
    }
  }
  if (patch.reps !== undefined && patch.reps !== null) {
    if (!Number.isInteger(patch.reps) || patch.reps < 0 || patch.reps > 100) {
      throw new SeanceEditError('Ce nombre de répétitions est hors de ce que l’app accepte.')
    }
  }
  if (patch.rpe !== undefined && patch.rpe !== null) {
    if (!Number.isFinite(patch.rpe) || patch.rpe < 5 || patch.rpe > 10) {
      throw new SeanceEditError('Le RPE se note entre 5 et 10.')
    }
  }

  const sets = seance.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set))
  const { lines, tops } = deriveSeance({ sets, accessories: seance.accessories })
  return { sets, lines, tops }
}

/**
 * Retire une série d'une séance enregistrée — la série jamais faite, validée par
 * erreur. Les lignes et les tops suivent.
 */
export function removeSet(seance: Seance, setId: string): Pick<Seance, 'sets' | 'lines' | 'tops'> {
  if (!seance.sets) {
    throw new SeanceEditError(
      'Cette séance vient du carnet papier : seules ses notes peuvent être corrigées.',
    )
  }
  if (!seance.sets.some((set) => set.id === setId)) {
    throw new SeanceEditError('Cette série n’existe pas dans cette séance.')
  }

  const sets = seance.sets.filter((set) => set.id !== setId)
  const { lines, tops } = deriveSeance({ sets, accessories: seance.accessories })
  return { sets, lines, tops }
}
