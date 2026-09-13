import type { CSSProperties } from 'react'
import { describePlates, platesPerSide } from '../domain/plates'

const PLATE_STYLE: Record<number, { color: string; height: number; width: number }> = {
  25: { color: 'var(--plate-25)', height: 64, width: 14 },
  20: { color: 'var(--plate-20)', height: 58, width: 13 },
  15: { color: 'var(--plate-15)', height: 52, width: 12 },
  10: { color: 'var(--plate-10)', height: 46, width: 12 },
  5: { color: 'var(--plate-5)', height: 36, width: 10 },
  2.5: { color: 'var(--plate-2-5)', height: 29, width: 9 },
  1.25: { color: 'var(--plate-1-25)', height: 24, width: 8 },
}

type BarbellLoadProps = {
  total: number
  className?: string
}

function Plate({ weight }: { weight: number }) {
  const token = PLATE_STYLE[weight] ?? PLATE_STYLE[1.25]
  const style = {
    '--plate-color': token.color,
    blockSize: token.height,
    inlineSize: token.width,
  } as CSSProperties

  return (
    <span
      className="motion-enter shrink-0 rounded-[3px] bg-[var(--plate-color)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3),inset_0_-8px_10px_rgb(0_0_0/0.22)]"
      style={style}
    />
  )
}

/**
 * Barre et plaques calibrées. La forme ne porte jamais seule l'information : le
 * chargement exact est exposé dans le nom accessible.
 */
export function BarbellLoad({ total, className = '' }: BarbellLoadProps) {
  const load = platesPerSide(total)
  const plates = load.kind === 'plates' ? load.perSide : []
  const description = describePlates(load)

  return (
    <figure
      className={`m-0 ${className}`}
      role="img"
      aria-label={`${String(total).replace('.', ',')} kg — ${description}`}
    >
      <div className="flex h-[72px] min-w-0 items-center" aria-hidden="true">
        <span className="h-2 min-w-4 flex-1 rounded-l bg-gradient-to-b from-[#aaa59a] via-[#5d5a53] to-[#87837a]" />
        <span className="h-5 w-2.5 shrink-0 rounded-sm bg-gradient-to-b from-[#8b877e] to-[#565349]" />
        <span className="flex items-center gap-[3px] px-0.5">
          {plates.map((plate, index) => (
            <Plate key={`${plate}-${index}`} weight={plate} />
          ))}
        </span>
      </div>
    </figure>
  )
}
