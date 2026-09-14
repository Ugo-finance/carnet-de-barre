import { useCallback } from 'react'
import { formatDuration } from '../domain/format'
import { notifyTimerDone, useRecoveryTimer } from '../features/session/timer'

type TimerCardProps = {
  endsAt: number
  label: string
  onAdjust: (deltaMs: number) => void
  onStop: () => void
  disabled?: boolean
}

export function TimerCard({ endsAt, label, onAdjust, onStop, disabled = false }: TimerCardProps) {
  const notify = useCallback(() => notifyTimerDone(), [])
  const remaining = useRecoveryTimer(endsAt, notify)

  return (
    <aside className="rounded-xl border border-accent/60 bg-surface px-2 shadow-xl">
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)] items-center gap-1">
        <div className="min-w-0">
          <p className="truncate text-[0.6875rem] leading-3 font-medium text-muted">{label}</p>
          <p className="num text-xl leading-5 font-bold text-accent" role="timer" aria-live="off">
            {remaining === 0 ? 'Terminé' : formatDuration(remaining)}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          className="min-h-11 rounded-xl border border-line px-1 text-xs font-semibold text-fg"
          onClick={() => onAdjust(-30_000)}
        >
          −30 s
        </button>
        <button
          type="button"
          disabled={disabled}
          className="min-h-11 rounded-xl border border-line px-1 text-xs font-semibold text-fg"
          onClick={() => onAdjust(30_000)}
        >
          +30 s
        </button>
        <button
          type="button"
          disabled={disabled}
          className="min-h-11 rounded-xl border border-line px-1 text-lg font-semibold text-muted"
          aria-label="Arrêter"
          onClick={onStop}
        >
          ×
        </button>
      </div>
      <p className="sr-only">
        Le son et la vibration fonctionnent au premier plan. Pas d’alarme garantie écran verrouillé.
      </p>
    </aside>
  )
}
