import { useId, useState } from 'react'

type NumberStepperProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  step: number
  min?: number
  unit?: string
  disabled?: boolean
}

function formatNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}

function parseNumber(value: string): number | null | undefined {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) return undefined

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function precisionFor(step: number): number {
  const decimals = String(step).split('.')[1]?.length ?? 0
  return 10 ** decimals
}

export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  unit,
  disabled = false,
}: NumberStepperProps) {
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const changeBy = (direction: -1 | 1) => {
    const parsed = editing ? parseNumber(draft) : value
    const current = typeof parsed === 'number' ? parsed : (value ?? min)
    const precision = precisionFor(step)
    const next = Math.max(min, Math.round((current + direction * step) * precision) / precision)
    setDraft(formatNumber(next))
    onChange(next)
  }

  const commitInput = (input: string) => {
    setDraft(input)
    const parsed = parseNumber(input)
    if (parsed !== undefined && (parsed === null || parsed >= min)) onChange(parsed)
  }

  const normalizeInput = () => {
    const parsed = parseNumber(draft)
    setDraft(
      parsed === undefined || (parsed !== null && parsed < min)
        ? formatNumber(value)
        : formatNumber(parsed),
    )
    setEditing(false)
  }

  const stepLabel = formatNumber(step)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-sm font-medium text-muted" htmlFor={inputId}>
        {label}
      </label>
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-line bg-bg">
        <button
          type="button"
          className="min-h-11 min-w-11 border-r border-line text-xl text-fg disabled:opacity-40"
          aria-label={`Diminuer ${label} de ${stepLabel}`}
          onClick={() => changeBy(-1)}
          disabled={disabled || (value !== null && value <= min)}
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1 px-1">
          <input
            id={inputId}
            className="num min-w-0 flex-1 bg-transparent text-center text-lg font-semibold outline-none"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={editing ? draft : formatNumber(value)}
            onFocus={() => {
              setDraft(formatNumber(value))
              setEditing(true)
            }}
            onChange={(event) => commitInput(event.target.value)}
            onBlur={normalizeInput}
            disabled={disabled}
          />
          {unit ? <span className="text-xs text-muted">{unit}</span> : null}
        </div>
        <button
          type="button"
          className="min-h-11 min-w-11 border-l border-line text-xl text-fg disabled:opacity-40"
          aria-label={`Augmenter ${label} de ${stepLabel}`}
          onClick={() => changeBy(1)}
          disabled={disabled}
        >
          +
        </button>
      </div>
    </div>
  )
}
