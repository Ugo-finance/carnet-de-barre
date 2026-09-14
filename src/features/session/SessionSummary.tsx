import type { FinalizeResult } from '../../db/contracts'
import { resumeFinSeance } from '../../db/selectors'
import { formatDate, formatKg, formatLoad } from '../../domain/format'
import { SEANCES } from '../../domain/program'
import { describeWhen, type UpcomingSession } from '../../domain/schedule'
import type { Seance } from '../../domain/types'
import { sessionRecords } from './sessionSummaryModel'

function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes} min`
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`
}

export function SessionSummary({
  result,
  next,
  previousSeances = [],
  onHome,
  onHistory,
}: {
  result: FinalizeResult
  next: UpcomingSession
  previousSeances?: readonly Seance[]
  onHome?: () => void
  onHistory?: () => void
}) {
  const summary = resumeFinSeance(result.seance)
  const records = sessionRecords(result, previousSeances)
  const nextExercises = SEANCES[next.type].exercises.filter((exercise) => exercise.lift)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 py-4 pb-8">
      <header className="rounded-2xl border border-ok/50 bg-surface p-5">
        <p className="text-sm font-semibold text-ok">Séance enregistrée</p>
        <h1 className="mt-1 text-2xl font-bold">Séance {result.seance.type} terminée</h1>
        <p className="mt-1 text-sm text-muted">{formatDate(result.seance.date)}</p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Travail validé</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {summary.dureeSecondes === null ? null : (
            <div className="rounded-xl bg-bg p-3">
              <dt className="text-xs text-muted">Durée</dt>
              <dd className="num mt-1 font-bold">{durationLabel(summary.dureeSecondes)}</dd>
            </div>
          )}
          <div className="rounded-xl bg-bg p-3">
            <dt className="text-xs text-muted">Séries validées</dt>
            <dd className="num mt-1 font-bold">{summary.validees.length}</dd>
          </div>
          {summary.paliersValides === 0 ? null : (
            <div className="rounded-xl bg-bg p-3">
              <dt className="text-xs text-muted">Paliers validés</dt>
              <dd className="num mt-1 font-bold">{summary.paliersValides}</dd>
            </div>
          )}
        </dl>
        {result.seance.lines.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {result.seance.lines.map((line) => (
              <li key={line} className="rounded-xl border border-line p-3 text-sm">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Aucune série de travail validée.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Notes</h2>
        <p
          className={`mt-2 whitespace-pre-wrap text-sm ${summary.notes.trim() ? '' : 'text-muted'}`}
        >
          {summary.notes.trim() || 'Aucune note.'}
        </p>
      </section>

      {records.length === 0 ? null : (
        <section className="grid gap-3" aria-label="Records de la séance">
          {records.map((record) => (
            <article key={record.lift} className="rounded-2xl border border-warn/60 bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-warn">
                {record.chargeBeaten || record.e1rmBeaten ? 'Nouveau record' : 'Records actuels'}
              </p>
              <h2 className="mt-1 text-lg font-bold">{record.label}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                {record.charge === null ? null : (
                  <div className="rounded-xl bg-bg p-3">
                    <dt className="text-xs text-muted">
                      Charge · {formatDate(record.charge.date)}
                    </dt>
                    <dd className="num mt-1 font-bold">
                      {formatLoad(record.charge.valeur, record.loadKind)}
                    </dd>
                  </div>
                )}
                {record.e1rm === null ? null : (
                  <div className="rounded-xl bg-bg p-3">
                    <dt className="text-xs text-muted">e1RM · {formatDate(record.e1rm.date)}</dt>
                    <dd className="num mt-1 font-bold">{formatKg(record.e1rm.valeur)}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </section>
      )}

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

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
          onClick={onHome}
        >
          Retour à l’accueil
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-4 font-semibold text-fg"
          onClick={onHistory}
        >
          Voir dans l’historique
        </button>
      </div>
    </main>
  )
}
