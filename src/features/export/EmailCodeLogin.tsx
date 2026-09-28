import { useEffect, useState, type FormEvent } from 'react'

export interface EmailSession {
  email: string
}

/**
 * Frontière de l'écran d'authentification.
 *
 * Le composant ne connaît ni le SDK ni le stockage de session. L'adaptateur Supabase
 * transforme ses réponses en ces quatre intentions ; les tests peuvent donc éprouver
 * le clavier, les erreurs et les transitions sans envoyer un seul e-mail.
 */
export interface EmailCodeAuthPort {
  getSession(): Promise<EmailSession | null>
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<EmailSession>
  signOut(): Promise<void>
}

type Step = 'email' | 'code'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function EmailCodeLogin({ auth }: { auth: EmailCodeAuthPort }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<EmailSession | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
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

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault()
    const address = email.trim()
    if (!address || busy) return

    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await auth.sendCode(address)
      setEmail(address)
      setCode('')
      setStep('code')
      setNotice(`Code envoyé à ${address}.`)
    } catch (cause) {
      setError(`Code non envoyé : ${errorMessage(cause, 'réessaie dans un instant')}`)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault()
    if (code.length !== 6 || busy) return

    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const nextSession = await auth.verifyCode(email, code)
      setSession(nextSession)
      setCode('')
    } catch (cause) {
      setError(`Code non vérifié : ${errorMessage(cause, 'vérifie le code reçu')}`)
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
      setStep('email')
      setCode('')
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
      {step === 'email' ? (
        <form className="grid gap-3" onSubmit={(event) => void sendCode(event)}>
          <div>
            <label className="text-sm font-semibold" htmlFor="backup-email">
              Adresse e-mail
            </label>
            <input
              id="backup-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent-readable"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-accent-action px-4 font-bold text-fg disabled:opacity-50"
            disabled={busy || email.trim().length === 0}
          >
            {busy ? 'Envoi du code…' : 'Recevoir un code par e-mail'}
          </button>
        </form>
      ) : (
        <form className="grid gap-3" onSubmit={(event) => void verifyCode(event)}>
          <p className="text-sm text-muted">
            Saisis le code reçu à <strong className="break-all text-fg">{email}</strong> dans cette
            app.
          </p>
          <div>
            <label className="text-sm font-semibold" htmlFor="backup-email-code">
              Code à 6 chiffres
            </label>
            <input
              id="backup-email-code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className="num mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-center text-xl tracking-[0.35em] text-fg outline-none focus:border-accent-readable"
              value={code}
              onChange={(event) => setCode(digitsOnly(event.target.value))}
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-accent-action px-4 font-bold text-fg disabled:opacity-50"
            disabled={busy || code.length !== 6}
          >
            {busy ? 'Vérification…' : 'Valider le code'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-muted disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setStep('email')
                setCode('')
                setError(undefined)
                setNotice(undefined)
              }}
            >
              Modifier l’adresse
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-muted disabled:opacity-50"
              disabled={busy}
              onClick={() => void sendCode()}
            >
              Renvoyer le code
            </button>
          </div>
        </form>
      )}

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
