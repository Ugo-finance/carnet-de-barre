/**
 * Ce que les écrans lisent — CB-62.
 *
 * Aucune logique métier dans React : les composants reçoivent des valeurs déjà
 * décidées. La règle n'est pas esthétique. Deux écrans qui recalculent chacun « combien
 * de paliers pour la séance A ? » finissent par ne plus être d'accord, et le désaccord
 * se voit en salle avant de se voir dans un test.
 *
 * Ces fonctions sont **pures** : elles prennent ce qui a été lu et rendent ce qui sera
 * affiché. Aucune n'ouvre la base, aucune ne lit l'horloge sans qu'on la lui passe.
 *
 * Ce qu'elles ne calculent **pas**, et pourquoi c'est explicite : e1RM, tonnage et
 * record ont leurs données mais pas leur formule — arbitrage 4 de `00-contrat.md`,
 * formule attendue en CB-13. Plutôt que de les omettre en silence, `metriquesDifferees`
 * les nomme avec leur motif, pour qu'un écran puisse dire « pas encore » au lieu
 * d'afficher un blanc que personne ne sait interpréter.
 */

import { LIFTS, RUSHED_EXERCISE_COUNT, SEANCES } from '../domain/program.ts'
import { currentSession, describeWhen, todayInZurich } from '../domain/schedule.ts'
import type { ExerciseDef } from '../domain/program.ts'
import type { Draft, Seance, SeanceType, SetLog, Targets } from '../domain/types.ts'
import { accessoryPlans } from './accessory-history.ts'
import { setsForExercise } from './draft.ts'
import { isDraftActive } from './draft.ts'
import { workingSets } from './derive.ts'

/**
 * Les exercices de la **file active** — `10-interaction.md` § 1, point 4.
 *
 * Le mode pressé omet les exercices au-delà du deuxième de la file, **sans supprimer
 * leurs séries du brouillon** : basculer l'interrupteur ne doit jamais faire disparaître
 * une saisie. La distinction se joue donc ici, à la projection, et nulle part ailleurs.
 */
export function exercicesActifs(type: SeanceType, rushed: boolean): readonly ExerciseDef[] {
  const exercices = SEANCES[type].exercises
  return rushed ? exercices.slice(0, RUSHED_EXERCISE_COUNT) : exercices
}

/**
 * Les séries de la file active d'un brouillon, **paliers compris**.
 *
 * C'est l'unité dans laquelle le contrat exprime l'avancement : « le nombre de séries
 * `validated` ou `skipped` sur le nombre de séries de la file active », et les totaux
 * 23 / 22 / 16 en sont la mesure. Compter sur les seules séries de travail donnerait
 * 0/16 à quelqu'un qui vient de valider ses sept paliers — ce qu'il a réellement fait
 * n'apparaîtrait nulle part. P1 de Codex sur #55.
 */
export function seriesActives(draft: Draft): SetLog[] {
  const actifs = new Set(exercicesActifs(draft.type, draft.rushed).map((exercice) => exercice.id))
  return draft.sets.filter((set) => actifs.has(set.exerciseId))
}

/** Un exercice tel que l'accueil l'annonce, sans charge : la séance n'est pas ouverte. */
export interface ExerciceAnnonce {
  id: string
  label: string
  scheme: string
  optional: boolean
}

export interface AccueilSansSeance {
  etat: 'aucune'
  /** Proposition de la rotation, jamais une contrainte : le sélecteur reste libre. */
  type: SeanceType
  /** Date civile en heure de Zurich. */
  date: string
  /** « Aujourd'hui », « Demain », « Jeudi ». */
  quand: string
  exercices: ExerciceAnnonce[]
  /**
   * Le nombre de paliers d'échauffement de cette sélection.
   *
   * Compté en construisant réellement les séries — mêmes cibles, mêmes plans
   * d'accessoires, même `warmupPlan` que le brouillon qui sera ouvert. Un compte
   * réimplémenté ici dériverait du vrai au premier changement de politique, et
   * annoncerait « 7 paliers » devant une séance qui en propose 6.
   */
  paliers: number
  /** Les séries de travail de cette sélection, paliers exclus. */
  seriesDeTravail: number
}

