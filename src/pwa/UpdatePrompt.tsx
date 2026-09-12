import { useState, useSyncExternalStore } from 'react'
import type { CarnetStore } from '../db/contracts'
import { isBlankDraft } from '../db/draft'
import { pwaUpdates, type PwaUpdateController } from './register'

export type UpdateStore = Pick<CarnetStore, 'loadDraft' | 'saveDraft'>

/**
 * Propose la nouvelle version sans interrompre une séance.
 *
 * Le contrôle est refait au clic, dans le store : le bandeau peut être resté affiché
 * pendant qu'une série commençait. Un brouillon vierge peut être sauvegardé puis
 * remplacé sans perte ; un brouillon commencé bloque l'activation.
 */
export function UpdatePrompt({
  store,
  controller = pwaUpdates,
}: {
  store: UpdateStore
  controller?: PwaUpdateController
}) {
  const { updateAvailable } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState<string>()

  if (!updateAvailable) return null

  const apply = async () => {
    setApplying(true)
    setMessage(undefined)
    try {
      const draft = await store.loadDraft()
      if (draft && !isBlankDraft(draft)) {
        setMessage("Termine ta séance avant d'appliquer la mise à jour.")
        return
      }
      if (draft) await store.saveDraft(draft)
      await controller.apply()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Mise à jour impossible.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <aside
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-accent/60 bg-surface p-4 shadow-2xl"
      aria-labelledby="pwa-update-title"
    >
      <p className="font-bold" id="pwa-update-title">
        Mise à jour disponible
      </p>
      <p className="mt-1 text-sm text-muted">Applique-la maintenant ou garde cette version.</p>
      {message ? (
        <p className="mt-2 text-sm text-warn" role="alert">
          {message}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-3 font-semibold text-fg"
          onClick={() => {
            setMessage(undefined)
            controller.dismiss()
          }}
          disabled={applying}
        >
          Plus tard
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-accent px-3 font-semibold text-bg"
          onClick={() => void apply()}
          disabled={applying}
        >
          {applying ? 'Sauvegarde…' : 'Mettre à jour'}
        </button>
      </div>
    </aside>
  )
}
