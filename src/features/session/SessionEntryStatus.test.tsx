import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionEntryStatus } from './SessionEntryStatus'

describe('SessionEntryStatus', () => {
  it('annonce la préparation pendant la lecture des données', () => {
    render(<SessionEntryStatus status="loading" />)

    expect(screen.getByRole('status')).toHaveTextContent('Préparation de ta séance…')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('présente le motif utile lorsque le carnet ne peut pas être ouvert', () => {
    render(
      <SessionEntryStatus
        status="error"
        message="La base locale n’a pas pu être ouverte."
        onRetry={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert', { name: 'Carnet indisponible' })
    expect(alert).toHaveTextContent('La base locale n’a pas pu être ouverte.')
  })

  it('relance la préparation uniquement après le geste explicite', () => {
    const onRetry = vi.fn()
    render(<SessionEntryStatus status="error" message="Lecture impossible." onRetry={onRetry} />)

    expect(onRetry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('bloque les relances concurrentes pendant un nouvel essai', () => {
    const onRetry = vi.fn()
    render(
      <SessionEntryStatus
        status="error"
        message="Lecture impossible."
        retrying
        onRetry={onRetry}
      />,
    )

    const retry = screen.getByRole('button', { name: 'Nouvel essai…' })
    expect(retry).toBeDisabled()
    fireEvent.click(retry)
    expect(onRetry).not.toHaveBeenCalled()
  })
})
