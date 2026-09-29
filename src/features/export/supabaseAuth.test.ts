import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { CARNET_SUPABASE_URL, configureEmailAuth, supabasePasswordAuth } from './supabaseAuth'

function clientAuth() {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({
      data: { session: { user: { email: 'ugo@example.ch' } } },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return { auth, client: { auth } as unknown as SupabaseClient }
}

describe('adaptateur de connexion Supabase', () => {
  it('refuse une configuration absente ou dirigée vers un autre projet', () => {
    const factory = vi.fn()

    expect(configureEmailAuth({}, factory)).toEqual({
      error: 'La connexion à la sauvegarde n’est pas configurée sur cette installation.',
    })
    expect(
      configureEmailAuth(
        {
          VITE_SUPABASE_URL: 'https://portail-paie.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'publique',
        },
        factory,
      ),
    ).toEqual({
      error: 'La sauvegarde refuse une configuration qui ne vise pas le projet du carnet.',
    })
    expect(factory).not.toHaveBeenCalled()
  })

  it('crée une session persistante sans jamais lire de lien dans l’URL', () => {
    const { client } = clientAuth()
    const factory = vi.fn(() => client)

    const configuration = configureEmailAuth(
      {
        VITE_SUPABASE_URL: CARNET_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'publique',
      },
      factory,
    )

    expect(configuration.auth).toBeDefined()
    expect(configuration.client).toBe(client)
    expect(factory).toHaveBeenCalledWith(CARNET_SUPABASE_URL, 'publique', {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  })

  it('se connecte par mot de passe avec le SDK', async () => {
    const { auth, client } = clientAuth()

    await expect(supabasePasswordAuth(client).signIn('ugo@example.ch', 'barre')).resolves.toEqual({
      email: 'ugo@example.ch',
    })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ugo@example.ch',
      password: 'barre',
    })
  })

  it('ne dit pas lequel de l’adresse ou du mot de passe est faux', async () => {
    const { auth, client } = clientAuth()
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'invalid_credentials', status: 400 },
    } as never)

    await expect(supabasePasswordAuth(client).signIn('inconnue@example.ch', 'x')).rejects.toThrow(
      'adresse ou mot de passe incorrect',
    )
  })

  it('traduit les refus et ne prétend pas qu’une session existe', async () => {
    const { auth, client } = clientAuth()
    auth.signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null },
        error: { code: 'over_request_rate_limit', status: 429 },
      } as never)
      .mockResolvedValueOnce({
        data: { session: null },
        error: { code: 'email_not_confirmed', status: 400 },
      } as never)
      .mockResolvedValueOnce({ data: { session: null }, error: null } as never)
    const port = supabasePasswordAuth(client)

    await expect(port.signIn('ugo@example.ch', 'barre')).rejects.toThrow(/trop de tentatives/)
    await expect(port.signIn('ugo@example.ch', 'barre')).rejects.toThrow(/pas encore confirmé/)
    await expect(port.signIn('ugo@example.ch', 'barre')).rejects.toThrow(/sans ouvrir de session/)
  })

  it('relit la session locale et se déconnecte seulement de cet appareil', async () => {
    const { auth, client } = clientAuth()
    auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { email: 'ugo@example.ch' } } },
      error: null,
    } as never)
    const port = supabasePasswordAuth(client)

    await expect(port.getSession()).resolves.toEqual({ email: 'ugo@example.ch' })
    await port.signOut()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
