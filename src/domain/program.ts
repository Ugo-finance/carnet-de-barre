/**
 * Le programme d'Ugo — CB-10.
 *
 * Données du domaine, figées ici plutôt que saisies par l'utilisateur : l'app connaît
 * le programme et fait tout le travail de tête (SPEC.md). Source : SPEC.md § « Le programme ».
 */

import type { LiftKey, LoadKind, SeanceType } from './types.ts'

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
  /** Accessoire facultatif, saisie en texte libre. */
  | 'optional'

export interface ExerciseDef {
  id: string
  label: string
  kind: ExerciseKind
  loadKind: LoadKind
  /** Schéma affiché sous le titre de la carte. */
  scheme: string
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
        label: 'Tractions lestées',
        kind: 'accessory',
        loadKind: 'added',
        scheme: '3×8 — lest +10 kg',
        sets: 3,
        reps: 8,
        suggestedWeight: 10,
        restSeconds: REST.superset,
        supersetGroup: 'a-ss',
      },
      {
        id: 'a-dips',
        label: 'Dips lestés',
        kind: 'accessory',
        loadKind: 'added',
        scheme: '3×8–10 — lest +10 kg',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        suggestedWeight: 10,
        restSeconds: REST.superset,
        supersetGroup: 'a-ss',
      },
      {
        id: 'a-curls',
        label: 'Curls',
        kind: 'optional',
        loadKind: 'perDumbbell',
        scheme: '2×10–12',
        sets: 2,
        reps: null,
        repsRange: [10, 12],
        restSeconds: REST.superset,
      },
      {
        id: 'a-elevations',
        label: 'Élévations latérales',
        kind: 'optional',
        loadKind: 'perDumbbell',
        scheme: '2×10–12',
        sets: 2,
        reps: null,
        repsRange: [10, 12],
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
        label: 'Rowing haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        scheme: '3×8–10 — 22,5 à 24 kg par haltère',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        suggestedWeight: 22.5,
        restSeconds: REST.superset,
        supersetGroup: 'b-ss',
      },
      {
        id: 'b-dm',
        label: 'Développé militaire haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        scheme: '3×8–10 — 20 kg par haltère',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        suggestedWeight: 20,
        restSeconds: REST.superset,
        supersetGroup: 'b-ss',
      },
      {
        id: 'b-face-pulls',
        label: 'Face pulls',
        kind: 'optional',
        loadKind: 'machine',
        scheme: '2×15',
        sets: 2,
        reps: 15,
        restSeconds: REST.superset,
      },
      {
        id: 'b-abdos',
        label: 'Abdos roulette',
        kind: 'optional',
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
        label: 'Développé incliné haltères',
        kind: 'accessory',
        loadKind: 'perDumbbell',
        scheme: '3×8–10 — 20 kg par haltère, noter les répétitions',
        sets: 3,
        reps: null,
        repsRange: [8, 10],
        suggestedWeight: 20,
        restSeconds: REST.accessory,
      },
      {
        id: 'c-presse',
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
        label: 'Élévations latérales',
        kind: 'optional',
        loadKind: 'perDumbbell',
        scheme: '2×12–15',
        sets: 2,
        reps: null,
        repsRange: [12, 15],
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
