import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EtatMoteur, MoteurSauvegarde } from '../../sync/moteur'
import { BackupStatus } from './BackupStatus'

function motor(initial: EtatMoteur) {
  let current = initial
  const listeners = new Set<(state: EtatMoteur) => void>()
  const moteur: Pick<MoteurSauvegarde, 'etat' | 'abonner' | 'demander' | 'oublierReconstitution'> =
    {
      etat: () => current,
      abonner(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      demander: vi.fn(),
      oublierReconstitution: vi.fn(async () => {
        publish({ etat: 'a-jour', revision: 3 })
      }),
    }
  function publish(next: EtatMoteur) {
    current = next
    for (const listener of listeners) listener(next)
  }
  return { moteur, publish }
}

describe('état de la sauvegarde', () => {
  it('annonce une attente après panne, et le réessai sans inventer de réussite', () => {
    const { moteur, publish } = motor({ etat: 'deconnecte' })
    render(<BackupStatus moteur={moteur} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => publish({ etat: 'en-cours' }))
    expect(screen.getByRole('status')).toHaveTextContent('Vérification ou envoi')

    act(() => publish({ etat: 'en-attente', erreur: 'réseau indisponible' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sauvegarde en attente')
    expect(screen.getByRole('status')).toHaveTextContent('réseau indisponible')
    expect(screen.queryByText(/Carnet sauvegardé/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la sauvegarde' }))
    expect(moteur.demander).toHaveBeenCalledOnce()
  })

  it('ne dit pas sauvegardé sans révision distante confirmée', () => {
    const { moteur, publish } = motor({ etat: 'a-jour', revision: null })
    render(<BackupStatus moteur={moteur} />)
    expect(screen.getByRole('status')).toHaveTextContent('Aucune sauvegarde distante confirmée')

    act(() => publish({ etat: 'a-jour', revision: 3 }))
    expect(screen.getByRole('status')).toHaveTextContent('Carnet sauvegardé')
    expect(screen.getByRole('status')).toHaveTextContent('Révision distante confirmée : 3')
  })

  it('garde le conflit visible et ne propose aucun écrasement sans comparaison', () => {
    const { moteur, publish } = motor({
      etat: 'decision',
      action: { type: 'conflit', generationLocale: 2, revision: 4 },
    })
    render(<BackupStatus moteur={moteur} />)
    expect(screen.getByRole('status')).toHaveTextContent('Sauvegarde suspendue')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    act(() => publish({ etat: 'decision', action: { type: 'proposer-restauration', revision: 5 } }))
    expect(screen.getByRole('status')).toHaveTextContent('Aucune donnée n’a été remplacée')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explique la reconstitution jusqu’à son accusé de lecture', async () => {
    const { moteur } = motor({
      etat: 'a-jour',
      revision: 3,
      reconstitution: { revisionDisparue: 2 },
    })
    render(<BackupStatus moteur={moteur} />)

    expect(screen.getByText(/reconstituée par un nouvel envoi/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'J’ai compris' }))
    await waitFor(() => expect(moteur.oublierReconstitution).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByText(/reconstituée par un nouvel envoi/)).not.toBeInTheDocument(),
    )
  })
})
