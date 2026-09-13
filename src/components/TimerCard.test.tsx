import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimerCard } from './TimerCard'

describe('TimerCard', () => {
  it('affiche le temps restant et expose les trois actions tactiles', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const onAdjust = vi.fn()
    const onStop = vi.fn()
    render(
      <TimerCard
        endsAt={150_000}
        label="Récup Squat"
        keepAwake={false}
        onAdjust={onAdjust}
        onKeepAwakeChange={vi.fn()}
        onStop={onStop}
      />,
    )

    expect(screen.getByRole('timer')).toHaveTextContent('2:30')
    fireEvent.click(screen.getByRole('button', { name: '−30 s' }))
    fireEvent.click(screen.getByRole('button', { name: '+30 s' }))
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }))
    expect(onAdjust.mock.calls).toEqual([[-30_000], [30_000]])
    expect(onStop).toHaveBeenCalledOnce()
    expect(screen.getByText(/Pas d’alarme garantie écran verrouillé/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('transmet la préférence écran allumé au niveau de la séance', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const onKeepAwakeChange = vi.fn()
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn() }) },
    })

    render(
      <TimerCard
        endsAt={150_000}
        label="Récup Squat"
        keepAwake={false}
        onAdjust={vi.fn()}
        onKeepAwakeChange={onKeepAwakeChange}
        onStop={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Garder l’écran allumé' }))
    expect(onKeepAwakeChange).toHaveBeenCalledWith(true)

    Reflect.deleteProperty(navigator, 'wakeLock')
    vi.useRealTimers()
  })
})
