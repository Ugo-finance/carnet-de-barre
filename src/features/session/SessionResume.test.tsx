import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionResume } from './SessionResume'

function props() {
  return {
    type: 'A' as const,
    date: '2026-09-15',
    dateLabel: '15.09.2026',
    completedSets: 7,
    totalSets: 23,
    updatedLabel: 'il y a 2 min',
    onResume: vi.fn(),
    onAbandon: vi.fn(),
  }
}

describe('SessionResume', () => {
  it('présente la séance active et son avancement réel', () => {
    render(<SessionResume {...props()} />)

    expect(screen.getByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.getByText('15.09.2026')).toHaveAttribute('datetime', '2026-09-15')
    expect(screen.getByText('7/23 séries terminées')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avancement de la séance' })).toHaveAttribute(
      'aria-valuetext',
      '7/23 séries terminées',
    )
    expect(screen.getByText('Dernière sauvegarde : il y a 2 min')).toBeInTheDocument()
  })

  it('reprend la séance en un geste', () => {
    const callbacks = props()
    render(<SessionResume {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre la séance' }))

    expect(callbacks.onResume).toHaveBeenCalledOnce()
  })

  it('demande une confirmation avant tout abandon', () => {
    const callbacks = props()
    render(<SessionResume {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))

    expect(callbacks.onAbandon).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Abandonner la séance A ?' })).toBeInTheDocument()
  })

  it('permet de revenir sans perdre le brouillon', () => {
    const callbacks = props()
    render(<SessionResume {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Garder la séance' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(callbacks.onAbandon).not.toHaveBeenCalled()
  })

  it('n’abandonne qu’après confirmation explicite', () => {
    const callbacks = props()
    render(<SessionResume {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }))

    expect(callbacks.onAbandon).toHaveBeenCalledOnce()
  })

  it('bloque les actions concurrentes pendant une reprise', () => {
    const callbacks = props()
    render(<SessionResume {...callbacks} resuming />)

    expect(screen.getByRole('button', { name: 'Reprise…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Abandonner la séance' })).toBeDisabled()
  })

  it('conserve l’écran de reprise lorsqu’une écriture échoue', () => {
    render(<SessionResume {...props()} errorMessage="Reprise impossible. Réessaie." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Reprise impossible. Réessaie.')
    expect(screen.getByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
  })
})
