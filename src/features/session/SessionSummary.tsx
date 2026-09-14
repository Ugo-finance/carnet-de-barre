import { useState, type ReactNode } from 'react'
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

function chunks<T>(values: readonly T[], size: number): T[][] {
  if (values.length === 0) return [[]]
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  )
}

function noteChunks(note: string, maxLength = 280): string[] {
  const normalized = note.trim()
  if (!normalized) return ['Aucune note.']

  const result: string[] = []
  let current = ''
  const words = normalized
    .split(/\s+/)
    .flatMap((word) => word.match(new RegExp(`.{1,${maxLength}}`, 'gu')) ?? [])
  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if (`${current} ${word}`.length <= maxLength) current = `${current} ${word}`
    else {
      result.push(current)
      current = word
    }
  }
  if (current) result.push(current)
  return result
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
  const [pageIndex, setPageIndex] = useState(0)
  const summary = resumeFinSeance(result.seance)
  const records = sessionRecords(result, previousSeances)
  const nextExercises = SEANCES[next.type].exercises.filter((exercise) => exercise.lift)
  const pages: { key: string; title: string; content: ReactNode }[] = []

  chunks(result.seance.lines, 3).forEach((lines, index) => {
    pages.push({
      key: `work-${index}`,
      title: index === 0 ? 'Travail validé' : 'Travail validé · suite',
      content: (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">
            {index === 0 ? 'Travail validé' : 'Travail validé · suite'}
          </h2>
          {index === 0 ? (
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
          ) : null}
          {lines.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {lines.map((line) => (
                <li key={line} className="rounded-xl border border-line p-3 text-sm">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Aucune série de travail validée.</p>
          )}
        </section>
      ),
    })
  })

  const splitNotes = noteChunks(summary.notes)
  splitNotes.forEach((note, index) => {
    pages.push({
      key: `notes-${index}`,
      title: splitNotes.length === 1 ? 'Notes' : `Notes · ${index + 1}/${splitNotes.length}`,
      content: (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">
            {splitNotes.length === 1 ? 'Notes' : `Notes · ${index + 1}/${splitNotes.length}`}
          </h2>
          <p className={`mt-3 break-all text-sm ${summary.notes.trim() ? '' : 'text-muted'}`}>
            {note}
          </p>
        </section>
      ),
    })
  })

  records.forEach((record) => {
    pages.push({
      key: `record-${record.lift}`,
      title: `Record · ${record.label}`,
      content: (
        <section
          className="rounded-2xl border border-warn/60 bg-surface p-4"
          aria-label="Records de la séance"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-warn">
            {record.chargeBeaten || record.e1rmBeaten ? 'Nouveau record' : 'Records actuels'}
          </p>
          <h2 className="mt-1 text-lg font-bold">{record.label}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {record.charge === null ? null : (
              <div className="rounded-xl bg-bg p-3">
                <dt className="text-xs text-muted">Charge · {formatDate(record.charge.date)}</dt>
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
        </section>
      ),
    })
  })

  chunks(result.events, 3).forEach((events, index) => {
    pages.push({
      key: `targets-${index}`,
      title: index === 0 ? 'Cibles recalculées' : 'Cibles recalculées · suite',
      content: (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">
            {index === 0 ? 'Cibles recalculées' : 'Cibles recalculées · suite'}
          </h2>
          {events.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {events.map((event) => (
                <li key={event.lift} className="rounded-xl bg-bg p-3 text-sm">
                  {event.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucune cible pilotée n’a changé.</p>
          )}
        </section>
      ),
    })
  })

  pages.push({
    key: 'next',
    title: `Prochaine séance · ${next.type}`,
    content: (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-medium text-accent-readable">{describeWhen(next)}</p>
        <h2 className="text-lg font-bold">Prochaine séance · {next.type}</h2>
        <p className="mt-1 text-sm text-muted">{formatDate(next.scheduledDate)}</p>
        <ul className="mt-3 grid gap-2">
          {nextExercises.map((exercise) => {
            const lift = exercise.lift!
            return (
              <li key={lift} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span className="text-muted">{exercise.label}</span>
                <strong className="num text-right">
                  {formatLoad(result.targets[lift].w, exercise.loadKind)}
                </strong>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 rounded-xl border border-line p-3 text-sm text-muted">
          Pense à exporter tes données pour les sauvegarder et préparer la séance suivante dans
          Outlook.
        </p>
      </section>
    ),
  })

  const currentPage = Math.min(pageIndex, pages.length - 1)

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.25rem)] w-full max-w-md flex-col gap-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="rounded-2xl border border-ok/50 bg-surface p-4">
        <p className="text-sm font-semibold text-ok">Séance enregistrée</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Séance {result.seance.type} terminée</h1>
          <p className="num shrink-0 text-xs text-muted">
            {currentPage + 1}/{pages.length}
          </p>
        </div>
        <p className="text-sm text-muted">{formatDate(result.seance.date)}</p>
      </header>

      <div aria-live="polite" aria-label={pages[currentPage]?.title} className="motion-enter">
        {pages[currentPage]?.content}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        {currentPage > 0 ? (
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-4 font-semibold text-muted"
            onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
          >
            Précédent
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        {currentPage < pages.length - 1 ? (
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent-action px-4 font-semibold text-white"
            onClick={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))}
          >
            Suivant
          </button>
        ) : (
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent-action px-4 font-semibold text-white"
            onClick={onHome}
          >
            Retour à l’accueil
          </button>
        )}
      </div>
      {currentPage === pages.length - 1 ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-xl border border-line px-4 font-semibold text-fg"
          onClick={onHistory}
        >
          Voir dans l’historique
        </button>
      ) : null}
    </main>
  )
}
