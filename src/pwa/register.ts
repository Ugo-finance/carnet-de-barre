import { registerSW } from 'virtual:pwa-register'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

export interface PwaUpdateSnapshot {
  updateAvailable: boolean
}

type Register = (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>

export interface PwaUpdateController {
  getSnapshot(): PwaUpdateSnapshot
  subscribe(listener: () => void): () => void
  register(): void
  apply(): Promise<void>
  dismiss(): void
}

/**
 * Petit magasin externe pour relier le callback Workbox à React.
 *
 * Il ne décide jamais seul d'activer une version : `apply` n'est appelée que par le
 * bandeau, après vérification du brouillon. Ce découpage rend l'absence de
 * rechargement automatique explicite et testable.
 */
export function createPwaUpdateController(register: Register): PwaUpdateController {
  let snapshot: PwaUpdateSnapshot = { updateAvailable: false }
  let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined
  let registered = false
  const listeners = new Set<() => void>()

  const publish = (updateAvailable: boolean) => {
    snapshot = { updateAvailable }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    register() {
      if (registered) return
      registered = true
      applyUpdate = register({
        immediate: true,
        onNeedRefresh() {
          publish(true)
        },
        onOfflineReady() {
          console.info('[pwa] prêt hors ligne')
        },
        onRegisterError(error: unknown) {
          console.error('[pwa] enregistrement impossible', error)
        },
      })
    },
    async apply() {
      if (!applyUpdate) throw new Error("Le service worker n'est pas prêt.")
      await applyUpdate(true)
      publish(false)
    },
    dismiss() {
      publish(false)
    },
  }
}

export const pwaUpdates = createPwaUpdateController(registerSW)

/**
 * Enregistre le service worker sans jamais recharger automatiquement (D10).
 * Une nouvelle version ne fait qu'ouvrir le bandeau : seul le geste d'Ugo l'active.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  pwaUpdates.register()
}
