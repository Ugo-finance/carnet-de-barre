/**
 * Un chargement manqué de la configuration ne se mémorise pas — CB-79e.
 *
 * Hors ligne au premier lancement, le module du SDK peut manquer. Si l'échec restait en
 * mémoire, la sauvegarde resterait coupée pour toute la session, même réseau revenu.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

describe('la configuration partagée', () => {
  it('réessaie après un échec, puis garde la réussite', async () => {
    const configurer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('module indisponible')
      })
      .mockImplementation(() => ({ error: 'non configurée' }))
    vi.doMock('../features/export/supabaseAuth.ts', () => ({
      configureEmailAuthFromVite: configurer,
    }))
    const { configurationPartagee } = await import('./demarrage.ts')

    await expect(configurationPartagee()).rejects.toThrow('module indisponible')
    await expect(configurationPartagee()).resolves.toEqual({ error: 'non configurée' })
    await configurationPartagee()
    expect(configurer).toHaveBeenCalledTimes(2)
  })
})
