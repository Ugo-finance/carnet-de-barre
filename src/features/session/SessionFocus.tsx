import { useRef, useState, type TouchEvent } from 'react'
import { FocusSetCard, type FocusRole } from '../../components/FocusSetCard'
import { NumberStepper } from '../../components/NumberStepper'
import { ProgressBar } from '../../components/ProgressBar'
import { RpeChips } from '../../components/RpeChips'
import { TimerCard } from '../../components/TimerCard'
import { Button } from '../../components/Button'
import { BottomSheet } from '../../components/BottomSheet'
import { formatNumber } from '../../domain/format'
import { weightStepFor } from '../../domain/program'
import type { SeanceType, SetLog } from '../../domain/types'
import type { EditableSet } from '../../components/SetCard'
import type { TimerNotificationOptions } from './timer'
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
  notifications?: TimerNotificationOptions
}

type SessionFocusProps = {
  type: SeanceType
  queue: readonly SessionQueueItem[]
  elapsedLabel: string
  writing?: boolean
  errorMessage?: string
  finishing?: boolean
  finishErrorMessage?: string
  timer?: RecoveryTimer
  notes: string
  onSetChange: (setId: string, value: EditableSet) => void
  onValidate: (setId: string, value: EditableSet) => void
  onSkip: (setId: string, value: EditableSet) => void
  onNotesChange: (notes: string) => void
  onFinish: () => void
  onExit: () => void
}

const SWIPE_THRESHOLD_PX = 48

type TouchPoint = { x: number; y: number }

