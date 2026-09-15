import type { ReactNode } from 'react'
import { BarbellLoad } from './BarbellLoad'
import { Button } from './Button'

export type FocusRole = 'warmup' | 'top' | 'backoff' | 'volume' | 'accessory' | 'optional'

const ROLE_LABEL: Record<FocusRole, string> = {
  warmup: 'Échauffement',
  top: 'Top set',
  backoff: 'Backoff',
  volume: 'Volume',
  accessory: 'Accessoire',
  optional: 'Optionnel',
}

const ROLE_TONE: Record<FocusRole, string> = {
  warmup: 'text-warn',
  top: 'text-accent-readable',
  backoff: 'text-muted',
  volume: 'text-ok',
  accessory: 'text-ok',
  optional: 'text-muted',
}

type FocusSetCardProps = {
  role: FocusRole
  exercise: string
  seriesLabel: string
  load: string
  unit?: string
  loadDetail?: string
  barbellTotal?: number
  supersetPartner?: string
  status?: 'validated' | 'skipped'
  children?: ReactNode
  primaryLabel?: string
  skipLabel?: string
  busy?: boolean
  errorMessage?: string
  onPrimary?: () => void
  onSkip?: () => void
}

/** Cadre de la série courante ; les lots métier lui fourniront les éditeurs adaptés au rôle. */
export function FocusSetCard({
  role,
  exercise,
  seriesLabel,
  load,
  unit,
  loadDetail,
  barbellTotal,
  supersetPartner,
  status,
  children,
  primaryLabel = 'Valider la série',
  skipLabel = 'Sauter — optionnel',
  busy = false,
  errorMessage,
  onPrimary,
  onSkip,
}: FocusSetCardProps) {
  return (
    <article
      className="motion-enter rounded-2xl border border-[#4a4131] bg-surface p-3"
      aria-label={`${exercise} · ${seriesLabel}`}
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border border-line bg-surface-2 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${ROLE_TONE[role]}`}
        >
          {ROLE_LABEL[role]}
        </span>
        {supersetPartner ? (
          <span className="rounded-md border border-focus/50 px-2 py-1 text-[0.6875rem] font-semibold tracking-wide text-focus">
            SS · {supersetPartner}
          </span>
        ) : null}
        {status ? (
          <span className="rounded-md border border-line px-2 py-1 text-[0.6875rem] font-semibold text-muted">
            Statut : {status === 'validated' ? 'Validée' : 'Sautée'}
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 text-xl font-bold">{exercise}</h2>
      <p className="num mt-0.5 text-xs text-muted">{seriesLabel}</p>

      <p className="mt-2 flex items-baseline gap-2">
        <span className="num text-[3.125rem] font-bold leading-none tracking-tight">{load}</span>
        {unit ? <span className="num text-sm text-muted">{unit}</span> : null}
      </p>
      {loadDetail ? (
        <p className="num mt-1 min-h-4 text-xs leading-4 text-muted">{loadDetail}</p>
      ) : null}
      {barbellTotal !== undefined ? <BarbellLoad total={barbellTotal} className="mt-1" /> : null}

      {children ? <div className="mt-3">{children}</div> : null}

      {errorMessage ? (
        <p
          className="mt-4 rounded-xl border border-bad/60 bg-bad/10 p-3 text-sm text-bad"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {onSkip ? (
        <Button
          variant="ghost"
          className="mt-3 w-full border-dashed text-muted"
          disabled={busy}
          onClick={onSkip}
        >
          {skipLabel}
        </Button>
      ) : null}
      {onPrimary ? (
        <Button
          variant="secondary"
          className="mt-2 w-full bg-fg text-bg"
          disabled={busy}
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
      ) : null}
    </article>
  )
}
