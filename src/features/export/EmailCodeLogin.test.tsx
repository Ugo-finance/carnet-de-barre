import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmailCodeLogin, type EmailCodeAuthPort } from './EmailCodeLogin'

function authPort(session: { email: string } | null = null): EmailCodeAuthPort {
  return {
    getSession: vi.fn(async () => session),
    sendCode: vi.fn(async () => undefined),
    verifyCode: vi.fn(async (email) => ({ email })),
    signOut: vi.fn(async () => undefined),
  }
}

describe('connexion par code e-mail', () => {
  it('lit la session avant de proposer une adresse', async () => {
    let resolveSession!: (session: null) => void
    const auth = authPort()
    vi.mocked(auth.getSession).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )

    render(<EmailCodeLogin auth={auth} />)

    expect(screen.getByRole('status')).toHaveTextContent('Vérification de la connexion')
    expect(screen.queryByLabelText('Adresse e-mail')).not.toBeInTheDocument()
    resolveSession(null)
    expect(await screen.findByLabelText('Adresse e-mail')).toHaveAttribute('autocomplete', 'email')
  })

  it('envoie le code à l’adresse nettoyée puis le vérifie dans la même app', async () => {
    const auth = authPort()
    render(<EmailCodeLogin auth={auth} />)

    const email = await screen.findByLabelText('Adresse e-mail')
    fireEvent.change(email, { target: { value: '  ugo@example.ch  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir un code par e-mail' }))

    await waitFor(() => expect(auth.sendCode).toHaveBeenCalledWith('ugo@example.ch'))
    expect(await screen.findByRole('status')).toHaveTextContent('Code envoyé à ugo@example.ch')

    const code = screen.getByLabelText('Code à 6 chiffres')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    fireEvent.change(code, { target: { value: '12a34 56' } })
    expect(code).toHaveValue('123456')
    fireEvent.click(screen.getByRole('button', { name: 'Valider le code' }))

    await waitFor(() => expect(auth.verifyCode).toHaveBeenCalledWith('ugo@example.ch', '123456'))
    expect(await screen.findByText('Connexion active')).toBeInTheDocument()
    expect(screen.getByText('ugo@example.ch')).toBeInTheDocument()
  })

  it('conserve l’étape du code et explique un refus sans annoncer de connexion', async () => {
    const auth = authPort()
    vi.mocked(auth.verifyCode).mockRejectedValueOnce(new Error('ce code a expiré'))
    render(<EmailCodeLogin auth={auth} />)

    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), {
      target: { value: 'ugo@example.ch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir un code par e-mail' }))
    fireEvent.change(await screen.findByLabelText('Code à 6 chiffres'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider le code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Code non vérifié : ce code a expiré',
    )
    expect(screen.getByLabelText('Code à 6 chiffres')).toBeInTheDocument()
    expect(screen.queryByText('Connexion active')).not.toBeInTheDocument()
  })

  it('affiche la session existante et ne la retire qu’après la déconnexion confirmée', async () => {
    let resolveSignOut!: () => void
    const auth = authPort({ email: 'ugo@example.ch' })
    vi.mocked(auth.signOut).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignOut = resolve
      }),
    )
    render(<EmailCodeLogin auth={auth} />)

    expect(await screen.findByText('Connexion active')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter de cet appareil' }))
    expect(screen.getByText('Déconnexion…')).toBeInTheDocument()
    expect(screen.getByText('ugo@example.ch')).toBeInTheDocument()

    resolveSignOut()
    expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Déconnexion terminée')
  })
})
