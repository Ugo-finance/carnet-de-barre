import { useCallback } from 'react'
import { formatDuration } from '../domain/format'
import { notifyTimerDone, useRecoveryTimer, wakeLockAvailable } from '../features/session/timer'

type TimerCardProps = {
  endsAt: number
  label: string
  keepAwake: boolean
  onAdjust: (deltaMs: number) => void
  onKeepAwakeChange: (enabled: boolean) => void
  onStop: () => void
}

export function TimerCard({
  endsAt,
  label,
  keepAwake,
  onAdjust,
  onKeepAwakeChange,
  onStop,
}: TimerCardProps) {
  const notify = useCallback(() => notifyTimerDone(), [])
  const remaining = useRecoveryTimer(endsAt, notify)
  const available = wakeLockAvailable()

  return (
    <aside className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10 rounded-2xl border border-accent/60 bg-surface p-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted">{label}</p>
          <p className="num text-3xl font-bold text-accent" role="timer" aria-live="off">
            {remaining === 0 ? 'Terminé' : formatDuration(remaining)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-semibold text-fg"
            onClick={() => onAdjust(-30_000)}
          >
            −30 s
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-semibold text-fg"
            onClick={() => onAdjust(30_000)}
          >
            +30 s
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted"
          onClick={onStop}
        >
          Arrêter
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted disabled:opacity-50"
          aria-pressed={keepAwake}
          disabled={!available}
          onClick={() => onKeepAwakeChange(!keepAwake)}
        >
          {available
            ? keepAwake
              ? 'Écran allumé ✓'
              : 'Garder l’écran allumé'
            : 'Veille habituelle'}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Le son et la vibration fonctionnent au premier plan. Pas d’alarme garantie écran verrouillé.
      </p>
    </aside>
  )
}
