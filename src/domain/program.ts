/**
 * Le programme d'Ugo — CB-10.
 *
 * Données du domaine, figées ici plutôt que saisies par l'utilisateur : l'app connaît
 * le programme et fait tout le travail de tête (SPEC.md). Source : SPEC.md § « Le programme ».
 */

import type { LiftKey, LoadKind, SeanceType } from './types.ts'
import type { WarmupPolicy } from './warmup.ts'

/** Barre olympique standard. */
export const BAR_WEIGHT = 20

/** Plaques disponibles en salle, par côté, de la plus lourde à la plus légère. */
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const

/** Repos en secondes. 2 à 3 min sur les lifts lourds, 60 à 90 s en superset (SPEC.md). */
export const REST = {
  main: 150,
  accessory: 90,
  superset: 75,
} as const

/**
 * Pas de charge disponible en salle, par nature de charge — CB-15.
 *
 * Une charge proposée hors grille envoie Ugo chercher un haltère qui n'existe pas,
 * en pleine séance. Le pas se dérive donc de `loadKind` : il décrit le **matériel**,
 * pas l'exercice, et deux exercices sur le même râtelier ne peuvent pas diverger.
 *
 * - `perDumbbell` : 2 kg, l'écart entre deux haltères voisins du râtelier (confirmé
 *   par Ugo le 13.09.2026 — la grille de 2,5 héritée de l'ancien carnet était fausse) ;
 * - `barTotal` et `added` : 2,5 kg, le plus petit disque étant 1,25 kg par côté ;
 * - `machine` : 5 kg, confirmé par le coach d'Ugo le 13.09.2026 — le saut de la presse
 *   45° est de 5 à 10 kg de disques. La valeur était auparavant à 2,5 et explicitement
 *   marquée non vérifiée ; elle l'est maintenant.
 * - `bodyweight` : sans objet, aucun champ de charge n'est affiché.
 */
export const WEIGHT_STEP_BY_LOAD_KIND: Record<LoadKind, number> = {
  barTotal: 2.5,
  perDumbbell: 2,
  added: 2.5,
  bodyweight: 2.5,
  machine: 5,
}

/** Le pas du stepper pour cette nature de charge. */
export function weightStepFor(loadKind: LoadKind): number {
  return WEIGHT_STEP_BY_LOAD_KIND[loadKind]
}

export interface LiftDef {
  label: string
  /** Incrément de progression en kg. */
  inc: number
  /** Répétitions attendues sur le top set. */
  reps: number
  loadKind: LoadKind
}

export const LIFTS: Record<LiftKey, LiftDef> = {
  squat: { label: 'Squat', inc: 2.5, reps: 4, loadKind: 'barTotal' },
  bench: { label: 'Développé couché', inc: 2.5, reps: 4, loadKind: 'barTotal' },
  deadlift: { label: 'Soulevé de terre', inc: 5, reps: 3, loadKind: 'barTotal' },
  tractions: { label: 'Tractions lestées', inc: 2.5, reps: 4, loadKind: 'added' },
  benchVol: { label: 'Développé couché volume', inc: 2.5, reps: 8, loadKind: 'barTotal' },
}

/** Comment se calculent les séries de délestage qui suivent un top set. */
export interface BackoffDef {
  count: number
  reps: number
  /** Fraction du top set réalisé, arrondie à 2,5 kg. */
  ratio?: number
  /** Charge fixe, qui ignore le top set (tractions : +7,5 kg). */
  fixed?: number
}

export type ExerciseKind =
  /** Top set piloté par le moteur, suivi de backoffs. */
  | 'topset'
  /** Séries identiques à la même charge, double progression (bench volume 3×8). */
  | 'volume'
  /** Accessoire structuré : charge et répétitions saisies, pas de progression automatique. */
  | 'accessory'

