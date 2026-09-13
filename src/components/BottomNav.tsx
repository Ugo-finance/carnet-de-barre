export type AppTab = 'session' | 'history' | 'progress' | 'settings'

type BottomNavProps = {
  active: AppTab
  onSelect: (tab: AppTab) => void
}

const TABS: readonly { id: AppTab; label: string; glyph: string }[] = [
  { id: 'session', label: 'Séance', glyph: '▶' },
  { id: 'history', label: 'Historique', glyph: '≣' },
  { id: 'progress', label: 'Progression', glyph: '↗' },
  { id: 'settings', label: 'Réglages', glyph: '⚙' },
]

/** Navigation hors séance. Son parent décide de ne pas la monter pendant un brouillon actif. */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Navigation principale"
    >
      {TABS.map((tab) => {
        const current = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            className={`motion-press flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-semibold tracking-wide ${current ? 'text-fg shadow-[inset_0_2px_0_var(--color-accent)]' : 'text-muted'}`}
            aria-current={current ? 'page' : undefined}
            onClick={() => onSelect(tab.id)}
          >
            <span className="text-base leading-none" aria-hidden="true">
              {tab.glyph}
            </span>
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
