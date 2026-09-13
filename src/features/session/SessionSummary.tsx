import type { FinalizeResult } from '../../db/contracts'
import { formatDate, formatLoad } from '../../domain/format'
import { SEANCES } from '../../domain/program'
import { describeWhen, type UpcomingSession } from '../../domain/schedule'

export function SessionSummary({
  result,
  next,
}: {
  result: FinalizeResult
  next: UpcomingSession
}) {
  const nextExercises = SEANCES[next.type].exercises.filter((exercise) => exercise.lift)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 py-4 pb-8">
      <header className="rounded-2xl border border-ok/50 bg-surface p-5">
        <p className="text-sm font-semibold text-ok">Séance enregistrée</p>
        <h1 className="mt-1 text-2xl font-bold">Séance {result.seance.type} terminée</h1>
        <p className="mt-1 text-sm text-muted">{formatDate(result.seance.date)}</p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Cibles recalculées</h2>
        {result.events.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {result.events.map((event) => (
              <li key={event.lift} className="rounded-xl bg-bg p-3 text-sm">
                {event.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Aucune cible pilotée n’a changé.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-medium text-accent-readable">{describeWhen(next)}</p>
        <h2 className="text-lg font-bold">Prochaine séance · {next.type}</h2>
        <p className="mt-1 text-sm text-muted">{formatDate(next.scheduledDate)}</p>
        <ul className="mt-3 grid gap-2">
          {nextExercises.map((exercise) => {
            const lift = exercise.lift!
            return (
              <li key={lift} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">{exercise.label}</span>
                <strong className="num text-right">
                  {formatLoad(result.targets[lift].w, exercise.loadKind)}
                </strong>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="rounded-xl border border-line p-3 text-sm text-muted">
        Pense à exporter tes données pour les sauvegarder et préparer la séance suivante dans
        Outlook.
      </p>
    </main>
  )
}
