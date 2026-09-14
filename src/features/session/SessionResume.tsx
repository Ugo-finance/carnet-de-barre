import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import type { SeanceType } from '../../domain/types'

type SessionResumeProps = {
  type: SeanceType
  date: string
  dateLabel: string
  completedSets: number
  totalSets: number
  updatedLabel: string
  resuming?: boolean
  abandoning?: boolean
  errorMessage?: string
  onResume: () => void
  onAbandon: () => void
}

function progressText(completed: number, total: number): string {
  return `${completed}/${total} séries terminées`
}

/** Accueil lorsqu'une séance active existe déjà. */
export function SessionResume({
  type,
  date,
  dateLabel,
  completedSets,
  totalSets,
  updatedLabel,
  resuming = false,
  abandoning = false,
  errorMessage,
  onResume,
  onAbandon,
}: SessionResumeProps) {
  const [confirmingAbandon, setConfirmingAbandon] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const busy = resuming || abandoning
  const summary = progressText(completedSets, totalSets)

  useEffect(() => {
    if (!confirmingAbandon) return
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !abandoning) setConfirmingAbandon(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [abandoning, confirmingAbandon])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="knurled rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-[0.14em] text-accent-readable uppercase">
            Séance en cours
          </p>
          <time className="num text-xs text-muted" dateTime={date}>
            {dateLabel}
          </time>
        </div>
        <h1 className="display mt-3 text-5xl text-fg">Séance {type}</h1>
      </header>

      <section
        className="rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="resume-title"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold text-fg" id="resume-title">
            Ta séance t’attend
          </h2>
          <span className="num text-sm text-muted">{summary}</span>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={completedSets}
            max={totalSets}
            label="Avancement de la séance"
            valueText={summary}
          />
        </div>
        <p className="mt-3 text-sm text-muted">Dernière sauvegarde : {updatedLabel}</p>
      </section>

      {errorMessage ? (
        <p
          className="rounded-xl border border-bad/60 bg-bad/10 px-4 py-3 text-sm text-bad"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-auto grid gap-2 pt-2">
        <Button
          className="w-full py-4 text-base tracking-[0.06em] uppercase"
          disabled={busy}
          onClick={onResume}
        >
          {resuming ? 'Reprise…' : 'Reprendre la séance'}
        </Button>
        <Button
          variant="danger"
          className="w-full"
          disabled={busy}
          onClick={() => setConfirmingAbandon(true)}
        >
          Abandonner la séance
        </Button>
      </div>

      {confirmingAbandon ? (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="abandon-title"
        >
          <div
            ref={dialogRef}
            className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-4 shadow-2xl"
          >
            <h2 className="text-lg font-bold" id="abandon-title">
              Abandonner la séance {type} ?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Les séries déjà saisies dans ce brouillon seront supprimées.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                variant="secondary"
                disabled={abandoning}
                onClick={() => setConfirmingAbandon(false)}
              >
                Garder la séance
              </Button>
              <Button variant="danger" disabled={abandoning} onClick={onAbandon}>
                {abandoning ? 'Abandon…' : 'Confirmer l’abandon'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
