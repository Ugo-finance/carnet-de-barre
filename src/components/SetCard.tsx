import type { SetLog, SetStatus } from '../domain/types'
import { NumberStepper } from './NumberStepper'
import { RpeChips } from './RpeChips'

export type EditableSet = Pick<SetLog, 'weight' | 'reps' | 'rpe' | 'status'>
export type { SetStatus } from '../domain/types'

type SetCardProps = {
  label: string
  value: EditableSet
  onChange: (value: EditableSet) => void
  onValidate: (value: EditableSet) => void
  onSkip: (value: EditableSet) => void
  weightStep?: number
  showRpe?: boolean
}

const STATUS_LABELS: Record<SetStatus, string> = {
  planned: 'Prévue',
  entered: 'Saisie',
  validated: 'Validée',
  skipped: 'Sautée',
}

export function SetCard({
  label,
  value,
  onChange,
  onValidate,
  onSkip,
  weightStep = 2.5,
  showRpe = true,
}: SetCardProps) {
  const update = (change: Partial<EditableSet>) => {
    onChange({ ...value, ...change, status: value.status === 'planned' ? 'entered' : value.status })
  }

  const validate = () => onValidate({ ...value, status: 'validated' })
  const skip = () => onSkip({ ...value, status: 'skipped' })
  const done = value.status === 'validated' || value.status === 'skipped'

  return (
    <article className="rounded-2xl border border-line bg-surface p-3" aria-label={label}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{label}</h3>
        <span className="rounded-full border border-line px-2 py-1 text-xs text-muted">
          {STATUS_LABELS[value.status]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <NumberStepper
          label="Poids"
          value={value.weight}
          onChange={(weight) => update({ weight })}
          step={weightStep}
          unit="kg"
          disabled={done}
        />
        <NumberStepper
          label="Répétitions"
          value={value.reps}
          onChange={(reps) => update({ reps })}
          step={1}
          disabled={done}
        />
      </div>

      {showRpe ? (
        <div className="mt-3">
          <RpeChips value={value.rpe} onChange={(rpe) => update({ rpe })} disabled={done} />
        </div>
      ) : null}

      {done ? (
        <button
          type="button"
          className="mt-3 min-h-11 w-full rounded-xl border border-line px-4 font-semibold text-fg"
          onClick={() => onChange({ ...value, status: 'entered' })}
        >
          Modifier
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-medium text-muted"
            onClick={skip}
          >
            Sauter
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
            onClick={validate}
          >
            Valider
          </button>
        </div>
      )}
    </article>
  )
}
