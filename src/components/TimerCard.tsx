import { useCallback, useEffect, useState } from 'react'
import { formatDuration } from '../domain/format'
import { notifyTimerDone, useRecoveryTimer } from '../features/session/timer'
import type { TimerNotificationOptions } from '../features/session/timer'

import { RecoveryScreen, type RecoveryNext } from './RecoveryScreen'

type TimerCardProps = {
  endsAt: number
  label: string
  onAdjust: (deltaMs: number) => void
  onStop: () => void
  disabled?: boolean
  durationSeconds?: number
  fullScreen?: boolean
  next?: RecoveryNext
  onOpen?: () => void
  onClose?: () => void
  notifications?: TimerNotificationOptions
}

export function TimerCard({
  endsAt,
  label,
  onAdjust,
  onStop,
  disabled = false,
  durationSeconds,
  fullScreen = false,
  next,
  onOpen,
  onClose,
  notifications = { sound: true, vibration: true },
}: TimerCardProps) {
  const { sound, vibration } = notifications
  const notify = useCallback(() => notifyTimerDone({ sound, vibration }), [sound, vibration])
  const remaining = useRecoveryTimer(endsAt, notify)
  const [duration] = useState(() => Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)))
  const expanded = fullScreen && remaining > 0 && next !== undefined
  useEffect(() => {
    if (fullScreen && remaining === 0) onClose?.()
  }, [fullScreen, remaining, onClose])

  return (
    <>
      <aside
        aria-hidden={expanded || undefined}
        className="rounded-xl border border-accent/60 bg-surface px-2 shadow-xl"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)] items-center gap-1">
          <button
            type="button"
            aria-label="Agrandir le chrono"
            disabled={!onOpen || remaining === 0}
            className="min-w-0 min-h-11 flex flex-col justify-center text-left"
            onClick={onOpen}
          >
            <p className="truncate text-[0.6875rem] leading-3 font-medium text-muted">{label}</p>
            <p
              className="num text-xl leading-5 font-bold text-accent"
              role={expanded ? undefined : 'timer'}
              aria-live="off"
            >
              {remaining === 0 ? 'Terminé' : formatDuration(remaining)}
            </p>
          </button>
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
          {sound || vibration
            ? `${sound ? 'Son' : 'Vibration'}${sound && vibration ? ' et vibration' : ''} au premier plan. Pas d’alarme garantie écran verrouillé.`
            : 'Son et vibration coupés dans Réglages.'}
        </p>
      </aside>
      {expanded ? (
        <RecoveryScreen
          remaining={remaining}
          duration={durationSeconds ?? duration}
          label={label}
          next={next}
          disabled={disabled}
          onAdjust={onAdjust}
          onStop={onStop}
          onClose={() => onClose?.()}
        />
      ) : null}
    </>
  )
}
