import { useId, useState } from 'react'
import { formatNumber } from '../domain/format'
import { describePlates, platesPerSide } from '../domain/plates'
import { weightStepFor } from '../domain/program'
import type { LoadKind, SetLog } from '../domain/types'
import { BarbellLoad } from './BarbellLoad'
import { SetCard, type EditableSet } from './SetCard'

type WarmupBlockProps = {
  exerciseLabel: string
  loadKind: LoadKind
  sets: SetLog[]
  onSetChange: (setId: string, value: EditableSet) => void
  onSetValidate: (setId: string, value: EditableSet) => void
}

function isTreated(set: Pick<SetLog, 'status'>): boolean {
  return set.status === 'validated' || set.status === 'skipped'
}

function describeSet(set: SetLog): string {
  const reps = set.reps === null ? '?' : formatNumber(set.reps)

  if (set.loadKind === 'bodyweight') return `PDC×${reps}`
  if (set.weight === null) return `?×${reps}`
  const weight = formatNumber(set.weight)
  if (set.loadKind === 'added') return `+${weight}×${reps}`
  if (set.loadKind === 'perDumbbell') return `${weight}×${reps}/h`
  return `${weight}×${reps}`
}

/**
 * Les paliers restent des séries éditables, mais forment un seul bloc distinct du
 * travail. Le bloc se replie dès que tous les paliers sont traités ; son bouton permet
 * encore de le rouvrir pour corriger une validation ou un passage accidentel.
 */
export function WarmupBlock({
  exerciseLabel,
  loadKind,
  sets,
  onSetChange,
  onSetValidate,
}: WarmupBlockProps) {
  const contentId = useId()
  const treated = sets.filter(isTreated).length
  const complete = sets.length > 0 && treated === sets.length
  const [expanded, setExpanded] = useState(!complete)

  if (sets.length === 0) return null

  const summary = sets.map(describeSet).join(' · ')

  return (
    <section
      className="mt-4 rounded-2xl border border-line bg-bg/50 p-2"
      aria-label={`Échauffement · ${exerciseLabel}`}
    >
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-left"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span
          className={`min-w-0 truncate ${complete ? 'num text-sm text-muted' : 'font-semibold'}`}
        >
          {complete
            ? `✓ Échauffement ${treated}/${sets.length} · ${summary}`
            : `Échauffement ${treated}/${sets.length}`}
        </span>
        <span aria-hidden="true" className="shrink-0 text-muted">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded ? (
        <div className="mt-2 grid gap-3" id={contentId}>
          {sets.map((set, index) => (
            <div key={set.id}>
              <SetCard
                label={`Palier ${index + 1}`}
                value={set}
                onChange={(value) => {
                  if (!isTreated(value)) setExpanded(true)
                  onSetChange(set.id, value)
                }}
                onValidate={(value) => {
                  if (!isTreated(set) && treated + 1 === sets.length) setExpanded(false)
                  onSetValidate(set.id, value)
                }}
                onSkip={(value) => {
                  if (!isTreated(set) && treated + 1 === sets.length) setExpanded(false)
                  onSetChange(set.id, value)
                }}
                showWeight={loadKind !== 'bodyweight'}
                showRpe={false}
                weightStep={weightStepFor(loadKind)}
              />
              {loadKind === 'barTotal' && set.weight !== null ? (
                <div className="-mt-2 px-3 pb-1">
                  <p className="text-sm font-medium text-fg">
                    {describePlates(platesPerSide(set.weight))}
                  </p>
                  <BarbellLoad total={set.weight} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export type { WarmupBlockProps }
