/**
 * Les réglages locaux d'Ugo — CB-62.
 *
 * Quatre interrupteurs, et une règle qui les distingue du reste des données : **ils ne
 * décrivent pas ce qui s'est passé**. Perdre une préférence coûte un tap ; perdre une
 * séance ne se rattrape pas. C'est pourquoi ils vivent dans `meta`, à côté des cibles et
 * de l'historique mais sans transaction commune, et pourquoi un réglage illisible se
 * remplace par son défaut sans bruit au lieu de faire échouer une lecture.
 *
 * **Versionnés**, et c'est le cœur du lot. Un réglage ajouté plus tard ne doit pas
 * effacer ceux qu'Ugo a déjà choisis : la lecture complète ce qui manque et conserve ce
 * qui est là. La version dit ce que la ligne stockée savait au moment de son écriture,
 * ce qui permettra un jour d'en *réinterpréter* un — renommer, inverser, scinder — au
 * lieu de simplement en ajouter.
 */

/** La version du format des réglages. À incrémenter dès qu'un champ change de sens. */
export const PREFERENCES_VERSION = 1

export interface Preferences {
  /** Vibrer à la fin d'un décompte, quand le téléphone le permet. */
  vibration: boolean
  /** Émettre le bip de fin de décompte. */
  sonChrono: boolean
  /**
   * Garder l'écran allumé, **par défaut**, sur les séances à venir.
   *
   * La séance en cours garde le sien dans le brouillon : Ugo a tranché le 13.09.2026
   * que la préférence vaut pour la séance et pas pour un seul décompte. Ce réglage-ci
   * dit seulement dans quel état la prochaine séance s'ouvre — le basculer en pleine
   * séance ne doit pas changer celle qui tourne.
   */
  ecranAllume: boolean
  /** Ouvrir les séances en mode pressé. */
  modePresseParDefaut: boolean
}

/**
 * Ce qu'Ugo obtient tant qu'il n'a rien réglé.
 *
 * Vibration et son à `true` : ce sont les seuls signaux de fin de repos quand le
 * téléphone est posé à côté de la barre, et un réglage qu'on découvre éteint ressemble
 * à une panne. Mode pressé à `false` : il ampute l'affichage, et personne ne doit le
 * subir sans l'avoir demandé.
 */
export const PREFERENCES_PAR_DEFAUT: Preferences = {
  vibration: true,
  sonChrono: true,
  ecranAllume: true,
  modePresseParDefaut: false,
}

/** La ligne telle qu'elle est écrite dans `meta`. */
export interface StoredPreferences extends Partial<Preferences> {
  version?: number
}

function booleen(valeur: unknown, defaut: boolean): boolean {
  return typeof valeur === 'boolean' ? valeur : defaut
}

/**
 * Relit une ligne de réglages, quelle que soit la version qui l'a écrite.
 *
 * Tolérante par conception, et seulement ici : une valeur absente, d'un autre type, ou
 * venue d'une version inconnue retombe sur son défaut **champ par champ**. Rejeter la
 * ligne entière parce qu'un champ est abîmé ferait perdre les trois autres — et un
 * réglage n'a jamais assez de valeur pour justifier une erreur à l'ouverture de l'app.
 *
 * Une version **plus récente** que celle de l'app est donc lue comme une version
 * connue, en ne gardant que les champs qu'on sait interpréter. C'est le seul choix qui
 * survive à un aller-retour entre deux appareils dont l'un est à jour et l'autre non.
 */
export function readPreferences(row: unknown): Preferences {
  if (row === null || typeof row !== 'object') return { ...PREFERENCES_PAR_DEFAUT }
  const stored = row as StoredPreferences

  return {
    vibration: booleen(stored.vibration, PREFERENCES_PAR_DEFAUT.vibration),
    sonChrono: booleen(stored.sonChrono, PREFERENCES_PAR_DEFAUT.sonChrono),
    ecranAllume: booleen(stored.ecranAllume, PREFERENCES_PAR_DEFAUT.ecranAllume),
    modePresseParDefaut: booleen(
      stored.modePresseParDefaut,
      PREFERENCES_PAR_DEFAUT.modePresseParDefaut,
    ),
  }
}

/** Ce qui part en base : les quatre réglages, plus la version qui les a écrits. */
export function writePreferences(preferences: Preferences): StoredPreferences {
  return { ...preferences, version: PREFERENCES_VERSION }
}
