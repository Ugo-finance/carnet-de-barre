import { registerSW } from 'virtual:pwa-register'

/**
 * Enregistre le service worker sans jamais recharger automatiquement (D10).
 * La mise à jour sera proposée par l'interface (CB-41) ; en attendant, on la journalise.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.info('[pwa] mise à jour disponible — appliquée au prochain lancement')
    },
    onOfflineReady() {
      console.info('[pwa] prêt hors ligne')
    },
  })
}
