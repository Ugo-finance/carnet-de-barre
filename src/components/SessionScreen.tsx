import { formatDate, formatLoad, formatNumber } from '../domain/format'
import { describePlates, platesPerSide } from '../domain/plates'
import { SEANCES, weightStepFor, type ExerciseDef } from '../domain/program'
import type { AccessoryLog, Draft, SeanceType, SetLog } from '../domain/types'
import { wakeLockAvailable } from '../features/session/timer'
import { SetCard, type EditableSet } from './SetCard'
import { TimerCard } from './TimerCard'
import { WarmupBlock } from './WarmupBlock'

const TYPES: readonly SeanceType[] = ['A', 'B', 'C']

const SET_ROLE_LABELS: Record<SetLog['role'], string> = {
  top: 'Top set',
  backoff: 'Backoff',
  volume: 'Série',
  accessory: 'Série',
  warmup: 'Échauffement',
}

type SessionScreenProps = {
  draft: Draft
  whenLabel: string
  onSelectType: (type: SeanceType) => void
  onSetChange: (setId: string, value: EditableSet) => void
  onSetValidate: (
    setId: string,
    value: EditableSet,
    /** `null` pour un palier d'échauffement : le repos en cours n'est pas touché. */
    timer: { seconds: number; label: string } | null,
  ) => void
  onAccessoryChange: (exerciseId: string, value: Pick<AccessoryLog, 'done' | 'note'>) => void
  onNotesChange: (notes: string) => void
  onTimerAdjust: (deltaMs: number) => void
  keepAwake: boolean
  onKeepAwakeChange: (enabled: boolean) => void
  onTimerStop: () => void
  onFinish: () => void
  finishing?: boolean
  finishErrorMessage?: string
  errorMessage?: string
}

function setLabel(set: SetLog): string {
  const base = SET_ROLE_LABELS[set.role]
  return set.role === 'top' ? base : `${base} ${set.index + 1}`
}

/**
 * Les séries de travail d'un exercice, paliers d'échauffement exclus — CB-56.
 *
 * Tout ce qui **décrit** l'exercice se lit ici, et jamais dans `sets[0]` : depuis que le
 * brouillon porte des paliers, la première série d'un exercice est son échauffement. Sans
 * cette distinction, l'en-tête du soulevé de terre annonce 60 kg au lieu de 92,5, ses
 * plaques sont celles du palier, et l'incliné affiche 14 au lieu de 24.
 */
function workingSetsOf(sets: SetLog[]): SetLog[] {
  return sets.filter((set) => set.role !== 'warmup')
}

function targetFor(exercise: ExerciseDef, sets: SetLog[]): { value: string; detail: string } {
  if (exercise.loadKind === 'bodyweight') {
    return { value: 'Poids du corps', detail: exercise.scheme }
  }

  const travail = workingSetsOf(sets)
  const target = travail[0]?.targetWeight ?? null
  if (target === null) return { value: 'À renseigner', detail: exercise.scheme }

  const reps = travail[0]?.targetReps
  return {
    value: formatLoad(target, exercise.loadKind),
    detail:
      reps === null || reps === undefined ? exercise.scheme : `× ${formatNumber(reps)} · cible`,
  }
}

function ExerciseCard({
  exercise,
  sets,
  onSetChange,
  onSetValidate,
}: {
  exercise: ExerciseDef
  sets: SetLog[]
  onSetChange: (setId: string, value: EditableSet) => void
  onSetValidate: SessionScreenProps['onSetValidate']
}) {
  const target = targetFor(exercise, sets)
  // Les plaques annoncées en tête sont celles de la **série de travail**. Celles de chaque
  // palier restent sur sa propre carte ; c'est la charge du jour qu'Ugo cherche ici.
  const travail = workingSetsOf(sets)
  const warmups = sets.filter((set) => set.role === 'warmup')
  const barTarget =
    exercise.loadKind === 'barTotal' && travail[0]?.targetWeight != null
      ? describePlates(platesPerSide(travail[0].targetWeight))
      : null

  return (
    <article className="rounded-2xl border border-line bg-surface p-4" aria-label={exercise.label}>
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{exercise.label}</h2>
            <p className="mt-0.5 text-sm text-muted">{exercise.scheme}</p>
          </div>
          {exercise.supersetGroup ? (
            <span className="shrink-0 rounded-full border border-line px-2 py-1 text-xs text-muted">
              Superset
            </span>
          ) : null}
        </div>
        <p className="num mt-4 break-words text-3xl font-bold leading-none">{target.value}</p>
        <p className="mt-1 text-sm text-muted">{target.detail}</p>
        {barTarget ? <p className="mt-2 text-sm font-medium text-fg">{barTarget}</p> : null}
      </header>

      <WarmupBlock
        exerciseLabel={exercise.label}
        loadKind={exercise.loadKind}
        sets={warmups}
        onSetChange={onSetChange}
        onSetValidate={(setId, value) => onSetValidate(setId, value, null)}
      />

      <div className="mt-4 grid gap-3">
        {travail.map((set) => (
          <SetCard
            key={set.id}
            label={setLabel(set)}
            value={set}
            onChange={(value) => onSetChange(set.id, value)}
            onValidate={(value) =>
              onSetValidate(set.id, value, {
                seconds: exercise.restSeconds,
                label: `Récup ${exercise.label}`,
              })
            }
            onSkip={(value) => onSetChange(set.id, value)}
            showWeight={set.loadKind !== 'bodyweight'}
            showRpe={
              set.role === 'top' ||
              // La dernière série **de travail**, et non la dernière du tableau : les
              // paliers gonflaient le total et faisaient disparaître la saisie du RPE.
              (set.role === 'volume' && set.index === travail.length - 1)
            }
            weightStep={weightStepFor(exercise.loadKind)}
          />
        ))}
      </div>
    </article>
  )
}

