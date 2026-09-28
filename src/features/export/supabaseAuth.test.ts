import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { CARNET_SUPABASE_URL, configureEmailCodeAuth, supabaseEmailCodeAuth } from './supabaseAuth'

function clientAuth() {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async () => ({
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

    expect(configureEmailCodeAuth({}, factory)).toEqual({
      error: 'La connexion à la sauvegarde n’est pas configurée sur cette installation.',
    })
    expect(
      configureEmailCodeAuth(
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

  it('crée une session persistante sans jamais importer un lien magique', () => {
    const { client } = clientAuth()
    const factory = vi.fn(() => client)

    const configuration = configureEmailCodeAuth(
      {
        VITE_SUPABASE_URL: CARNET_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'publique',
      },
      factory,
    )

    expect(configuration.auth).toBeDefined()
    expect(factory).toHaveBeenCalledWith(CARNET_SUPABASE_URL, 'publique', {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  })

  it('envoie puis vérifie le code e-mail avec le SDK', async () => {
    const { auth, client } = clientAuth()
    const port = supabaseEmailCodeAuth(client)

    await port.sendCode('ugo@example.ch')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ugo@example.ch',
      options: { shouldCreateUser: true },
    })

    await expect(port.verifyCode('ugo@example.ch', '123456')).resolves.toEqual({
      email: 'ugo@example.ch',
    })
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'ugo@example.ch',
      token: '123456',
      type: 'email',
    })
  })

  it('traduit les refus et ne prétend pas qu’une session existe', async () => {
    const { auth, client } = clientAuth()
    auth.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { code: 'over_email_send_rate_limit', status: 429 },
    } as never)
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'otp_expired' },
    } as never)
    const port = supabaseEmailCodeAuth(client)

    await expect(port.sendCode('ugo@example.ch')).rejects.toThrow(/déjà.*envoyé/)
    await expect(port.verifyCode('ugo@example.ch', '123456')).rejects.toThrow(/expiré/)
  })

  it('relit la session locale et se déconnecte seulement de cet appareil', async () => {
    const { auth, client } = clientAuth()
    auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { email: 'ugo@example.ch' } } },
      error: null,
    } as never)
    const port = supabaseEmailCodeAuth(client)

    await expect(port.getSession()).resolves.toEqual({ email: 'ugo@example.ch' })
    await port.signOut()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
