/**
 * Types du domaine — CB-10.
 *
 * Aucun import React ni DOM ici (AGENTS.md). Ces types sont le contrat entre
 * l'écran de séance (Codex), la persistance (Claude) et le moteur de progression.
 */

/** Les trois séances du programme. Rotation : dimanche C, mardi A, jeudi B. */
export type SeanceType = 'A' | 'B' | 'C'

/** Les cinq mouvements pilotés par le moteur de progression. */
export type LiftKey = 'squat' | 'bench' | 'deadlift' | 'tractions' | 'benchVol'

/**
 * Nature d'une charge. Deux charges de nature différente ne se comparent jamais :
 * 60 kg à la barre et 20 kg par haltère ne sont pas le même effort.
 */
export type LoadKind =
  /** Poids total sur la barre, barre de 20 kg comprise. Seul cas où les plaques se calculent. */
  | 'barTotal'
  /** Poids d'un seul haltère (rowing, développé militaire, développé incliné). */
  | 'perDumbbell'
  /** Lest ajouté au poids de corps (tractions lestées, dips lestés). */
  | 'added'
  /** Poids de corps seul, aucune charge à saisir. */
  | 'bodyweight'
  /** Charge lue sur la machine (presse 45°). */
  | 'machine'

/** Rôle d'une série dans son exercice. */
export type SetRole = 'top' | 'backoff' | 'volume' | 'accessory'

/**
 * État d'une série. Une valeur pré-remplie ne prouve jamais une réalisation :
 * seul `validated` compte pour le moteur de progression et pour l'historique.
 */
export type SetStatus =
  /** Proposée par l'app, jamais touchée. */
  | 'planned'
  /** Modifiée par l'utilisateur, pas encore validée. */
  | 'entered'
  /** Validée d'un tap. Déclenche le chrono et compte pour la progression. */
  | 'validated'
  /** Explicitement sautée. Ne compte pas comme un échec. */
  | 'skipped'

/** Une série, prévue ou réalisée. */
export interface SetLog {
  /** Stable pour la durée du brouillon puis de la séance. */
  id: string
  /** Identifiant de l'exercice dans `SEANCES` (voir program.ts). */
  exerciseId: string
  role: SetRole
  /** Rang de la série dans son exercice, à partir de 0. */
  index: number
  status: SetStatus
  loadKind: LoadKind
  /**
   * Valeur éditable de la charge, **pré-remplie depuis la cible dès la création de la
   * série**. C'est ce que montrent et modifient les steppers, et c'est ce qui rend
   * possible « valider une série pré-remplie en un tap » : rien à recopier au moment
   * de valider.
   *
   * Elle ne prouve donc rien à elle seule : **`status` est la seule preuve de
   * réalisation**. Le moteur de progression ne lit que les séries `validated`.
   *
   * `null` quand il n'y a pas de charge à porter : `loadKind` vaut `bodyweight`, ou
   * l'utilisateur a effacé le champ.
   */
  weight: number | null
  /**
   * Répétitions, pré-remplies puis éditables, mêmes règles que `weight`.
   *
   * `0` est une valeur **connue** : la série a été tentée et manquée. `null` veut dire
   * « non noté », ce qui n'est jamais un échec.
   */
  reps: number | null
  /** RPE noté. `null` = non noté, ce qui n'est jamais un échec. */
  rpe: number | null
  /**
   * Ce que l'app avait proposé à l'ouverture du brouillon. Jamais modifié par la
   * saisie : c'est ce qui permet de relire un écart entre prévu et réalisé.
   */
  targetWeight: number | null
  targetReps: number | null
}

/** Ligne d'accessoire libre (exercices « optionnels » de la spec). */
export interface AccessoryLog {
  exerciseId: string
  done: boolean
  /** Texte libre : charge, reps, remarque. */
  note: string
}

/** Le meilleur set d'un lift sur une séance, format historique conservé depuis le seed. */
export interface TopRecord {
  w: number | null
  reps: number | null
  rpe: number | null
}

