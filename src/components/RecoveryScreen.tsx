import { useEffect, useRef } from 'react'
import { formatDuration } from '../domain/format'
import { Button } from './Button'

export type RecoveryNext = { exercise: string; series: string; load: string; reps: string }

/** Présentation seule : le décompte et son alarme restent dans TimerCard. */
export function RecoveryScreen({
  remaining,
  duration,
  label,
  next,
  disabled,
  onAdjust,
  onStop,
  onClose,
}: {
  remaining: number
  duration: number
  label: string
  next: RecoveryNext
  disabled: boolean
  onAdjust: (deltaMs: number) => void
  onStop: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
    return () => {
      if (typeof element.close === 'function') element.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-label="Récupération"
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-bg p-0 text-fg backdrop:bg-bg"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button')) onClose()
        }}
      >
        <p className="text-center text-sm text-muted">{label}</p>
        <h2 className="sr-only">Récupération</h2>
        <p
          role="timer"
          aria-live="off"
          className="num text-center text-[96px] leading-none font-bold text-accent"
        >
          {formatDuration(remaining)}
        </p>
        <progress
          aria-label="Temps de récupération écoulé"
          className="h-2 w-full accent-accent"
          max={Math.max(duration, remaining, 1)}
          value={Math.max(0, duration - remaining)}
        />
        <section
          aria-label="Prochaine série"
          className="rounded-2xl border border-line bg-surface p-4 text-center"
        >
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Ensuite</p>
          <p className="mt-2 text-xl font-bold">{next.exercise}</p>
          <p className="text-sm text-muted">{next.series}</p>
          <p className="num mt-2 text-2xl font-bold">{next.load}</p>
          <p className="mt-1 text-sm">{next.reps}</p>
        </section>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" disabled={disabled} onClick={() => onAdjust(-30_000)}>
            −30 s
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={() => onAdjust(30_000)}>
            +30 s
          </Button>
          <Button variant="ghost" disabled={disabled} onClick={onStop}>
            Arrêter
          </Button>
        </div>
        <Button className="w-full" onClick={onClose}>
          Revenir à la saisie
        </Button>
        <p className="text-center text-xs text-faint">Pas d’alarme garantie écran verrouillé.</p>
      </div>
    </dialog>
  )
}
