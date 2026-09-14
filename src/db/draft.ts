/**
 * Construction d'une séance à saisir — CB-31.
 *
 * Fabrique le brouillon d'une séance à partir des cibles courantes : chaque série
 * arrive **pré-remplie**, ce qui est la condition du « valider en un tap ». Rien
 * n'est saisi pour autant : toutes les séries partent en statut `planned`, et seul
 * `status` prouvera une réalisation.
 *
 * Fonction pure : elle ne touche ni la base ni l'horloge au-delà de l'horodatage
 * qu'on lui passe.
 */

import { SEANCES, type ExerciseDef } from '../domain/program.ts'
import { accessoryPlans } from './accessory-history.ts'
import { warmupPlan } from '../domain/warmup.ts'
import type { AccessoryPlan } from '../domain/accessory.ts'
import { backoffWeight } from '../domain/progression.ts'
import type { Draft, Seance, SeanceType, SetLog, Targets } from '../domain/types.ts'
import type { Preferences } from '../domain/preferences.ts'

/**
 * Identifiant de série, déterministe et unique dans la séance.
 *
 * Deux constructions du même brouillon donnent les mêmes identifiants : reprendre un
 * brouillon ne renumérote rien, et le schéma d'export exige justement l'unicité des
 * identifiants de série au sein d'une séance.
 */
export function setId(exerciseId: string, role: SetLog['role'], index: number): string {
  return `${exerciseId}:${role}:${index}`
}

/** Répétitions à proposer : la cible si elle existe, sinon le bas de la fourchette. */
function suggestedReps(exercise: ExerciseDef): number | null {
  if (exercise.reps != null) return exercise.reps
  if (exercise.repsRange) return exercise.repsRange[0]
  return null
}

function blankSet(
  exercise: ExerciseDef,
  role: SetLog['role'],
  index: number,
  weight: number | null,
  reps: number | null,
): SetLog {
  return {
    id: setId(exercise.id, role, index),
    exerciseId: exercise.id,
    role,
    index,
    status: 'planned',
    loadKind: exercise.loadKind,
    weight,
    reps,
    rpe: null,
    targetWeight: weight,
    targetReps: reps,
  }
}

/**
 * Les paliers d'échauffement d'un exercice, prêts à valider — CB-56.
 *
 * `workWeight` est la charge de la série de travail, celle-là même que porteront les
 * séries qui suivent : la cible du jour pour un lift, la charge proposée pour un
 * accessoire. Les paliers se dérivent donc **de ce qu'Ugo va réellement faire**, pas de
 * la table — un accessoire dont le moteur a fait monter la charge voit son échauffement
 * monter avec elle, sans qu'on ait à y penser.
 */
function warmupSetsFor(exercise: ExerciseDef, workWeight: number | null): SetLog[] {
  return warmupPlan(exercise.warmup, exercise.loadKind, workWeight).map((palier, index) =>
    blankSet(exercise, 'warmup', index, palier.weight, palier.reps),
  )
}

/** Les séries d'un exercice, dans l'ordre où elles seront faites. */
export function setsForExercise(
  exercise: ExerciseDef,
  targets: Targets,
  plan?: AccessoryPlan,
): SetLog[] {
  const target = exercise.lift ? targets[exercise.lift] : undefined

  if (exercise.kind === 'topset' && target) {
    const top = blankSet(exercise, 'top', 0, target.w, target.reps)
    const backoffs: SetLog[] = []
    if (exercise.backoff) {
      const charge = backoffWeight(target.w, exercise.backoff)
      for (let index = 0; index < exercise.backoff.count; index += 1) {
        backoffs.push(blankSet(exercise, 'backoff', index, charge, exercise.backoff.reps))
      }
    }
    return [...warmupSetsFor(exercise, target.w), top, ...backoffs]
  }

  if (exercise.kind === 'volume' && target) {
    const count = target.sets ?? exercise.sets
    return [
      ...warmupSetsFor(exercise, target.w),
      ...Array.from({ length: count }, (_, index) =>
        blankSet(exercise, 'volume', index, target.w, target.reps),
      ),
    ]
  }

  if (exercise.kind === 'accessory') {
    // La charge vient du **plan** quand on en a un — c'est-à-dire de ce qu'Ugo a fait,
    // pas de la table. Sans plan, on retombe sur la valeur de départ : c'est ce que
    // faisait l'app avant CB-45, et c'est le défaut qu'il a vu en salle, son incliné
    // affichant 20 kg pendant qu'il en tirait 24.
    //
    // Un exercice au poids du corps n'a pas de charge à porter, plan ou pas.
    const proposee = plan ? plan.weight : (exercise.suggestedWeight ?? null)
    const charge = exercise.loadKind === 'bodyweight' ? null : proposee
    return [
      ...warmupSetsFor(exercise, charge),
      ...Array.from({ length: exercise.sets }, (_, index) =>
        blankSet(
          exercise,
          'accessory',
          index,
          charge,
          plan?.reps[index] ?? suggestedReps(exercise),
        ),
      ),
    ]
  }

  // Un `topset` ou un `volume` dont la cible manque : le moteur n'a rien à proposer, et
  // une série sans charge ni répétitions ne vaut pas mieux qu'aucune série. Depuis CB-69,
  // aucun exercice n'arrive ici par son genre — les optionnels sont des accessoires.
  return []
}

