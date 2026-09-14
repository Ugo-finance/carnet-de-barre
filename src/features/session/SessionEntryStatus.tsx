import { Button } from '../../components/Button'

type SessionEntryStatusProps =
  | { status: 'loading' }
  | {
      status: 'error'
      message: string
      retrying?: boolean
      onRetry: () => void
    }

/** État transitoire avant que l'accueil puisse choisir entre démarrage et reprise. */
export function SessionEntryStatus(props: SessionEntryStatusProps) {
  if (props.status === 'loading') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-sm font-semibold text-muted" role="status">
          Préparation de ta séance…
        </p>
      </main>
    )
  }

  const retrying = props.retrying ?? false

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <section
        className="rounded-2xl border border-bad/60 bg-surface p-4"
        role="alert"
        aria-labelledby="session-entry-error-title"
      >
        <h1 className="display text-4xl text-fg" id="session-entry-error-title">
          Carnet indisponible
        </h1>
        <p className="mt-3 text-sm text-muted">{props.message}</p>
      </section>

      <Button className="w-full py-4" disabled={retrying} onClick={props.onRetry}>
        {retrying ? 'Nouvel essai…' : 'Réessayer'}
      </Button>
    </main>
  )
}
