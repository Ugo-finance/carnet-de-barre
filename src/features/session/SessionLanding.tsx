import { useState } from 'react'
import { Button } from '../../components/Button'
import type { SeanceType } from '../../domain/types'

export type LandingExercise = {
  id: string
  name: string
  prescription: string
}

type SessionLandingProps = {
  suggestedType: SeanceType
  selectedType: SeanceType
  date: string
  dateLabel: string
  scheduleLabel: string
  exercises: LandingExercise[]
  warmupCount: number
  rushed: boolean
  starting?: boolean
  errorMessage?: string
  onSelectType: (type: SeanceType) => void
  onRushedChange: (rushed: boolean) => void
  onStart: () => void
}

const SESSION_TYPES: SeanceType[] = ['A', 'B', 'C']

function warmupLabel(count: number): string {
  return `Échauffement · ${count} ${count === 1 ? 'palier' : 'paliers'}`
}

/**
 * Accueil avant séance. Ce composant ne crée rien et ne connaît pas le magasin :
 * sélectionner une variante reste un choix local jusqu'au clic explicite sur Démarrer.
 */
export function SessionLanding({
  suggestedType,
  selectedType,
  date,
  dateLabel,
  scheduleLabel,
  exercises,
  warmupCount,
  rushed,
  starting = false,
  errorMessage,
  onSelectType,
  onRushedChange,
  onStart,
}: SessionLandingProps) {
  const [page, setPage] = useState<'accueil' | 'cibles'>('accueil')

  if (page === 'cibles') {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-3.25rem)] w-full max-w-md flex-col gap-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <header className="knurled rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-bold tracking-[0.14em] text-accent-readable uppercase">
            Séance {selectedType}
          </p>
          <h1 className="display mt-2 text-4xl text-fg">Cibles du jour</h1>
          <p className="mt-2 text-sm text-muted">{scheduleLabel}</p>
        </header>

        <section
          className="rounded-2xl border border-line bg-surface px-4 py-2"
          aria-labelledby="today-title"
        >
          <h2 className="sr-only" id="today-title">
            Contenu de la séance {selectedType}
          </h2>
          {exercises.length > 0 ? (
            <ul
              className="divide-y divide-line"
              aria-label={`Contenu de la séance ${selectedType}`}
            >
              {exercises.map((exercise) => (
                <li
                  className="flex min-h-11 items-center justify-between gap-3 py-2"
                  key={exercise.id}
                >
                  <span className="font-semibold text-fg">{exercise.name}</span>
                  <span className="num text-right text-sm text-muted">{exercise.prescription}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-muted">Aucun exercice prévu.</p>
          )}
        </section>

        {errorMessage ? (
          <p
            className="rounded-xl border border-bad/60 bg-bad/10 px-4 py-3 text-sm text-bad"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-2">
          <Button variant="ghost" disabled={starting} onClick={() => setPage('accueil')}>
            Retour
          </Button>
          <Button
            className="w-full py-4 text-base tracking-[0.06em] uppercase"
            disabled={starting}
            onClick={onStart}
          >
            {starting ? 'Démarrage…' : 'C’est parti'}
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.25rem)] w-full max-w-md flex-col gap-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="knurled rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-[0.14em] text-accent-readable uppercase">
            {selectedType === suggestedType ? 'Séance prévue' : 'Séance manuelle'}
          </p>
          <time className="num text-xs text-muted" dateTime={date}>
            {dateLabel}
          </time>
        </div>
        <h1 className="display mt-3 text-5xl text-fg">Séance {selectedType}</h1>
        <p className="mt-2 text-sm text-muted">{scheduleLabel}</p>
      </header>

      <section aria-labelledby="session-choice-title">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2
            className="text-xs font-bold tracking-[0.12em] text-muted uppercase"
            id="session-choice-title"
          >
            Choisir la séance
          </h2>
          <span className="text-xs text-faint">Suggestion : {suggestedType}</span>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Type de séance">
          {SESSION_TYPES.map((type) => {
            const selected = type === selectedType
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                className={`motion-press min-h-11 rounded-xl border px-3 font-bold tracking-[0.08em] ${
                  selected
                    ? 'border-accent bg-accent/10 text-accent-readable'
                    : 'border-line bg-surface text-muted'
                }`}
                onClick={() => onSelectType(type)}
              >
                Séance {type}
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <p className="flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm text-muted">
          {warmupLabel(warmupCount)}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={rushed}
          className="motion-press flex min-h-11 items-center justify-between gap-3 rounded-full border border-line bg-surface px-4 text-left text-sm text-muted"
          onClick={() => onRushedChange(!rushed)}
        >
          <span>Mode pressé</span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${rushed ? 'bg-accent-action' : 'bg-surface-2'}`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${rushed ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </span>
        </button>
      </div>

      {errorMessage ? (
        <p
          className="rounded-xl border border-bad/60 bg-bad/10 px-4 py-3 text-sm text-bad"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-auto pt-2">
        <Button
          className="w-full py-4 text-base tracking-[0.06em] uppercase"
          disabled={starting}
          onClick={() => setPage('cibles')}
        >
          {`Voir les cibles de la séance ${selectedType}`}
        </Button>
      </div>
    </main>
  )
}