/** Cible courante d'un lift. */
export interface Target {
  /** Charge visée au prochain passage. */
  w: number
  /** Incrément de progression : 2,5 kg partout sauf le soulevé de terre à 5 kg. */
  inc: number
  /** Répétitions attendues sur le top set. */
  reps: number
  /** Nombre de séries, pour les schémas à volume (bench volume : 3). */
  sets?: number
  /**
   * Échec en attente, à cette charge précise. Un second échec à la même charge
   * déclenche le reset de −7,5 %. `null` = aucun échec en attente.
   */
  fail: number | null
  note?: string
}

/** L'état de départ de chaque séance. */
export interface Targets {
  /** Date de dernière mise à jour, `YYYY-MM-DD`. */
  updatedAt: string
  squat: Target
  bench: Target
  deadlift: Target
  tractions: Target
  benchVol: Target
}

/** Une séance enregistrée. */
export interface Seance {
  /** UUID. Deux séances le même jour restent possibles. */
  id: string
  /** Date de la séance en `YYYY-MM-DD`, distincte de l'instant technique `ts`. */
  date: string
  type: SeanceType
  /** Résumé lisible, dérivé des séries validées à la finalisation. */
  lines: string[]
  /** Top sets par lift, dérivés eux aussi. Contrat de l'export vers Claude. */
  tops: Partial<Record<LiftKey, TopRecord>>
  notes: string
  /** Date approximative (deux séances de juillet reconstituées de mémoire). */
  approx?: boolean
  /**
   * Séance importée du seed : elle n'a que `lines` et `tops`.
   * Ses `lines` ne sont jamais reconverties en séries supposées complètes.
   */
  legacy?: boolean
  /** Séries détaillées. Absentes sur les séances legacy. */
  sets?: SetLog[]
  accessories?: AccessoryLog[]
  /** Instant technique d'enregistrement (epoch ms). */
  ts?: number
}

/**
 * Séance en cours de saisie. Persistée à chaque changement (D9) : un rechargement,
 * une fermeture ou un changement de type ne perd rien.
 */
export interface Draft {
  /** UUID. Devient l'`id` de la séance à la finalisation, ce qui rend celle-ci idempotente. */
  id: string
  date: string
  type: SeanceType
  sets: SetLog[]
  accessories: AccessoryLog[]
  notes: string
  /** Mode pressé : les exercices au-delà du deuxième sont repliés et désactivés. */
  rushed: boolean
  /** Échéance absolue du chrono (epoch ms), pour survivre à une mise en arrière-plan. */
  timerEndsAt: number | null
  /** Libellé affiché sous le chrono (« Récup top set »). */
  timerLabel: string | null
  /**
   * Cibles au moment de l'ouverture du brouillon. Permet de détecter un brouillon
   * fondé sur des cibles devenues obsolètes (ajustement manuel entre-temps).
   */
  baseTargets: Targets
  createdAt: number
  updatedAt: number
}

/** Ce que le moteur a décidé pour un lift, à afficher dans le récapitulatif de fin. */
export interface ProgressionEvent {
  lift: LiftKey
  /** Charge visée au prochain passage. */
  next: number
  /** Charge visée avant cette séance. */
  previous: number
  /**
   * `ajuste` couvre le cas où un succès **fait baisser** la cible, parce qu'il a été
   * obtenu sous la charge visée. L'interface ne doit donc jamais traduire `progresse`
   * en hausse sans comparer `next` et `previous`.
   */
  outcome: 'progresse' | 'ajuste' | 'maintien' | 'second-essai' | 'reset' | 'inchange'
  /** Phrase prête à afficher, en français. */
  message: string
}

/**
 * Trace durable d'un ajustement manuel d'une cible (UGO-172).
 *
 * Sert à répondre, des semaines plus tard, à « pourquoi cette cible est-elle là ? ».
 * Le moteur ne la lit jamais : c'est une mémoire, pas une entrée de calcul. Elle vit
 * en local, hors du format d'échange, comme le journal de progression.
 */
export interface TargetAdjustment {
  /** Date civile de Zurich, au format AAAA-MM-JJ. */
  at: string
  lift: LiftKey
  /** La cible telle qu'elle était avant l'ajustement. */
  before: Target
  /** La cible telle qu'elle est après. */
  after: Target
}
