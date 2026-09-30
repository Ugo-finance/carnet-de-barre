/**
 * Le démarrage face à un client Supabase simulé — CB-79e.
 *
 * Deux chemins qu'un environnement sans configuration n'atteint jamais :
 *
 * - **la connexion et la déconnexion.** La première sauvegarde après la connexion d'Ugo
 *   dépend entièrement de cet abonnement (P2 de Codex sur #87) ;
 * - **un chargement manqué.** Hors ligne au premier lancement, le module du SDK peut
 *   manquer ; si l'échec restait en mémoire, la sauvegarde resterait coupée pour la
 *   session, même le réseau revenu.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Rappel = (evenement: string) => void

function fauxClient() {
  let rappel: Rappel | undefined
  const unsubscribe = vi.fn()
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn((fn: Rappel) => {
        rappel = fn
        return { data: { subscription: { unsubscribe } } }
      }),
    },
  }
  return { client, unsubscribe, emettre: (evenement: string) => rappel?.(evenement) }
}

async function chargerAvec(configurer: () => unknown) {
  vi.doMock('../features/export/supabaseAuth.ts', () => ({
    configureEmailAuthFromVite: configurer,
  }))
  return import('./demarrage.ts')
}

describe('le démarrage avec un client', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.doUnmock('../features/export/supabaseAuth.ts')
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('demande un passage à la connexion et à la déconnexion, hors du rappel du SDK', async () => {
    const faux = fauxClient()
    const { demarrerSauvegarde, moteurSauvegarde } = await chargerAvec(() => ({
      auth: {},
      client: faux.client,
    }))
    const demander = vi.spyOn(moteurSauvegarde, 'demander').mockImplementation(() => {})
    const arreter = demarrerSauvegarde()
    await vi.waitFor(() => expect(faux.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(demander).toHaveBeenCalledTimes(1))

    vi.useFakeTimers()
    faux.emettre('SIGNED_IN')
    // Pas pendant le rappel : le SDK y tient son verrou, et le passage relit la session.
    expect(demander).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(demander).toHaveBeenCalledTimes(2)

    faux.emettre('TOKEN_REFRESHED')
    vi.runAllTimers()
    expect(demander).toHaveBeenCalledTimes(2)

    faux.emettre('SIGNED_OUT')
    vi.runAllTimers()
    expect(demander).toHaveBeenCalledTimes(3)

    arreter()
    expect(faux.unsubscribe).toHaveBeenCalledTimes(1)
    faux.emettre('SIGNED_IN')
    vi.runAllTimers()
    expect(demander).toHaveBeenCalledTimes(3)
  })

  it('réessaie le chargement après un échec, puis garde la réussite', async () => {
    const configurer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('module indisponible')
      })
      .mockImplementation(() => ({ error: 'non configurée' }))
    const { configurationPartagee } = await chargerAvec(configurer)

    await expect(configurationPartagee()).rejects.toThrow('module indisponible')
    await expect(configurationPartagee()).resolves.toEqual({ error: 'non configurée' })
    await configurationPartagee()
    expect(configurer).toHaveBeenCalledTimes(2)
  })
})