export interface ExerciseDef {
  id: string
  label: string
  kind: ExerciseKind
  loadKind: LoadKind
  /** Schéma affiché sous le titre de la carte. */
  scheme: string
  /**
   * Ce que cet exercice reçoit comme échauffement — CB-54.
   *
   * Obligatoire, et déclaré ici plutôt que déduit : « premier mouvement d'un pattern
   * froid » ne se lit pas dans un nom d'exercice. Le champ force à trancher pour chaque
   * entrée, y compris celles qu'on ajoutera. Valeurs et motifs : `docs/refonte/00-contrat.md`.
   */
  warmup: WarmupPolicy
  /**
   * L'exercice peut être sauté sans que la séance soit incomplète — CB-69.
   *
   * Curls, élévations, face pulls et abdos se notaient en texte libre, sous un genre
   * `'optional'` à part. Ils sont depuis des accessoires structurés comme les autres :
   * même charge, mêmes répétitions, même place dans la file. Seul leur caractère
   * facultatif les distingue, et il se déclare **ici** plutôt que dans `kind`.
   *
   * Le motif : `kind` répond à « comment cet exercice se fait » et pilote
   * `setsForExercise`. Lui faire porter en plus « est-ce obligatoire » obligerait chaque
   * aiguillage sur `kind` à traiter deux questions à la fois, et le premier oublié
   * fabriquerait un exercice structuré que le moteur ignore, en silence. Même
   * raisonnement que `repsAfterRise` et `loadGroup` : une dimension orthogonale se
   * déclare à part.
   */
  optional?: boolean
  /** Présent si l'exercice est piloté par le moteur de progression. */
  lift?: LiftKey
  /** Nombre de séries hors top set. */
  sets: number
  /** Répétitions cibles, ou `null` si fourchette ou AMRAP. */
  reps: number | null
  /** Fourchette de répétitions, quand la spec en donne une. */
  repsRange?: readonly [number, number]
  backoff?: BackoffDef
  restSeconds: number
  /** Exercices partageant cette clé s'enchaînent en superset. */
  supersetGroup?: string
  /** Charge indicative quand aucune cible du moteur ne s'applique. */
  suggestedWeight?: number
  /**
   * Ce que deviennent les répétitions visées **après** une montée de charge.
   *
   * - `'bottom'` (défaut) : retour au bas de la fourchette, la double progression
   *   classique — c'est la règle du coach pour les haltères, où le saut de 2 kg fait
   *   déjà +10 % et mérite qu'on reparte de plus bas ;
   * - `'hold'` : on garde le haut de la fourchette. Décision d'Ugo du 13.09.2026 pour
   *   les dips et les tractions lestées : « 2,5 sans retour plus bas ».
   *
   * Le champ existe pour que cette divergence soit **lisible dans la table**, au lieu
   * d'être une condition sur des identifiants d'exercice enfouie dans le moteur.
   */
  repsAfterRise?: 'bottom' | 'hold'
  /**
   * Exercices dont la charge suggérée avance **ensemble**.
   *
   * Ugo enchaîne dips et tractions lestées en superset avec les mêmes disques : des
   * suggestions divergentes l'obligeraient à recharger la ceinture entre deux
   * mouvements enchaînés, ce qui défait l'intérêt du superset. Il a tranché le
   * 13.09.2026 : charge commune, qui monte quand les deux passent.
   *
   * Volontairement distinct de `supersetGroup` : le rowing et le développé militaire
   * sont eux aussi en superset, mais partent de 22 et 20 kg. Être enchaînés n'implique
   * pas de partager une charge, et lier automatiquement par superset les aurait
   * alignés de force.
   */
  loadGroup?: string
  /** Séries menées au maximum de répétitions (moins une ou deux). */
  amrap?: boolean
}

export interface SeanceDef {
  type: SeanceType
  title: string
  /** Dans l'ordre d'exécution. Le mode pressé garde les deux premiers. */
  exercises: readonly ExerciseDef[]
}