export interface AccueilSeanceEnCours {
  etat: 'en-cours'
  type: SeanceType
  date: string
  /**
   * Séries de la **file active** traitées — validées ou sautées — sur son total.
   *
   * Paliers compris : c'est l'unité du contrat, et celle des totaux 23 / 22 / 16. Le
   * mode pressé rétrécit les deux, puisqu'il retire les exercices au-delà du deuxième
   * de la file sans toucher au brouillon.
   */
  traitees: number
  total: number
  /** Reste-t-il quelque chose à faire ? Décide du libellé de fin de séance. */
  complet: boolean
  /** Dernière écriture du brouillon (epoch ms). */
  misAJourA: number
  /** Instant du démarrage explicite, ou `null` si la séance n'a pas été démarrée. */
  demarreeA: number | null
}

export type ResumeAccueil = AccueilSansSeance | AccueilSeanceEnCours

/**
 * Ce que l'accueil affiche, selon qu'une séance est en cours ou non.
 *
 * La distinction se fait sur `isDraftActive`, et sur rien d'autre : un brouillon ouvert
 * par le simple affichage de l'accueil n'est pas une séance à reprendre, sans quoi
 * l'app proposerait « Reprendre » à quelqu'un qui n'a rien commencé.
 */
export function resumeAccueil(entree: {
  draft: Draft | undefined
  seances: readonly Seance[]
  targets: Targets
  now?: Date
}): ResumeAccueil {
  const { draft, seances, targets } = entree
  const now = entree.now ?? new Date()

  if (draft && isDraftActive(draft)) {
    const file = seriesActives(draft)
    const traitees = file.filter(
      (set) => set.status === 'validated' || set.status === 'skipped',
    ).length
    return {
      etat: 'en-cours',
      type: draft.type,
      date: draft.date,
      traitees,
      total: file.length,
      complet: traitees === file.length,
      misAJourA: draft.updatedAt,
      demarreeA: draft.startedAt,
    }
  }

  const suggestion = currentSession(now, seances)
  return {
    etat: 'aucune',
    type: suggestion.type,
    date: todayInZurich(now),
    quand: describeWhen(suggestion),
    ...apercuSeance(suggestion.type, targets, seances),
  }
}

/**
 * Ce qu'une sélection A/B/C propose, avant toute ouverture de brouillon.
 *
 * Exporté séparément parce que le sélecteur manuel en a besoin : changer A/B/C doit
 * mettre à jour la liste et le compte de paliers **sans créer ni écraser de brouillon**.
 */
export function apercuSeance(
  type: SeanceType,
  targets: Targets,
  seances: readonly Seance[],
  rushed = false,
): Pick<AccueilSansSeance, 'exercices' | 'paliers' | 'seriesDeTravail'> {
  // La projection pressée vit ici, pas dans l'écran : la règle des deux exercices est
  // déjà écrite une fois, et un composant qui la réimplémenterait annoncerait un jour
  // une file que le brouillon ne produit pas.
  const exercices = exercicesActifs(type, rushed)
  const plans = accessoryPlans(exercices, seances)
  const series = exercices.flatMap((exercise) =>
    setsForExercise(exercise, targets, plans.get(exercise.id)),
  )

  return {
    exercices: exercices.map((exercise) => ({
      id: exercise.id,
      label: exercise.label,
      scheme: exercise.scheme,
      optional: exercise.optional ?? false,
    })),
    paliers: series.filter((set) => set.role === 'warmup').length,
    seriesDeTravail: series.filter((set) => set.role !== 'warmup').length,
  }
}

