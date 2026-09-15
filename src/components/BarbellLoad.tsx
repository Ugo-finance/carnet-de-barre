import type { CSSProperties } from 'react'
import { describePlates, platesPerSide } from '../domain/plates'

const PLATE_STYLE: Record<number, { color: string; height: number; width: number }> = {
  25: { color: 'var(--plate-25)', height: 40, width: 11 },
  20: { color: 'var(--plate-20)', height: 37, width: 11 },
  15: { color: 'var(--plate-15)', height: 34, width: 10 },
  10: { color: 'var(--plate-10)', height: 31, width: 10 },
  5: { color: 'var(--plate-5)', height: 27, width: 9 },
  2.5: { color: 'var(--plate-2-5)', height: 23, width: 8 },
  1.25: { color: 'var(--plate-1-25)', height: 20, width: 7 },
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
 * chargement exact reste écrit à côté du dessin et exposé dans son nom accessible.
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
      <div className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
        <span className="flex min-w-0 items-center" aria-hidden="true">
          <span className="h-2 min-w-3 flex-1 rounded-l bg-gradient-to-b from-[#aaa59a] via-[#5d5a53] to-[#87837a]" />
          <span className="h-5 w-2.5 shrink-0 rounded-sm bg-gradient-to-b from-[#8b877e] to-[#565349]" />
          <span className="flex items-center gap-0.5 px-0.5">
            {plates.map((plate, index) => (
              <Plate key={`${plate}-${index}`} weight={plate} />
            ))}
          </span>
        </span>
        <span
          className="num min-w-0 text-xs leading-4 font-semibold text-muted"
          data-testid="barbell-description"
        >
          {description}
        </span>
      </div>
    </figure>
  )
}
