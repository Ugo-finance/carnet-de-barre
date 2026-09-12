import { useEffect, useRef, useState } from 'react'

type AudioContextConstructor = new () => AudioContext

let audioContext: AudioContext | undefined

function audioConstructor(): AudioContextConstructor | undefined {
  const candidate = window as typeof window & { webkitAudioContext?: AudioContextConstructor }
  return window.AudioContext ?? candidate.webkitAudioContext
}

/** À appeler depuis le geste qui valide une série, avant de rendre la main au navigateur. */
export function unlockTimerAudio(): void {
  const Constructor = audioConstructor()
  if (!Constructor) return
  audioContext ??= new Constructor()
  if (audioContext.state === 'suspended') void audioContext.resume()
}

export function notifyTimerDone(): void {
  if ('vibrate' in navigator) navigator.vibrate([180, 80, 180])
  if (!audioContext || audioContext.state !== 'running') return

  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.12, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35)
  oscillator.connect(gain).connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.35)
}

export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

export function shiftedDeadline(endsAt: number, deltaMs: number, now: number): number {
  if (deltaMs > 0) return Math.max(endsAt, now) + deltaMs
  return Math.max(now, endsAt + deltaMs)
}

export function useRecoveryTimer(
  endsAt: number,
  onElapsed: () => void,
  now: () => number = Date.now,
): number {
  const [timestamp, setTimestamp] = useState(() => now())
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const notifiedDeadline = useRef<number | undefined>(undefined)

  useEffect(() => {
    const refresh = () => setTimestamp(now())
    refresh()
    const interval = window.setInterval(refresh, 250)
    const onVisibility = () => {
      const nextVisible = document.visibilityState === 'visible'
      setVisible(nextVisible)
      if (nextVisible) refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [now])

  const remaining = secondsUntil(endsAt, timestamp)
  useEffect(() => {
    if (remaining === 0 && visible && notifiedDeadline.current !== endsAt) {
      notifiedDeadline.current = endsAt
      onElapsed()
    }
  }, [endsAt, onElapsed, remaining, visible])

  return remaining
}

type WakeLockSentinelLike = {
  release(): Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>
  }
}

export function wakeLockAvailable(): boolean {
  return Boolean((navigator as WakeLockNavigator).wakeLock)
}

export function useWakeLock(enabled: boolean, active: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | undefined>(undefined)

  useEffect(() => {
    let mounted = true

    const release = async () => {
      const current = sentinel.current
      sentinel.current = undefined
      if (current) await current.release().catch(() => undefined)
    }

    const request = async () => {
      const api = (navigator as WakeLockNavigator).wakeLock
      if (!mounted || !enabled || !active || document.visibilityState !== 'visible' || !api) return
      if (sentinel.current) return
      try {
        const acquired = await api.request('screen')
        if (mounted) sentinel.current = acquired
        else await acquired.release().catch(() => undefined)
      } catch {
        // Le navigateur peut refuser selon la batterie ou le mode d'économie d'énergie.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
      else void release()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', onVisibility)
      void release()
    }
  }, [active, enabled])
}
