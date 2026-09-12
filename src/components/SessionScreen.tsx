import { formatDate, formatLoad, formatNumber } from '../domain/format'
import { describePlates, platesPerSide } from '../domain/plates'
import { SEANCES, type ExerciseDef } from '../domain/program'
import type { AccessoryLog, Draft, SeanceType, SetLog } from '../domain/types'
import { SetCard, type EditableSet } from './SetCard'

const TYPES: readonly SeanceType[] = ['A', 'B', 'C']

const SET_ROLE_LABELS: Record<SetLog['role'], string> = {
  top: 'Top set',
  backoff: 'Backoff',
  volume: 'Série',
  accessory: 'Série',
}

type SessionScreenProps = {
  draft: Draft
  whenLabel: string
  onSelectType: (type: SeanceType) => void
  onSetChange: (setId: string, value: EditableSet) => void
  onAccessoryChange: (exerciseId: string, value: Pick<AccessoryLog, 'done' | 'note'>) => void
  errorMessage?: string
}

function setLabel(set: SetLog): string {
  const base = SET_ROLE_LABELS[set.role]
  return set.role === 'top' ? base : `${base} ${set.index + 1}`
}

function targetFor(exercise: ExerciseDef, sets: SetLog[]): { value: string; detail: string } {
  if (exercise.kind === 'optional') return { value: 'Optionnel', detail: 'si tu as le temps' }
  if (exercise.loadKind === 'bodyweight') {
    return { value: 'Poids du corps', detail: exercise.scheme }
  }

  const target = sets[0]?.targetWeight ?? null
  if (target === null) return { value: 'À renseigner', detail: exercise.scheme }

  const reps = sets[0]?.targetReps
  return {
    value: formatLoad(target, exercise.loadKind),
    detail:
      reps === null || reps === undefined ? exercise.scheme : `× ${formatNumber(reps)} · cible`,
  }
}

function OptionalExercise({
  exercise,
  value,
  onChange,
}: {
  exercise: ExerciseDef
  value: AccessoryLog
  onChange: (value: Pick<AccessoryLog, 'done' | 'note'>) => void
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4" aria-label={exercise.label}>
      <div className="flex items-start gap-3">
        <input
          aria-label={`${exercise.label} réalisé`}
          className="min-h-11 min-w-11 accent-accent"
          type="checkbox"
          checked={value.done}
          onChange={(event) => onChange({ done: event.target.checked, note: value.note })}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{exercise.label}</h2>
          <p className="mt-0.5 text-sm text-muted">{exercise.scheme} · optionnel</p>
          <label className="mt-3 block text-sm font-medium text-muted">
            Charge, reps ou remarque
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
              type="text"
              value={value.note}
              placeholder="À renseigner"
              onChange={(event) => onChange({ done: value.done, note: event.target.value })}
            />
          </label>
        </div>
      </div>
    </article>
  )
}

function ExerciseCard({
  exercise,
  sets,
  onSetChange,
}: {
  exercise: ExerciseDef
  sets: SetLog[]
  onSetChange: (setId: string, value: EditableSet) => void
}) {
  const target = targetFor(exercise, sets)
  const barTarget =
    exercise.loadKind === 'barTotal' && sets[0]?.targetWeight != null
      ? describePlates(platesPerSide(sets[0].targetWeight))
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

      <div className="mt-4 grid gap-3">
        {sets.map((set) => (
          <SetCard
            key={set.id}
            label={setLabel(set)}
            value={set}
            onChange={(value) => onSetChange(set.id, value)}
            onValidate={(value) => onSetChange(set.id, value)}
            onSkip={(value) => onSetChange(set.id, value)}
            showWeight={set.loadKind !== 'bodyweight'}
            showRpe={set.role === 'top' || (set.role === 'volume' && set.index === sets.length - 1)}
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
  onAccessoryChange,
  errorMessage,
}: SessionScreenProps) {
  const definition = SEANCES[draft.type]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 py-4 pb-8">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-accent">{whenLabel}</p>
            <h1 className="text-xl font-bold">Séance {draft.type}</h1>
          </div>
          <time className="num text-sm text-muted" dateTime={draft.date}>
            {formatDate(draft.date)}
          </time>
        </div>
        <p className="mt-1 text-sm text-muted">{definition.title}</p>

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
                  selected ? 'bg-accent text-bg' : 'text-muted'
                }`}
                aria-pressed={selected}
                onClick={() => onSelectType(type)}
              >
                Séance {type}
              </button>
            )
          })}
        </nav>
        {errorMessage ? (
          <p
            className="mt-3 rounded-xl border border-bad/60 bg-bad/10 p-3 text-sm text-fg"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </header>

      <section className="grid gap-3" aria-label={`Exercices de la séance ${draft.type}`}>
        {definition.exercises.map((exercise) => {
          const sets = draft.sets.filter((set) => set.exerciseId === exercise.id)
          if (exercise.kind === 'optional') {
            const value = draft.accessories.find(
              (accessory) => accessory.exerciseId === exercise.id,
            ) ?? { exerciseId: exercise.id, done: false, note: '' }
            return (
              <OptionalExercise
                key={exercise.id}
                exercise={exercise}
                value={value}
                onChange={(next) => onAccessoryChange(exercise.id, next)}
              />
            )
          }

          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              sets={sets}
              onSetChange={onSetChange}
            />
          )
        })}
      </section>
    </main>
  )
}

export type { SessionScreenProps }
