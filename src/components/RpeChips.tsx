const RPE_VALUES = [7, 7.5, 8, 8.5, 9, 9.5] as const

type RpeValue = (typeof RPE_VALUES)[number]

type RpeChipsProps = {
  value: RpeValue | null
  onChange: (value: RpeValue | null) => void
  disabled?: boolean
}

function formatRpe(value: RpeValue): string {
  return String(value).replace('.', ',')
}

function rpeMeaning(value: RpeValue): string {
  if (value <= 8) return 'effort cible'
  if (value === 8.5) return 'maintien'
  return 'échec'
}

function rpeTone(value: RpeValue): string {
  if (value <= 8) return 'border-ok/60 text-ok'
  if (value === 8.5) return 'border-warn/60 text-warn'
  return 'border-bad/60 text-bad'
}

export function RpeChips({ value, onChange, disabled = false }: RpeChipsProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-muted">RPE</legend>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {RPE_VALUES.map((option) => {
          const selected = value === option
          const meaning = rpeMeaning(option)

          return (
            <button
              key={option}
              type="button"
              className={`min-h-11 rounded-lg border bg-bg px-2 text-sm font-semibold ${rpeTone(option)} ${selected ? 'ring-2 ring-current ring-offset-1 ring-offset-surface' : ''}`}
              aria-label={`RPE ${formatRpe(option)} — ${meaning}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : option)}
              disabled={disabled}
            >
              {formatRpe(option)}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 min-h-5 text-xs text-muted" aria-live="polite">
        {value === null ? 'RPE non renseigné' : `RPE ${formatRpe(value)} · ${rpeMeaning(value)}`}
      </p>
    </fieldset>
  )
}

export type { RpeValue }
