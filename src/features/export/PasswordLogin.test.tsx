import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PasswordLogin, type PasswordAuthPort } from './PasswordLogin'

function authPort(session: { email: string } | null = null): PasswordAuthPort {
  return {
    getSession: vi.fn(async () => session),
    signIn: vi.fn(async (email) => ({ email })),
    signOut: vi.fn(async () => undefined),
  }
}

describe('connexion par mot de passe', () => {
  it('lit la session avant de proposer une adresse', async () => {
    let resolveSession!: (session: null) => void
    const auth = authPort()
    vi.mocked(auth.getSession).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )

    render(<PasswordLogin auth={auth} />)

    expect(screen.getByRole('status')).toHaveTextContent('Vérification de la connexion')
    expect(screen.queryByLabelText('Adresse e-mail')).not.toBeInTheDocument()
    resolveSession(null)
    expect(await screen.findByLabelText('Adresse e-mail')).toHaveAttribute(
      'autocomplete',
      'username',
    )
  })

  it('laisse le trousseau remplir un vrai champ mot de passe', async () => {
    render(<PasswordLogin auth={authPort()} />)

    const password = await screen.findByLabelText('Mot de passe')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password.closest('form')).toBe(screen.getByLabelText('Adresse e-mail').closest('form'))
  })

  it('n’envoie rien tant que l’adresse ou le mot de passe manque', async () => {
    const auth = authPort()
    render(<PasswordLogin auth={auth} />)
    const connecter = await screen.findByRole('button', { name: 'Se connecter' })

    expect(connecter).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'ugo@example.ch' },
    })
    expect(connecter).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'barre' } })
    expect(connecter).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: '   ' } })
    expect(connecter).toBeDisabled()

    // Entrée au clavier : le formulaire se soumet même quand la commande est grisée.
    const form = connecter.closest('form')!
    fireEvent.submit(form)
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'ugo@example.ch' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: '' } })
    fireEvent.submit(form)
    expect(auth.signIn).not.toHaveBeenCalled()
  })

  it('se connecte avec l’adresse nettoyée et le mot de passe tel quel', async () => {
    const auth = authPort()
    render(<PasswordLogin auth={auth} />)

    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), {
      target: { value: '  ugo@example.ch  ' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: ' barre 20 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('ugo@example.ch', ' barre 20 '))
    expect(await screen.findByText('Connexion active')).toBeInTheDocument()
    expect(screen.getByText('ugo@example.ch')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument()
  })

  it('explique un refus sans annoncer de connexion et garde la saisie', async () => {
    const auth = authPort()
    vi.mocked(auth.signIn).mockRejectedValueOnce(new Error('adresse ou mot de passe incorrect'))
    render(<PasswordLogin auth={auth} />)

    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), {
      target: { value: 'ugo@example.ch' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'faux' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connexion refusée : adresse ou mot de passe incorrect',
    )
    expect(screen.queryByText('Connexion active')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('ugo@example.ch')
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled()
  })

  it('affiche la session existante et ne la retire qu’après la déconnexion confirmée', async () => {
    let resolveSignOut!: () => void
    const auth = authPort({ email: 'ugo@example.ch' })
    vi.mocked(auth.signOut).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignOut = resolve
      }),
    )
    render(<PasswordLogin auth={auth} />)

    expect(await screen.findByText('Connexion active')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter de cet appareil' }))
    expect(screen.getByText('Déconnexion…')).toBeInTheDocument()
    expect(screen.getByText('ugo@example.ch')).toBeInTheDocument()

    resolveSignOut()
    expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Déconnexion terminée')
  })

  it('ne garde pas le mot de passe en mémoire après la connexion', async () => {
    render(<PasswordLogin auth={authPort()} />)

    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), {
      target: { value: 'ugo@example.ch' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'barre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter de cet appareil' }))

    expect(await screen.findByLabelText('Mot de passe')).toHaveValue('')
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('ugo@example.ch')
  })
})
