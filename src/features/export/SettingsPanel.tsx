import { useEffect, useState } from 'react'
import type { Preferences } from '../../domain/preferences'
import { ExportPanel, type ExchangePort } from './ExportPanel'

export interface SettingsPort extends ExchangePort {
  getPreferences(): Promise<Preferences>
  savePreferences(patch: Partial<Preferences>): Promise<Preferences>
}

type PreferenceKey = keyof Preferences
type SettingsPage = 'preferences' | 'hardware' | 'export' | 'import'

const PAGES: readonly SettingsPage[] = ['preferences', 'hardware', 'export', 'import']

const CONTROLS: readonly {
  key: PreferenceKey
  label: string
  description: string
}[] = [
  {
    key: 'vibration',
    label: 'Vibration',
    description: 'Vibrer à la fin du chrono, quand le téléphone le permet.',
  },
  {
    key: 'sonChrono',
    label: 'Son du chrono',
    description: 'Émettre un signal à la fin du temps de récupération.',
  },
  {
    key: 'ecranAllume',
    label: 'Écran allumé',
    description: 'Le demander par défaut pendant les prochaines séances.',
  },
  {
    key: 'modePresseParDefaut',
    label: 'Mode pressé',
    description: 'L’activer par défaut au prochain démarrage.',
  },
]

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Écriture impossible.'
}

export function SettingsPanel({
  store,
  onPreferencesChange,
}: {
  store: SettingsPort
  onPreferencesChange?: () => void
}) {
  const [preferences, setPreferences] = useState<Preferences>()
  const [loadingError, setLoadingError] = useState<string>()
  const [saving, setSaving] = useState<PreferenceKey>()
  const [savingError, setSavingError] = useState<string>()
  const [page, setPage] = useState<SettingsPage>('preferences')

  useEffect(() => {
    let active = true
    void store.getPreferences().then(
      (value) => active && setPreferences(value),
      (error: unknown) => active && setLoadingError(messageFor(error)),
    )
    return () => {
      active = false
    }
  }, [store])

  const toggle = async (key: PreferenceKey) => {
    if (!preferences || saving) return
    setSaving(key)
    setSavingError(undefined)
    try {
      const next = await store.savePreferences({ [key]: !preferences[key] })
      setPreferences(next)
      onPreferencesChange?.()
    } catch (error) {
      setSavingError(`Réglage non enregistré : ${messageFor(error)}`)
    } finally {
      setSaving(undefined)
    }
  }

  const pageIndex = PAGES.indexOf(page)

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 py-3">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-accent-readable">Carnet local</p>
          <h1 className="display mt-1 text-4xl">Réglages</h1>
        </div>
        <p className="num pb-1 text-xs text-muted" aria-label={`Page ${pageIndex + 1} sur 4`}>
          {pageIndex + 1} / 4
        </p>
      </header>

      {page === 'preferences' ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">Pendant la séance</h2>
          {loadingError ? (
            <p className="mt-3 text-sm text-bad" role="alert">
              Réglages indisponibles : {loadingError}
            </p>
          ) : preferences ? (
            <div className="mt-2 divide-y divide-line">
              {CONTROLS.map((control) => {
                const enabled = preferences[control.key]
                return (
                  <div key={control.key} className="flex min-h-16 items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{control.label}</p>
                      <p className="mt-0.5 text-xs leading-4 text-muted">{control.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={control.label}
                      disabled={Boolean(saving)}
                      className={`min-h-11 min-w-20 rounded-full border px-3 text-sm font-bold disabled:opacity-50 ${
                        enabled ? 'border-ok/60 bg-ok/15 text-ok' : 'border-line bg-bg text-muted'
                      }`}
                      onClick={() => void toggle(control.key)}
                    >
                      {saving === control.key ? 'Écriture…' : enabled ? 'Activé' : 'Coupé'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted" role="status">
              Lecture des réglages…
            </p>
          )}
          {savingError ? (
            <p className="mt-3 text-sm text-bad" role="alert">
              {savingError}
            </p>
          ) : null}
        </section>
      ) : null}

      {page === 'hardware' ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">Matériel connu</h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Barre olympique</dt>
              <dd className="num font-semibold">20 kg</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Chariot presse 45°</dt>
              <dd className="num text-right font-semibold">75,7 kg · hors saisie</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Pas haltères</dt>
              <dd className="num font-semibold">2 kg</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Pas barre</dt>
              <dd className="num font-semibold">2,5 kg</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Lecture seule · la charge de presse saisie exclut le chariot.
          </p>
        </section>
      ) : null}

      {page === 'export' ? <ExportPanel store={store} section="export" /> : null}
      {page === 'import' ? <ExportPanel store={store} section="import" /> : null}

      <nav className="mt-auto grid grid-cols-2 gap-2" aria-label="Pages des réglages">
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-3 font-semibold text-muted disabled:opacity-30"
          disabled={pageIndex === 0}
          onClick={() => setPage(PAGES[pageIndex - 1])}
        >
          Précédent
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-accent-action px-3 font-semibold text-fg disabled:opacity-30"
          disabled={pageIndex === PAGES.length - 1}
          onClick={() => setPage(PAGES[pageIndex + 1])}
        >
          {page === 'preferences'
            ? 'Suivant : Matériel'
            : page === 'hardware'
              ? 'Suivant : Export'
              : 'Suivant : Import'}
        </button>
      </nav>
    </main>
  )
}
