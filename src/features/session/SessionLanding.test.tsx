import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionLanding } from './SessionLanding'

function props() {
  return {
    suggestedType: 'C' as const,
    selectedType: 'C' as const,
    date: '2026-09-20',
    dateLabel: '20.09.2026',
    scheduleLabel: 'Dimanche · Soulevé de terre + haut du corps',
    exercises: [
      { id: 'deadlift', name: 'Soulevé de terre', prescription: '92,5 × 3 @8' },
      { id: 'incline', name: 'Développé incliné', prescription: '3 × 8–12' },
    ],
    warmupCount: 4,
    rushed: false,
    onSelectType: vi.fn(),
    onRushedChange: vi.fn(),
    onStart: vi.fn(),
  }
}

describe('SessionLanding', () => {
  it('présente uniquement les données réelles nécessaires avant la séance', () => {
    render(<SessionLanding {...props()} />)

    expect(screen.getByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(screen.getByText('Dimanche · Soulevé de terre + haut du corps')).toBeInTheDocument()
    expect(screen.getByText('20.09.2026')).toHaveAttribute('datetime', '2026-09-20')

    expect(screen.getByText('Échauffement · 4 paliers')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Contenu de la séance C' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance C' }))
    const contenu = screen.getByRole('list', { name: 'Contenu de la séance C' })
    expect(within(contenu).getByText('Soulevé de terre')).toBeInTheDocument()
    expect(within(contenu).getByText('92,5 × 3 @8')).toBeInTheDocument()

    expect(screen.queryByText(/Semaine 1\/8/)).not.toBeInTheDocument()
    expect(screen.queryByText(/tendance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument()
  })

  it('garde le choix A/B/C local tant que C’est parti n’est pas pressé', () => {
    const callbacks = props()
    render(<SessionLanding {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Séance A' }))

    expect(callbacks.onSelectType).toHaveBeenCalledWith('A')
    expect(callbacks.onStart).not.toHaveBeenCalled()
  })

  it('sépare le choix de séance de la confirmation des cibles', () => {
    const callbacks = props()
    render(<SessionLanding {...callbacks} selectedType="B" />)

    expect(screen.getByText('Séance manuelle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance B' }))

    expect(screen.getByRole('heading', { name: 'Cibles du jour' })).toBeInTheDocument()
    expect(callbacks.onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    expect(callbacks.onStart).toHaveBeenCalledOnce()
  })

  it('expose le mode pressé comme un interrupteur accessible', () => {
    const callbacks = props()
    render(<SessionLanding {...callbacks} rushed />)

    const toggle = screen.getByRole('switch', { name: 'Mode pressé' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)

    expect(callbacks.onRushedChange).toHaveBeenCalledWith(false)
  })

  it('bloque les doubles démarrages pendant l’écriture', () => {
    const callbacks = props()
    const { rerender } = render(<SessionLanding {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance C' }))
    rerender(<SessionLanding {...callbacks} starting />)
    const start = screen.getByRole('button', { name: 'Démarrage…' })
    expect(start).toBeDisabled()
    fireEvent.click(start)

    expect(callbacks.onStart).not.toHaveBeenCalled()
  })

  it('rend une erreur d’écriture sans quitter l’accueil', () => {
    render(<SessionLanding {...props()} errorMessage="Sauvegarde impossible. Réessaie." />)

    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance C' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Sauvegarde impossible. Réessaie.')
    expect(screen.getByRole('button', { name: 'C’est parti' })).toBeInTheDocument()
  })

  it('n’exécute aucune intention utilisateur au montage', () => {
    const callbacks = props()
    render(<SessionLanding {...callbacks} warmupCount={1} />)

    expect(screen.getByText('Échauffement · 1 palier')).toBeInTheDocument()
    expect(callbacks.onSelectType).not.toHaveBeenCalled()
    expect(callbacks.onRushedChange).not.toHaveBeenCalled()
    expect(callbacks.onStart).not.toHaveBeenCalled()
  })
})
