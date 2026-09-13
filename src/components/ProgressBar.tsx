type ProgressBarProps = {
  value: number
  max: number
  label: string
  valueText?: string
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), max)
}

/** Progression de séance compacte ; l'information reste complète pour un lecteur d'écran. */
export function ProgressBar({ value, max, label, valueText }: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1
  const safeValue = clamp(value, safeMax)
  const percent = (safeValue / safeMax) * 100

  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={valueText}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-ok to-accent transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