export interface ResumeFinSeance {
  date: string
  type: SeanceType
  /**
   * Durée réelle en secondes, ou `null`.
   *
   * `null` dès que `startedAt` manque — séance du carnet papier, ou enregistrée avant
   * que le démarrage explicite n'existe. Zéro serait un mensonge, et l'écart depuis
   * `createdAt` en serait un autre : l'app ouvre un brouillon au simple affichage de
   * l'accueil, et compterait le trajet jusqu'à la salle.
   */
  dureeSecondes: number | null
  /** Les séries réellement validées, paliers exclus. */
  validees: SetLog[]
  /** Les paliers validés, comptés à part : ils ont été faits, ils ne comptent pas. */
  paliersValides: number
  notes: string
}

export function resumeFinSeance(seance: Seance): ResumeFinSeance {
  const sets = seance.sets ?? []
  return {
    date: seance.date,
    type: seance.type,
    dureeSecondes: dureeDe(seance),
    validees: workingSets({ sets }).filter((set) => set.status === 'validated'),
    paliersValides: sets.filter((set) => set.role === 'warmup' && set.status === 'validated')
      .length,
    notes: seance.notes,
  }
}

/**
 * La durée d'une séance, ou `null` si elle n'est pas connue.
 *
 * Une durée négative ou nulle est traitée comme inconnue : elle ne peut venir que d'une
 * horloge qui a reculé — changement d'heure, correction NTP — et « 0 min » se lirait
 * comme une séance expédiée plutôt que comme une mesure impossible.
 */
export function dureeDe(seance: Pick<Seance, 'startedAt' | 'completedAt'>): number | null {
  const { startedAt, completedAt } = seance
  if (startedAt == null || completedAt == null) return null
  const secondes = Math.round((completedAt - startedAt) / 1000)
  return secondes > 0 ? secondes : null
}

/** Une métrique qui a ses données mais pas encore sa formule. */
export interface MetriqueDifferee {
  cle: 'e1rm' | 'tonnage' | 'record'
  label: string
  motif: string
}

/**
 * Ce que la maquette montre et que l'app ne peut pas encore calculer honnêtement.
 *
 * Nommé plutôt qu'omis. Un écran qui ne rend pas la carte n'a rien à expliquer ; un
 * écran qui voudrait dire pourquoi dispose ici du motif exact, et personne n'a besoin
 * d'inventer une phrase au moment de l'afficher.
 */
export const metriquesDifferees: readonly MetriqueDifferee[] = [
  {
    cle: 'e1rm',
    label: 'Max estimé',
    motif: 'Formule non arrêtée — CB-13. Les top sets existent, la conversion non.',
  },
  {
    cle: 'tonnage',
    label: 'Tonnage',
    motif: 'Le chariot de la presse et le poids du corps ne sont pas comptés — CB-13.',
  },
  {
    cle: 'record',
    label: 'Record',
    motif: 'Dépend de la formule d’e1RM, qui n’est pas arrêtée — CB-13.',
  },
]

export interface LigneProgression {
  lift: keyof Omit<Targets, 'updatedAt'>
  label: string
  /** Charge visée au prochain passage. */
  cible: number
  /** Échec en attente à cette charge, ou `null`. */
  echecEnAttente: number | null
}

/**
 * Les cibles courantes, prêtes à afficher, plus ce qui est différé.
 *
 * `ajustable` est porté ici et pas décidé dans l'écran : l'interdiction pendant une
 * séance active est une règle du magasin (`StoreError('draft-in-progress')`), et un
 * bouton actif qui échouera au clic est pire qu'un bouton désactivé.
 */
export function resumeProgression(entree: { targets: Targets; draft: Draft | undefined }): {
  lignes: LigneProgression[]
  ajustable: boolean
  differees: readonly MetriqueDifferee[]
} {
  const { targets, draft } = entree
  const lifts = ['squat', 'bench', 'deadlift', 'tractions', 'benchVol'] as const

  return {
    lignes: lifts.map((lift) => ({
      lift,
      label: LIFTS[lift].label,
      cible: targets[lift].w,
      echecEnAttente: targets[lift].fail,
    })),
    ajustable: !(draft && isDraftActive(draft)),
    differees: metriquesDifferees,
  }
}
