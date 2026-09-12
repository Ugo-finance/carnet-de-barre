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
  it('recalcule depuis l’horloge et avertit une seule fois à l’échéance', () => {
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
    expect(elapsed).toHaveBeenCalledOnce()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(elapsed).toHaveBeenCalledOnce()

    vi.restoreAllMocks()
    vi.useRealTimers()
  })
})