export function SessionScreen({
  draft,
  whenLabel,
  onSelectType,
  onSetChange,
  onSetValidate,
  // `onAccessoryChange` reste au contrat du composant, et `SessionHome` le passe encore :
  // le brouillon porte toujours `accessories` pour les séances déjà enregistrées. Plus
  // rien ne l'appelle depuis CB-69, les optionnels étant des séries.
  onNotesChange,
  onTimerAdjust,
  keepAwake,
  onKeepAwakeChange,
  onTimerStop,
  onFinish,
  finishing = false,
  finishErrorMessage,
  errorMessage,
}: SessionScreenProps) {
  const definition = SEANCES[draft.type]
  const canKeepAwake = wakeLockAvailable()
  const warmupCount = draft.sets.filter((set) => set.role === 'warmup').length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 py-4 pb-8">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-accent-readable">{whenLabel}</p>
            <h1 className="text-xl font-bold">Séance {draft.type}</h1>
          </div>
          <time className="num text-sm text-muted" dateTime={draft.date}>
            {formatDate(draft.date)}
          </time>
        </div>
        <p className="mt-1 text-sm text-muted">{definition.title}</p>
        {warmupCount > 0 ? (
          <p className="mt-2 text-sm font-medium text-accent-readable">
            Échauffement · {warmupCount} {warmupCount === 1 ? 'palier' : 'paliers'}
          </p>
        ) : null}

        <nav
          className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1"
          aria-label="Choisir une séance"
        >
          {TYPES.map((type) => {
            const selected = type === draft.type
            return (
              <button
                key={type}
                type="button"
                className={`min-h-11 rounded-lg px-3 font-semibold ${
                  selected ? 'bg-accent-action text-white' : 'text-muted'
                }`}
                aria-pressed={selected}
                onClick={() => onSelectType(type)}
              >
                Séance {type}
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          className="mt-2 min-h-11 w-full rounded-xl border border-line px-3 text-sm font-medium text-muted disabled:opacity-50"
          aria-pressed={keepAwake}
          disabled={!canKeepAwake}
          onClick={() => onKeepAwakeChange(!keepAwake)}
        >
          {canKeepAwake
            ? keepAwake
              ? 'Écran allumé ✓'
              : 'Garder l’écran allumé'
            : 'Veille habituelle'}
        </button>
        {errorMessage ? (
          <p
            className="mt-3 rounded-xl border border-bad/60 bg-bad/10 p-3 text-sm text-fg"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </header>

      <section
        className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10 min-h-[11rem]"
        aria-label="Chronomètre"
      >
        {draft.timerEndsAt !== null && draft.timerLabel ? (
          <TimerCard
            endsAt={draft.timerEndsAt}
            label={draft.timerLabel}
            onAdjust={onTimerAdjust}
            onStop={onTimerStop}
          />
        ) : (
          <aside className="flex min-h-[11rem] items-center justify-center rounded-2xl border border-line bg-surface p-3 text-center">
            <div>
              <p className="num text-3xl font-bold text-muted" aria-hidden="true">
                —
              </p>
              <p className="mt-1 text-sm font-medium text-muted">Repos libre</p>
            </div>
          </aside>
        )}
      </section>

      <section className="grid gap-3" aria-label={`Exercices de la séance ${draft.type}`}>
        {definition.exercises.map((exercise) => {
          const sets = draft.sets.filter((set) => set.exerciseId === exercise.id)

          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              sets={sets}
              onSetChange={onSetChange}
              onSetValidate={onSetValidate}
            />
          )
        })}
      </section>

      <section className="mt-2 flex flex-col gap-3 border-t border-line pt-5">
        <label className="text-sm font-medium text-muted">
          Notes de séance <span className="font-normal">(facultatif)</span>
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-line bg-surface p-3 text-base text-fg outline-none focus:border-accent"
            value={draft.notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Sensations, durée, matériel, salle…"
          />
        </label>

        {finishErrorMessage ? (
          <p className="rounded-xl border border-bad/60 bg-bad/10 p-3 text-sm text-fg" role="alert">
            {finishErrorMessage}
          </p>
        ) : null}

        <button
          type="button"
          className="min-h-12 rounded-xl bg-accent-action px-4 font-bold text-white disabled:opacity-50"
          onClick={onFinish}
          disabled={finishing}
        >
          {finishing ? 'Enregistrement…' : 'Terminer la séance'}
        </button>
      </section>
    </main>
  )
}

export type { SessionScreenProps }
