import { useId, useState } from 'react'
import { formatNumber as formatDomainNumber } from '../domain/format'

type NumberStepperProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  step: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
}

function formatNumber(value: number | null): string {
  return value === null ? '' : formatDomainNumber(value)
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
  max,
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
    const stepped = Math.round((current + direction * step) * precision) / precision
    const next = Math.max(min, max === undefined ? stepped : Math.min(max, stepped))
    setDraft(formatNumber(next))
    onChange(next)
  }

  const commitInput = (input: string) => {
    setDraft(input)
    const parsed = parseNumber(input)
    if (
      parsed !== undefined &&
      (parsed === null || (parsed >= min && (max === undefined || parsed <= max)))
    ) {
      onChange(parsed)
    }
  }

  const normalizeInput = () => {
    const parsed = parseNumber(draft)
    setDraft(
      parsed === undefined ||
        (parsed !== null && (parsed < min || (max !== undefined && parsed > max)))
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
      {/*
        La valeur occupe sa propre ligne, les commandes sont dessous.

        Avec les deux boutons de part et d'autre, il ne restait que 17 px pour le
        nombre sur un écran de 390 px : « 92,5 » en demande 43, donc toutes les charges
        étaient tronquées — mesuré, pas supposé. Empiler rend au nombre la largeur
        entière de la colonne et permet de le grossir, ce qui est le point : cet écran
        se lit debout, à bout de bras, entre deux séries.
      */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-bg">
        <div className="flex min-w-0 items-baseline justify-center gap-1 px-2 py-2">
          <input
            id={inputId}
            className="num min-w-0 flex-1 bg-transparent text-center text-2xl font-semibold outline-none"
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
          {unit ? <span className="shrink-0 text-xs text-muted">{unit}</span> : null}
        </div>
        <div className="grid grid-cols-2 border-t border-line">
          <button
            type="button"
            className="min-h-11 border-r border-line text-xl text-fg disabled:opacity-40"
            aria-label={`Diminuer ${label} de ${stepLabel}`}
            onClick={() => changeBy(-1)}
            disabled={disabled || (value !== null && value <= min)}
          >
            −
          </button>
          <button
            type="button"
            className="min-h-11 text-xl text-fg disabled:opacity-40"
            aria-label={`Augmenter ${label} de ${stepLabel}`}
            onClick={() => changeBy(1)}
            disabled={disabled || (max !== undefined && value !== null && value >= max)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