/**
 * Un brouillon complet, prêt à être affiché et validé série par série.
 *
 * `rushed` n'enlève aucune série : le mode pressé replie et désactive l'affichage des
 * exercices au-delà du deuxième, mais une série déjà saisie ne doit jamais disparaître
 * parce qu'on a basculé un interrupteur.
 */
export function buildDraft(
  type: SeanceType,
  date: string,
  targets: Targets,
  options: {
    id: string
    now?: number
    seances?: readonly Seance[]
    /**
     * Les réglages d'Ugo, qui décident de l'**état d'ouverture** de la séance — CB-62.
     *
     * Absents, on retombe sur le comportement d'avant : écran non maintenu, affichage
     * complet. Un défaut muet plutôt qu'un défaut inventé.
     */
    preferences?: Pick<Preferences, 'ecranAllume' | 'modePresseParDefaut'>
  } = {
    id: crypto.randomUUID(),
  },
): Draft {
  const now = options.now ?? Date.now()
  const seance = SEANCES[type]
  // Sans historique, les plans sont vides et chaque accessoire retombe sur la charge
  // de la table. Le défaut est donc le comportement d'avant CB-45, jamais une erreur.
  const plans = accessoryPlans(seance.exercises, options.seances ?? [])

  return {
    id: options.id,
    date,
    type,
    sets: seance.exercises.flatMap((exercise) =>
      setsForExercise(exercise, targets, plans.get(exercise.id)),
    ),
    // Vide depuis CB-69 : les optionnels sont des séries comme les autres, et se notent
    // dans `sets`. Le champ demeure au contrat pour les **séances déjà enregistrées**,
    // qui en portent et dont le résumé se relit avec la fonction qui l'a produit.
    accessories: [],
    notes: '',
    rushed: options.preferences?.modePresseParDefaut ?? false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: options.preferences?.ecranAllume ?? false,
    baseTargets: structuredClone(targets),
    // Ouvrir n'est pas démarrer : l'accueil construit un brouillon au simple affichage.
    startedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Un brouillon tel qu'il a pu être **écrit par une version antérieure** de l'app.
 *
 * Les brouillons ne passent par aucun schéma : ils sont relus tels qu'écrits. Un champ
 * ajouté est donc absent de toute ligne déjà en base, y compris celle d'une séance
 * ouverte au moment de la mise à jour.
 */
export type StoredDraft = Omit<Draft, 'keepAwake' | 'startedAt'> &
  Partial<Pick<Draft, 'keepAwake' | 'startedAt'>>

/**
 * Complète une ligne relue avec les champs apparus depuis qu'elle a été écrite.
 *
 * Le défaut est appliqué **au point de lecture**, une fois, plutôt que déclaré optionnel
 * dans le contrat : sinon chaque lecteur devrait penser à l'absence, et le premier qui
 * l'oublierait traiterait `undefined` comme une valeur. Après cette fonction, le type
 * `Draft` dit la vérité pour tout le monde en aval.
 */
export function hydrateDraft(row: StoredDraft): Draft {
  return {
    ...row,
    keepAwake: row.keepAwake ?? false,
    startedAt: row.startedAt ?? null,
    notes: fusionnerAccessoires(row),
    accessories: [],
  }
}

/**
 * Ce qu'Ugo avait écrit dans les accessoires libres, rapatrié dans les notes de séance
 * — CB-69.
 *
 * Depuis ce lot, l'écran de séance ne rend plus de champ d'accessoire : les optionnels
 * sont des séries. Une ligne déjà en base peut pourtant en porter, cochés ou annotés,
 * et les laisser dans le brouillon reviendrait à les effacer — le champ existe, plus
 * rien ne l'affiche. On les replie donc là où Ugo les relira.
 *
 * Le pliage a lieu **au point de lecture**, comme le défaut de `keepAwake`, et il est
 * idempotent : `accessories` repart vide, donc une relecture du brouillon replié
 * n'ajoute rien. Seuls les accessoires porteurs d'une information passent — un
 * `{ done: false, note: '' }` n'a jamais rien dit.
 */
function fusionnerAccessoires(row: StoredDraft): string {
  const portes = (row.accessories ?? []).filter(
    (accessory) => accessory.done || accessory.note.trim() !== '',
  )
  if (portes.length === 0) return row.notes

  const lignes = portes.map((accessory) => {
    const label = SEANCES[row.type].exercises.find(
      (exercise) => exercise.id === accessory.exerciseId,
    )?.label
    const nom = label ?? accessory.exerciseId
    return accessory.note.trim() === '' ? `${nom} ✓` : `${nom} : ${accessory.note.trim()}`
  })

  return [row.notes.trim(), ...lignes].filter((ligne) => ligne !== '').join('\n')
}

/**
 * Un brouillon **jamais touché** : aucune série saisie, validée ou sautée, aucun
 * accessoire coché ou annoté, aucune note, aucun chrono lancé.
 *
 * Il ne porte donc aucune information. C'est ce qui autorise à le reconstruire sur
 * de nouvelles cibles sans rien perdre — la distinction entre « une séance est en
 * cours » et « l'app a ouvert un brouillon toute seule à l'affichage ».
 *
 * Le chrono compte : il n'est lancé que par la validation d'une série, donc un chrono
 * en cours prouve qu'une séance a commencé même si tout a été remis à `planned`
 * depuis. Mieux vaut refuser à tort que reconstruire une séance réelle.
 */
export function isBlankDraft(draft: Draft): boolean {
  return !porteUneInformation(draft)
}

/** Ce que `isBlankDraft` nie, sur la forme minimale qui suffit à en juger. */
function porteUneInformation(
  porteur: Pick<Draft, 'sets' | 'accessories' | 'notes' | 'timerEndsAt'>,
): boolean {
  return !(
    porteur.sets.every((set) => set.status === 'planned') &&
    porteur.accessories.every((accessory) => !accessory.done && accessory.note.trim() === '') &&
    porteur.notes.trim() === '' &&
    porteur.timerEndsAt === null
  )
}

/**
 * Marque la séance comme **démarrée**, une fois pour toutes — CB-62.
 *
 * Idempotente : reprendre une séance après un rechargement, ou taper deux fois sur
 * « Démarrer », ne redate rien. Le premier instant est le bon, et un second geste ne
 * peut que raccourcir une durée réelle.
 */
export function startDraft(draft: Draft, now = Date.now()): Draft {
  if (draft.startedAt !== null) return draft
  return { ...draft, startedAt: now }
}

/**
 * Ce brouillon-là sert-il la demande de démarrage ? — CB-62a.
 *
 * Deux cas, et ils ne se ressemblent pas.
 *
 * Un brouillon **actif** gagne toujours : D9 dit que rien ne se perd, et démarrer une
 * séance ne doit jamais effacer une saisie en cours. Demander A pendant qu'une C est
 * commencée rend la C — c'est à l'interface de proposer explicitement de l'abandonner.
 *
 * Un brouillon **vierge** ne porte aucune information, donc rien à protéger. Le
 * réutiliser quand même annulerait le choix manuel : Ugo sélectionne B, l'app démarre
 * A — celle que l'accueil avait construite toute seule en s'affichant — et sa date avec.
 * Il n'est donc réutilisable que s'il sert déjà le type **et** la date demandés.
 *
 * P1 de Codex sur #54, reproduit : `openDraft('A', 15.09)` puis
 * `startSession('B', 17.09)` rendait A au 15.
 */
export function reutilisable(draft: Draft, type: SeanceType, date: string): boolean {
  if (isDraftActive(draft)) return true
  return draft.type === type && draft.date === date
}

/**
 * Le brouillon repris, avec le mode pressé choisi sur l'accueil — CB-62b.
 *
 * Les deux sortes de brouillon réutilisable ne se traitent pas pareil, et c'est le
 * dernier endroit où l'oubli était possible :
 *
 * - **actif** : son mode est celui qu'Ugo a réglé en salle. Reprendre n'est pas
 *   recommencer, et l'accueil ne rouvre pas une file qu'il a repliée ;
 * - **vierge** : il ne porte aucune information, seulement une identité. Le choix de
 *   l'accueil s'y applique — sans quoi un brouillon laissé par un affichage antérieur,
 *   ou par l'ancienne interface sur le téléphone, imposerait son mode au démarrage.
 *
 * Option absente : on ne décide rien, le mode courant reste. P1 de Codex sur #55.
 */
export function reprendreAvecMode(draft: Draft, rushed: boolean | undefined): Draft {
  if (rushed === undefined || isDraftActive(draft)) return draft
  return { ...draft, rushed }
}

/**
 * « Une séance est-elle en cours ? » — la question unique, à un seul endroit.
 *
 * Cinq appelants y répondaient par `!isBlankDraft(...)`, c'est-à-dire par « ce
 * brouillon porte-t-il une information ? ». C'était un détour : un brouillon
 * **démarré** mais dont rien n'est encore validé est une séance en cours, et l'ancien
 * critère répondait non. Ugo debout devant la barre, l'app se croyait libre de
 * reconstruire son brouillon sur de nouvelles cibles.
 *
 * Les deux critères sont gardés, et c'est délibéré. `startedAt` est la vérité, mais
 * rien ne le pose encore — le démarrage explicite arrive avec l'accueil v2 (CB-63).
 * Retirer le repli maintenant rendrait toute séance en cours invisible d'ici là. Une
 * fois CB-63 livré, le repli ne couvre plus que les brouillons ouverts avant.
 */
export function isDraftActive(draft: Draft): boolean {
  return draft.startedAt !== null || porteUneInformation(draft)
}