/** Ignore le défilement vertical et les gestes trop courts pour éviter un changement accidentel. */
function swipeStep(start: TouchPoint, end: TouchPoint): -1 | 0 | 1 {
  const horizontal = end.x - start.x
  const vertical = end.y - start.y
  if (Math.abs(horizontal) < SWIPE_THRESHOLD_PX || Math.abs(horizontal) <= Math.abs(vertical))
    return 0
  return horizontal > 0 ? -1 : 1
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
  finishing = false,
  finishErrorMessage,
  timer,
  notes,
  onSetChange,
  onValidate,
  onSkip,
  onNotesChange,
  onFinish,
  onExit,
}: SessionFocusProps) {
  const [viewedSetId, setViewedSetId] = useState<string | null>(null)
  const [showSessionActions, setShowSessionActions] = useState(false)
  const touchStart = useRef<TouchPoint | null>(null)
  const canonical = currentSessionQueueItem(queue)
  const viewedIndex = viewedSetId ? queue.findIndex(({ set }) => set.id === viewedSetId) : -1
  const canonicalIndex = canonical ? queue.findIndex(({ set }) => set.id === canonical.set.id) : -1
  const visibleIndex = viewedIndex >= 0 ? viewedIndex : canonicalIndex
  const visible = visibleIndex >= 0 ? queue[visibleIndex] : undefined
  const progress = sessionQueueProgress(queue)
  const exerciseIds = [...new Set(queue.map(({ exercise }) => exercise.id))]

  if (!visible) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 py-5">
        <section className="rounded-2xl border border-line bg-surface p-5 text-center">
          <h1 className="display text-4xl text-fg">Toutes les séries sont traitées</h1>
          <p className="mt-2 text-sm text-muted">
            Enregistre la séance pour appliquer la progression et fermer le brouillon.
          </p>
        </section>
        {finishErrorMessage ? (
          <p
            className="rounded-xl border border-bad/60 bg-bad/10 p-3 text-sm text-bad"
            role="alert"
          >
            {finishErrorMessage}
          </p>
        ) : null}
        <label className="text-sm font-medium text-muted">
          Notes de séance <span className="font-normal">(facultatif)</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-line bg-surface p-3 text-base text-fg outline-none focus:border-accent"
            value={notes}
            disabled={finishing}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Sensations, durée, matériel, salle…"
          />
        </label>
        <Button className="w-full py-4" disabled={finishing} onClick={onFinish}>
          {finishing ? 'Enregistrement…' : 'Terminer la séance'}
        </Button>
        <Button variant="ghost" className="w-full" disabled={finishing} onClick={onExit}>
          Quitter la vue
        </Button>
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

  const moveReviewCursor = (step: -1 | 1) => {
    // La consultation reste derrière la série canonique. Un geste ne peut jamais
    // contourner une série à faire : il ne fait que relire, puis revenir vers elle.
    const destination = Math.min(visibleIndex + step, canonicalIndex)
    if (destination < 0 || destination >= queue.length || destination === visibleIndex) return
    setViewedSetId(destination === canonicalIndex ? null : (queue[destination]?.set.id ?? null))
  }

  const rememberTouch = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const followSwipe = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch || writing) return
    const step = swipeStep(start, { x: touch.clientX, y: touch.clientY })
    if (step !== 0) moveReviewCursor(step)
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onTouchStart={rememberTouch}
      onTouchEnd={followSwipe}
    >
      <header className="rounded-2xl border border-line bg-surface p-3">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <p className="num text-sm font-bold text-fg">
            Série {position}/{queue.length}
          </p>
          <p className="num text-right text-sm text-muted">{elapsedLabel}</p>
          <Button
            variant="ghost"
            className="shrink-0 px-3 text-sm"
            onClick={() => setShowSessionActions(true)}
          >
            Actions
          </Button>
        </div>
        <div className="mt-1">
          <ProgressBar
            value={progress.completed}
            max={progress.total}
            label="Avancement de la séance"
            valueText={valueText}
          />
        </div>
        <p className="sr-only">
          Séance {type} · Exercice {exercisePosition}/{exerciseIds.length}
        </p>
      </header>

      <section aria-label="Chronomètre">
        {timer ? (
          <TimerCard
            endsAt={timer.endsAt}
            label={timer.label}
            onAdjust={timer.onAdjust}
            onStop={timer.onStop}
            notifications={timer.notifications}
            disabled={writing}
          />
        ) : (
          <aside className="flex min-h-[2.875rem] items-center justify-between rounded-xl border border-line bg-surface px-3 text-sm">
            <span className="font-medium text-muted">Repos libre</span>
            <span className="text-xs text-faint">Pas de chrono sur un palier</span>
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
        status={
          reviewing && (set.status === 'validated' || set.status === 'skipped')
            ? set.status
            : undefined
        }
        primaryLabel={writing ? 'Sauvegarde…' : errorMessage ? 'Réessayer' : 'Valider'}
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

      <BottomSheet
        open={showSessionActions}
        title="Actions de séance"
        onClose={() => setShowSessionActions(false)}
      >
        <p className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-bg px-3 text-sm">
          <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Ensuite</span>
          <span className="text-right font-semibold text-fg">
            {nextLabel(queue[visibleIndex + 1], queue)}
          </span>
        </p>

        <label className="mt-3 block text-sm font-medium text-muted">
          Notes de séance <span className="font-normal">(facultatif)</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-none rounded-xl border border-line bg-bg p-3 text-base text-fg outline-none focus:border-accent"
            aria-label="Notes de séance (facultatif)"
            value={notes}
            disabled={writing}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Sensations, durée, matériel, salle…"
          />
        </label>

        <div className="mt-3 grid gap-2">
          {reviewing ? (
            <Button
              variant="secondary"
              className="w-full"
              disabled={writing}
              onClick={() => {
                setViewedSetId(null)
                setShowSessionActions(false)
              }}
            >
              Retour à la série courante
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              disabled={writing || visibleIndex === 0}
              onClick={() => {
                moveReviewCursor(-1)
                setShowSessionActions(false)
              }}
            >
              Précédente
            </Button>
            <Button
              variant="ghost"
              disabled={writing || finishing}
              onClick={() => {
                setShowSessionActions(false)
                onExit()
              }}
            >
              Quitter la vue
            </Button>
          </div>
          <Button
            variant="danger"
            className="w-full"
            disabled={writing || finishing}
            onClick={() => {
              setShowSessionActions(false)
              onFinish()
            }}
          >
            Terminer la séance
          </Button>
        </div>
      </BottomSheet>
    </main>
  )
}
