import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EmailSession, PasswordAuthPort } from './PasswordLogin'

export const CARNET_SUPABASE_URL = 'https://rtxdtiysrdgzsomatwon.supabase.co'

export interface EmailAuthEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export type EmailAuthConfiguration =
  | { auth: PasswordAuthPort; client: SupabaseClient; error?: never }
  | { auth?: never; client?: never; error: string }

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

/**
 * Supabase répond `invalid_credentials` aussi bien pour une adresse sans compte que pour
 * un mauvais mot de passe, volontairement : le message ne doit pas trahir qu'un compte
 * existe. On garde cette ambiguïté plutôt que d'en deviner une moitié.
 */
function frenchAuthError(
  error: { code?: string; status?: number } | null,
  fallback: string,
): Error {
  switch (error?.code) {
    case 'invalid_credentials':
      return new Error('adresse ou mot de passe incorrect')
    case 'email_address_invalid':
      return new Error('cette adresse e-mail n’est pas valide')
    case 'email_not_confirmed':
      return new Error('ce compte n’est pas encore confirmé dans Supabase')
    case 'user_banned':
      return new Error('ce compte de sauvegarde est suspendu')
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
export function supabasePasswordAuth(client: SupabaseClient): PasswordAuthPort {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw frenchAuthError(error, 'la session enregistrée ne peut pas être lue')
      return data.session ? sessionEmail(data.session.user.email) : null
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw frenchAuthError(error, 'le service de connexion ne répond pas')
      if (!data.session) throw new Error('la connexion a été acceptée sans ouvrir de session')
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
 * Portail Paie ne doit pas pouvoir y ouvrir une session par erreur. Aucun lien n'est lu
 * dans l'URL : la session naît dans la PWA installée, là où elle doit rester.
 */
export function configureEmailAuth(
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
  return { auth: supabasePasswordAuth(client), client }
}

/** Configuration Vite lue uniquement quand la page Sauvegarde charge ce module. */
export function configureEmailAuthFromVite(): EmailAuthConfiguration {
  return configureEmailAuth({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
}
