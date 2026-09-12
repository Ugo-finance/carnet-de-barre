import { describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { createPwaUpdateController } from './register'

describe('contrôleur de mise à jour PWA', () => {
  it('signale une version en attente sans jamais l’appliquer automatiquement', async () => {
    let options: RegisterSWOptions | undefined
    const apply = vi.fn(async () => undefined)
    const register = vi.fn((received?: RegisterSWOptions) => {
      options = received
      return apply
    })
    const controller = createPwaUpdateController(register)
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.register()
    controller.register()
    options?.onNeedRefresh?.()

    expect(register).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toEqual({ updateAvailable: true })
    expect(listener).toHaveBeenCalledOnce()

    await controller.apply()

    expect(apply).toHaveBeenCalledWith(true)
    expect(controller.getSnapshot()).toEqual({ updateAvailable: false })
  })

  it('permet de garder la version courante', () => {
    let options: RegisterSWOptions | undefined
    const controller = createPwaUpdateController((received) => {
      options = received
      return vi.fn(async () => undefined)
    })
    controller.register()
    options?.onNeedRefresh?.()

    controller.dismiss()

    expect(controller.getSnapshot()).toEqual({ updateAvailable: false })
  })
})
