import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EmailCodeAuthPort, EmailSession } from './EmailCodeLogin'

export const CARNET_SUPABASE_URL = 'https://rtxdtiysrdgzsomatwon.supabase.co'

export interface EmailAuthEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export type EmailAuthConfiguration =
  { auth: EmailCodeAuthPort; error?: never } | { auth?: never; error: string }

type ClientFactory = (
  url: string,
  key: string,
  options: {
    auth: {
      persistSession: boolean
      autoRefreshToken: boolean
      detectSessionInUrl: boolean
    }
  },
) => SupabaseClient

function frenchAuthError(
  error: { code?: string; status?: number } | null,
  fallback: string,
): Error {
  switch (error?.code) {
    case 'over_email_send_rate_limit':
      return new Error('un code vient déjà d’être envoyé, attends un instant')
    case 'email_address_invalid':
      return new Error('cette adresse e-mail n’est pas valide')
    case 'otp_expired':
      return new Error('ce code a expiré, demande un nouveau code')
    case 'invalid_credentials':
      return new Error('ce code est incorrect ou expiré')
  }
  if (error?.status === 429) {
    return new Error('trop de tentatives, attends un instant')
  }
  return new Error(fallback)
}

function sessionEmail(email: string | undefined): EmailSession {
  if (!email) throw new Error('la session reçue ne contient pas d’adresse e-mail')
  return { email }
}

/** Adapte le SDK au petit port compris par l'écran. */
export function supabaseEmailCodeAuth(client: SupabaseClient): EmailCodeAuthPort {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw frenchAuthError(error, 'la session enregistrée ne peut pas être lue')
      return data.session ? sessionEmail(data.session.user.email) : null
    },

    async sendCode(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) throw frenchAuthError(error, 'le service de connexion ne répond pas')
    },

    async verifyCode(email, code) {
      const { data, error } = await client.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })
      if (error) throw frenchAuthError(error, 'le code ne peut pas être vérifié')
      if (!data.session) throw new Error('le code a été accepté sans ouvrir de session')
      return sessionEmail(data.session.user.email)
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw frenchAuthError(error, 'la session ne peut pas être fermée')
    },
  }
}

/**
 * Construit le client persistant de la PWA, ou un refus visible.
 *
 * L'URL est contrôlée avant même de créer le client : une variable Vercel copiée depuis
 * Portail Paie ne doit pas pouvoir y inscrire un compte par erreur. Le lien magique est
 * ignoré volontairement ; le code est saisi dans le contexte de la PWA installée, là où
 * sa session doit rester.
 */
export function configureEmailCodeAuth(
  environment: EmailAuthEnvironment,
  factory: ClientFactory = (url, key, options) => createClient(url, key, options),
): EmailAuthConfiguration {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) {
    return { error: 'La connexion à la sauvegarde n’est pas configurée sur cette installation.' }
  }
  if (url !== CARNET_SUPABASE_URL) {
    return { error: 'La sauvegarde refuse une configuration qui ne vise pas le projet du carnet.' }
  }

  const client = factory(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return { auth: supabaseEmailCodeAuth(client) }
}

/** Configuration Vite lue uniquement quand la page Sauvegarde charge ce module. */
export function configureEmailCodeAuthFromVite(): EmailAuthConfiguration {
  return configureEmailCodeAuth({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
}
