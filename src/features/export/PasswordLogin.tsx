import { useEffect, useState, type FormEvent } from 'react'

export interface EmailSession {
  email: string
}

/**
 * Frontière de l'écran d'authentification.
 *
 * Le composant ne connaît ni le SDK ni le stockage de session. L'adaptateur Supabase
 * transforme ses réponses en ces trois intentions ; les tests peuvent donc éprouver
 * le clavier, les erreurs et les transitions sans joindre un seul serveur.
 *
 * Adresse et mot de passe plutôt qu'un code e-mail — CB-87 : sur l'offre gratuite, un
 * code exige un SMTP personnel. Sans envoi d'e-mail, aucun envoi ne peut tomber en panne.
 */
export interface PasswordAuthPort {
  getSession(): Promise<EmailSession | null>
  signIn(email: string, password: string): Promise<EmailSession>
  signOut(): Promise<void>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function PasswordLogin({ auth }: { auth: PasswordAuthPort }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<EmailSession | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    let active = true
    void auth.getSession().then(
      (current) => {
        if (!active) return
        setSession(current)
        setLoading(false)
      },
      (cause: unknown) => {
        if (!active) return
        setError(`Connexion indisponible : ${errorMessage(cause, 'lecture impossible')}`)
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [auth])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address || !password || busy) return

    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const nextSession = await auth.signIn(address, password)
      setSession(nextSession)
      setEmail(address)
      setPassword('')
    } catch (cause) {
      setError(`Connexion refusée : ${errorMessage(cause, 'réessaie dans un instant')}`)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await auth.signOut()
      setSession(null)
      setNotice('Déconnexion terminée sur cet appareil.')
    } catch (cause) {
      setError(`Déconnexion impossible : ${errorMessage(cause, 'réessaie dans un instant')}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted" role="status">
        Vérification de la connexion…
      </p>
    )
  }

  if (session) {
    return (
      <div className="grid gap-3">
        <div className="rounded-xl border border-ok/40 bg-ok/10 p-3">
          <p className="font-semibold text-ok">Connexion active</p>
          <p className="mt-1 break-all text-sm text-muted">{session.email}</p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-4 font-semibold text-muted disabled:opacity-50"
          disabled={busy}
          onClick={() => void signOut()}
        >
          {busy ? 'Déconnexion…' : 'Se déconnecter de cet appareil'}
        </button>
        {error ? (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <form className="grid gap-3" onSubmit={(event) => void signIn(event)}>
        <div>
          <label className="text-sm font-semibold" htmlFor="backup-email">
            Adresse e-mail
          </label>
          <input
            id="backup-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent-readable"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="backup-password">
            Mot de passe
          </label>
          <input
            id="backup-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent-readable"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-accent-action px-4 font-bold text-fg disabled:opacity-50"
          disabled={busy || email.trim().length === 0 || password.length === 0}
        >
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      {notice ? (
        <p className="text-sm text-ok" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
