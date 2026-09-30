/**
 * Les déclencheurs du moteur, sur l'assemblage réel — CB-79e.
 *
 * Un déclencheur oublié ne se voit pas : l'app dit « à jour » parce qu'aucun passage n'a
 * eu lieu pour dire autre chose. Chacun est donc éprouvé ici, et leur débranchement aussi.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { store } from '../db/store.ts'
import { configurationPartagee, demarrerSauvegarde, moteurSauvegarde } from './demarrage.ts'

// Un `.env` local de développeur donnerait un vrai client ; la CI n'en a pas. Ces tests
// ne doivent dépendre ni de l'un ni de l'autre, et ne jamais parler au projet distant.
vi.stubEnv('VITE_SUPABASE_URL', '')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')

function visibilite(etat: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('le démarrage de la sauvegarde', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lance un passage, puis en demande un à chaque déclencheur, et plus après l’arrêt', async () => {
    const demander = vi.spyOn(moteurSauvegarde, 'demander').mockImplementation(() => {})
    const arreter = demarrerSauvegarde()

    await vi.waitFor(() => expect(demander).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('online'))
    expect(demander).toHaveBeenCalledTimes(2)

    visibilite('hidden')
    expect(demander).toHaveBeenCalledTimes(2)
    visibilite('visible')
    expect(demander).toHaveBeenCalledTimes(3)

    await store.adjustTarget('squat', { w: 80 })
    expect(demander).toHaveBeenCalledTimes(4)

    arreter()
    window.dispatchEvent(new Event('online'))
    visibilite('visible')
    await store.adjustTarget('squat', { w: 82.5 })
    expect(demander).toHaveBeenCalledTimes(4)
  })

  it('ne demande rien quand on l’arrête avant la fin du démarrage', async () => {
    const demander = vi.spyOn(moteurSauvegarde, 'demander').mockImplementation(() => {})
    demarrerSauvegarde()()
    await new Promise((r) => setTimeout(r, 50))
    expect(demander).not.toHaveBeenCalled()
  })

  it('partage une seule configuration entre l’écran et le moteur', async () => {
    expect(configurationPartagee()).toBe(configurationPartagee())
    // Sans variables Supabase dans les tests : un refus visible, et aucun client.
    expect((await configurationPartagee()).client).toBeUndefined()
  })

  it('reste déconnecté sans configuration, sans rien acquitter', async () => {
    moteurSauvegarde.demander()
    await moteurSauvegarde.inactif()
    expect(moteurSauvegarde.etat()).toEqual({ etat: 'deconnecte' })
  })
})
