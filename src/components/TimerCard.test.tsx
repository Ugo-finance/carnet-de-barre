import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimerCard } from './TimerCard'

describe('TimerCard', () => {
  it('affiche le temps restant et expose les trois actions tactiles', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const onAdjust = vi.fn()
    const onStop = vi.fn()
    render(<TimerCard endsAt={150_000} label="Récup Squat" onAdjust={onAdjust} onStop={onStop} />)

    expect(screen.getByRole('timer')).toHaveTextContent('2:30')
    fireEvent.click(screen.getByRole('button', { name: '−30 s' }))
    fireEvent.click(screen.getByRole('button', { name: '+30 s' }))
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }))
    expect(onAdjust.mock.calls).toEqual([[-30_000], [30_000]])
    expect(onStop).toHaveBeenCalledOnce()
    expect(screen.getByText(/Pas d’alarme garantie écran verrouillé/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('indique clairement quand les deux notifications sont coupées', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    render(
      <TimerCard
        endsAt={150_000}
        label="Récup Squat"
        onAdjust={() => {}}
        onStop={() => {}}
        notifications={{ sound: false, vibration: false }}
      />,
    )

    expect(screen.getByText('Son et vibration coupés dans Réglages.')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
