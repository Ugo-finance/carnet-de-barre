import { useState } from 'react'
import { FocusSetCard, type FocusRole } from '../../components/FocusSetCard'
import { NumberStepper } from '../../components/NumberStepper'
import { ProgressBar } from '../../components/ProgressBar'
import { RpeChips } from '../../components/RpeChips'
import { TimerCard } from '../../components/TimerCard'
import { Button } from '../../components/Button'
import { formatNumber } from '../../domain/format'
import { weightStepFor } from '../../domain/program'
import type { SeanceType, SetLog } from '../../domain/types'
import type { EditableSet } from '../../components/SetCard'
import {
  currentSessionQueueItem,
  sessionQueueProgress,
  type SessionQueueItem,
} from './sessionQueue'

type RecoveryTimer = {
  endsAt: number
  label: string
  onAdjust: (deltaMs: number) => void
  onStop: () => void
}

type SessionFocusProps = {
  type: SeanceType
  queue: readonly SessionQueueItem[]
  elapsedLabel: string
  writing?: boolean
  errorMessage?: string
  timer?: RecoveryTimer
  onSetChange: (setId: string, value: EditableSet) => void
  onValidate: (setId: string, value: EditableSet) => void
  onSkip: (setId: string, value: EditableSet) => void
  onExit: () => void
}

function presentationRole(item: SessionQueueItem): FocusRole {
  return item.optional ? 'optional' : item.set.role
}

function seriesLabel(item: SessionQueueItem, queue: readonly SessionQueueItem[]): string {
  if (item.set.role === 'warmup') return `palier ${item.set.index + 1}`
  if (item.set.role === 'top') return 'série de travail'

  const count = queue.filter(
    ({ exercise, set }) => exercise.id === item.exercise.id && set.role === item.set.role,
  ).length
  return `série ${item.set.index + 1}/${count}`
}

function loadPresentation(set: SetLog): { load: string; unit?: string } {
  if (set.loadKind === 'bodyweight') return { load: 'PDC' }
  const value = set.weight === null ? '—' : formatNumber(set.weight)
  if (set.loadKind === 'added')
    return { load: set.weight === null ? value : `+${value}`, unit: 'kg de lest' }
  if (set.loadKind === 'perDumbbell') return { load: value, unit: 'kg/haltère' }
  return { load: value, unit: 'kg' }
}

function nextLabel(item: SessionQueueItem | undefined, queue: readonly SessionQueueItem[]): string {
  return item ? `${item.exercise.label} · ${seriesLabel(item, queue)}` : 'Fin de séance'
}

function editable(set: SetLog, change: Partial<EditableSet>): EditableSet {
  return {
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe,
    status: 'entered',
    ...change,
  }
}

/** Écran actif : la file reste dérivée du brouillon et une seule série est rendue. */
export function SessionFocus({
  type,
  queue,
  elapsedLabel,
  writing = false,
  errorMessage,
  timer,
  onSetChange,
  onValidate,
  onSkip,
  onExit,
}: SessionFocusProps) {
  const [viewedSetId, setViewedSetId] = useState<string | null>(null)
  const canonical = currentSessionQueueItem(queue)
  const viewedIndex = viewedSetId ? queue.findIndex(({ set }) => set.id === viewedSetId) : -1
  const canonicalIndex = canonical ? queue.findIndex(({ set }) => set.id === canonical.set.id) : -1
  const visibleIndex = viewedIndex >= 0 ? viewedIndex : canonicalIndex
  const visible = visibleIndex >= 0 ? queue[visibleIndex] : undefined
  const progress = sessionQueueProgress(queue)
  const exerciseIds = [...new Set(queue.map(({ exercise }) => exercise.id))]

  if (!visible) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center py-5">
        <p role="status" className="text-sm font-semibold text-muted">
          Toutes les séries sont traitées.
        </p>
      </main>
    )
  }

  const set = visible.set
  const load = loadPresentation(set)
  const reviewing = canonical !== null && canonical.set.id !== set.id
  const position = visibleIndex + 1
  const exercisePosition = exerciseIds.indexOf(visible.exercise.id) + 1
  const valueText = `${progress.completed}/${progress.total} séries traitées`
  const canSkip = set.role === 'warmup' || visible.optional
  const canShowBarbell = set.loadKind === 'barTotal' && set.weight !== null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="num text-sm font-bold text-fg">
            Série {position}/{queue.length}
          </p>
          <p className="num text-sm text-muted">{elapsedLabel}</p>
        </div>
        <div className="mt-2">
          <ProgressBar
            value={progress.completed}
            max={progress.total}
            label="Avancement de la séance"
            valueText={valueText}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Séance {type} · Exercice {exercisePosition}/{exerciseIds.length}
        </p>
      </header>

      <section className="min-h-[11rem]" aria-label="Chronomètre">
        {timer ? (
          <TimerCard
            endsAt={timer.endsAt}
            label={timer.label}
            onAdjust={timer.onAdjust}
            onStop={timer.onStop}
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

      <FocusSetCard
        role={presentationRole(visible)}
        exercise={visible.exercise.label}
        seriesLabel={seriesLabel(visible, queue)}
        load={load.load}
        unit={load.unit}
        loadDetail={
          set.targetReps === null
            ? undefined
            : `Cible : ${formatNumber(set.targetReps)} répétitions`
        }
        barbellTotal={canShowBarbell ? (set.weight ?? undefined) : undefined}
        supersetPartner={visible.supersetPartner}
        primaryLabel={writing ? 'Sauvegarde…' : 'Valider'}
        skipLabel={set.role === 'warmup' ? 'Passer ce palier' : 'Sauter — optionnel'}
        busy={writing}
        errorMessage={errorMessage}
        onPrimary={() => onValidate(set.id, { ...editable(set, {}), status: 'validated' })}
        onSkip={
          canSkip ? () => onSkip(set.id, { ...editable(set, {}), status: 'skipped' }) : undefined
        }
      >
        <div className={`grid gap-2 ${set.loadKind === 'bodyweight' ? '' : 'grid-cols-2'}`}>
          {set.loadKind === 'bodyweight' ? null : (
            <NumberStepper
              label="Poids"
              value={set.weight}
              step={weightStepFor(set.loadKind)}
              unit={load.unit}
              disabled={writing}
              onChange={(weight) => onSetChange(set.id, editable(set, { weight }))}
            />
          )}
          <NumberStepper
            label="Répétitions"
            value={set.reps}
            step={1}
            disabled={writing}
            onChange={(reps) => onSetChange(set.id, editable(set, { reps }))}
          />
        </div>
        {set.role === 'top' ? (
          <div className="mt-3">
            <RpeChips
              value={set.rpe}
              disabled={writing}
              onChange={(rpe) => onSetChange(set.id, editable(set, { rpe }))}
            />
          </div>
        ) : null}
      </FocusSetCard>

      <p className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 text-sm">
        <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Ensuite</span>
        <span className="text-right font-semibold text-fg">
          {nextLabel(queue[visibleIndex + 1], queue)}
        </span>
      </p>

      {reviewing ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={writing}
          onClick={() => setViewedSetId(null)}
        >
          Retour à la série courante
        </Button>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        <Button
          variant="ghost"
          disabled={writing || visibleIndex === 0}
          onClick={() => setViewedSetId(queue[visibleIndex - 1]?.set.id ?? null)}
        >
          Précédente
        </Button>
        <Button variant="ghost" disabled={writing} onClick={onExit}>
          Quitter la vue
        </Button>
      </div>
    </main>
  )
}
