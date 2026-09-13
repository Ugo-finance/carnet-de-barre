import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { secondsUntil, shiftedDeadline, useRecoveryTimer } from './timer'

describe('calcul du chrono', () => {
  it('calcule depuis l’échéance absolue et arrondit la seconde entamée', () => {
    expect(secondsUntil(150_000, 0)).toBe(150)
    expect(secondsUntil(150_000, 1)).toBe(150)
    expect(secondsUntil(150_000, 149_001)).toBe(1)
    expect(secondsUntil(150_000, 200_000)).toBe(0)
  })

  it('ajoute depuis maintenant si le chrono est déjà terminé', () => {
    expect(shiftedDeadline(100_000, 30_000, 120_000)).toBe(150_000)
    expect(shiftedDeadline(150_000, -30_000, 120_000)).toBe(120_000)
  })
})

describe('retour au premier plan', () => {
  it('recalcule depuis l’horloge sans alarme quand l’échéance est passée depuis plus de 5 s', () => {
    vi.useFakeTimers()
    let visible = true
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
      visible ? 'visible' : 'hidden',
    )
    vi.setSystemTime(0)
    const elapsed = vi.fn()
    const { result } = renderHook(() => useRecoveryTimer(150_000, elapsed))
    expect(result.current).toBe(150)

    visible = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      vi.setSystemTime(200_000)
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe(0)
    expect(elapsed).not.toHaveBeenCalled()

    visible = true
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(elapsed).not.toHaveBeenCalled()

    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('avertit une seule fois quand le retour arrive dans les 5 s après l’échéance', () => {
    vi.useFakeTimers()
    let visible = false
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
      visible ? 'visible' : 'hidden',
    )
    vi.setSystemTime(0)
    const elapsed = vi.fn()
    const { result } = renderHook(() => useRecoveryTimer(150_000, elapsed))

    act(() => {
      vi.setSystemTime(154_000)
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe(0)
    expect(elapsed).not.toHaveBeenCalled()

    visible = true
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(elapsed).toHaveBeenCalledOnce()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(elapsed).toHaveBeenCalledOnce()

    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('arrête la boucle à zéro et ne la relance que pour une nouvelle échéance', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const elapsed = vi.fn()
    const now = vi.fn(() => Date.now())
    const { result, rerender } = renderHook(
      ({ endsAt }) => useRecoveryTimer(endsAt, elapsed, now),
      { initialProps: { endsAt: 500 } },
    )

    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(0)
    expect(elapsed).toHaveBeenCalledOnce()

    const callsAtZero = now.mock.calls.length
    act(() => vi.advanceTimersByTime(1_000))
    expect(now).toHaveBeenCalledTimes(callsAtZero)

    rerender({ endsAt: 2_000 })
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(0)
    expect(elapsed).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})