export const SEANCES: Record<SeanceType, SeanceDef> = {
  A: {
    type: 'A',
    title: 'Squat + développé volume',
    exercises: [
      {
        id: 'a-squat',
        warmup: 'barreComplet',
        label: 'Squat',
        kind: 'topset',
        loadKind: 'barTotal',
        lift: 'squat',
        scheme: 'Top set 1×4 @RPE 8, puis 2 backoffs ×5 à −10 %',
        sets: 0,
        reps: 4,
        backoff: { count: 2, reps: 5, ratio: 0.9 },
        restSeconds: REST.main,
      },
      {
        id: 'a-bench-vol',
        warmup: 'barreReduit',
        label: 'Développé couché volume',
        kind: 'volume',
        loadKind: 'barTotal',
        lift: 'benchVol',
        scheme: '3×8 — même charge sur les trois séries',
        sets: 3,
        reps: 8,
        restSeconds: REST.main,
      },
      {
        id: 'a-tractions-lestees',
        warmup: 'lestReduit',
        label: 'Tractions lestées',
        kind: 'accessory',
        loadKind: 'added',
        // Le libellé ne porte plus la charge : la progression la fait bouger, et un
        // « +10 kg » écrit en dur se met à mentir dès le premier saut — exactement ce
        // qui est arrivé au « 20 kg par haltère » du développé incliné.
        scheme: '3×8–10 — lest en disques',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        repsAfterRise: 'hold',
        loadGroup: 'a-lest',
        suggestedWeight: 10,
        restSeconds: REST.superset,
        supersetGroup: 'a-ss',
      },
      {
        id: 'a-dips',
        warmup: 'aucun',
        label: 'Dips lestés',
        kind: 'accessory',
        loadKind: 'added',
        scheme: '3×8–10 — lest en disques',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        repsAfterRise: 'hold',
        loadGroup: 'a-lest',
        suggestedWeight: 10,
        restSeconds: REST.superset,
        supersetGroup: 'a-ss',
      },
      {
        id: 'a-curls',
        warmup: 'aucun',
        label: 'Curls',
        kind: 'accessory',
        optional: true,
        loadKind: 'perDumbbell',
        scheme: '2×10–12',
        sets: 2,
        reps: null,
        repsRange: [10, 12],
        suggestedWeight: 12,
        restSeconds: REST.superset,
      },
      {
        id: 'a-elevations',
        warmup: 'aucun',
        label: 'Élévations latérales',
        kind: 'accessory',
        optional: true,
        loadKind: 'perDumbbell',
        scheme: '2×12–20',
        sets: 2,
        reps: null,
        repsRange: [12, 20],
        suggestedWeight: 8,
        restSeconds: REST.superset,
      },
    ],
  },
  B: {
    type: 'B',
    title: 'Développé lourd + dos',
    exercises: [
      {
        id: 'b-bench',
        warmup: 'barreComplet',
        label: 'Développé couché',
        kind: 'topset',
        loadKind: 'barTotal',
        lift: 'bench',
        scheme: 'Top set 1×4 @RPE 8, puis 2 backoffs ×5 à −10 %',
        sets: 0,
        reps: 4,
        backoff: { count: 2, reps: 5, ratio: 0.9 },
        restSeconds: REST.main,
      },
      {
        id: 'b-tractions',
        warmup: 'lestComplet',
        label: 'Tractions lestées, prise large',
        kind: 'topset',
        loadKind: 'added',
        lift: 'tractions',
        scheme: 'Top set 1×4–5 @RPE 8, puis 2 backoffs à +7,5 kg ×6',
        sets: 0,
        reps: 4,
        backoff: { count: 2, reps: 6, fixed: 7.5 },
        restSeconds: REST.main,
      },
      {
        id: 'b-rowing',
        warmup: 'aucun',
        label: 'Rowing haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        // 22,5 venait de l'ancien carnet, qui raisonnait sur la grille de la barre.
        // Le râtelier va de 2 en 2 : cet haltère n'existe pas dans la salle d'Ugo.
        scheme: '3×8–12 — 22 à 24 kg par haltère',
        sets: 3,
        reps: null,
        repsRange: [8, 12],
        suggestedWeight: 22,
        restSeconds: REST.superset,
        supersetGroup: 'b-ss',
      },
      {
        id: 'b-dm',
        warmup: 'aucun',
        label: 'Développé militaire haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        scheme: '3×8–12 — 20 kg par haltère',
        sets: 3,
        reps: null,
        repsRange: [8, 12],
        suggestedWeight: 20,
        restSeconds: REST.superset,
        supersetGroup: 'b-ss',
      },
      {
        id: 'b-face-pulls',
        warmup: 'aucun',
        label: 'Face pulls',
        kind: 'accessory',
        optional: true,
        loadKind: 'machine',
        scheme: '2×12–15',
        sets: 2,
        reps: null,
        // Arbitrage d'Ugo du 13.09.2026, en réponse à la question posée. La maquette les
        // annonçait « hors moteur (poulie) » : à 2×15 fermes, sans fourchette, rien ne
        // pouvait déclencher une montée et la proposition serait restée à 25 kg même
        // après une séance à 30 — la forme exacte du défaut vu en salle le 12.09.
        // Sa réponse : « non il faut progresser ». La fourchette 12–15 garde 15 comme
        // haut, c'est-à-dire ce que la maquette demandait, et ouvre en dessous la marge
        // dont la double progression a besoin.
        repsRange: [12, 15],
        suggestedWeight: 25,
        restSeconds: REST.superset,
      },
      {
        id: 'b-abdos',
        warmup: 'aucun',
        label: 'Abdos roulette',
        kind: 'accessory',
        optional: true,
        loadKind: 'bodyweight',
        scheme: '2×10',
        sets: 2,
        reps: 10,
        restSeconds: REST.superset,
      },
    ],
  },
  C: {
    type: 'C',
    title: 'Soulevé de terre + haut du corps',
    exercises: [
      {
        id: 'c-deadlift',
        warmup: 'barrePlancher',
        label: 'Soulevé de terre',
        kind: 'topset',
        loadKind: 'barTotal',
        lift: 'deadlift',
        scheme: 'Top set 1×3 @RPE 8, puis 2 backoffs ×4 à −10 %',
        sets: 0,
        reps: 3,
        backoff: { count: 2, reps: 4, ratio: 0.9 },
        restSeconds: REST.main,
      },
      {
        // Deuxième exercice de la séance, pas un accessoire : reste visible en mode pressé.
        id: 'c-di',
        warmup: 'accessoire',
        label: 'Développé incliné haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        scheme: '3×8–12 — 24 kg par haltère, noter les répétitions',
        sets: 3,
        reps: null,
        repsRange: [8, 12],
        // 24 et non 20 : la table portait encore la charge d'avant. L'export du 12.09
        // montre Ugo à 24 kg/haltère, et son coach a entériné cette cible.
        suggestedWeight: 24,
        restSeconds: REST.accessory,
      },
      {
        id: 'c-presse',
        warmup: 'aucun',
        label: 'Presse 45°',
        kind: 'accessory',
        loadKind: 'machine',
        scheme: '2×10–12 — noter la charge',
        sets: 2,
        reps: null,
        repsRange: [10, 12],
        restSeconds: REST.superset,
        supersetGroup: 'c-ss',
      },
      {
        id: 'c-tractions-pdc',
        warmup: 'aucun',
        label: 'Tractions poids de corps',
        kind: 'accessory',
        loadKind: 'bodyweight',
        scheme: '2× maximum moins deux répétitions',
        sets: 2,
        reps: null,
        amrap: true,
        restSeconds: REST.superset,
        supersetGroup: 'c-ss',
      },
      {
        id: 'c-elevations',
        warmup: 'aucun',
        label: 'Élévations latérales',
        kind: 'accessory',
        optional: true,
        loadKind: 'perDumbbell',
        scheme: '2×12–20',
        sets: 2,
        reps: null,
        repsRange: [12, 20],
        suggestedWeight: 8,
        restSeconds: REST.superset,
      },
    ],
  },
}

/** Rotation hebdomadaire, indexée sur le jour de la semaine à Zurich (0 = dimanche). */
export const WEEKDAY_TO_TYPE: Readonly<Partial<Record<number, SeanceType>>> = {
  0: 'C',
  2: 'A',
  4: 'B',
}

/** Combien d'exercices restent actifs en mode pressé (SPEC.md : « exercices 1–2 seulement »). */
export const RUSHED_EXERCISE_COUNT = 2

/** Retourne la définition d'un exercice, toutes séances confondues. */
export function findExercise(exerciseId: string): ExerciseDef | undefined {
  for (const seance of Object.values(SEANCES)) {
    const found = seance.exercises.find((exercise) => exercise.id === exerciseId)
    if (found) return found
  }
  return undefined
}
