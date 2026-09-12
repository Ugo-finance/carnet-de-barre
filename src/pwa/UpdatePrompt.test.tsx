import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { buildDraft } from '../db/draft'
import { loadSeed } from '../db/seed'
import { createPwaUpdateController } from './register'
import { UpdatePrompt, type UpdateStore } from './UpdatePrompt'

function updateReady() {
  let options: RegisterSWOptions | undefined
  const apply = vi.fn(async () => undefined)
  const controller = createPwaUpdateController((received) => {
    options = received
    return apply
  })
  controller.register()
  options?.onNeedRefresh?.()
  return { controller, apply }
}

function blankDraft() {
  return buildDraft('A', '2026-09-15', loadSeed().targets, { id: 'brouillon', now: 1 })
}

describe('bandeau de mise à jour', () => {
  it('relit le brouillon persisté avant d’activer la nouvelle version', async () => {
    const order: string[] = []
    let options: RegisterSWOptions | undefined
    const apply = vi.fn(async () => {
      order.push('activate')
    })
    const controller = createPwaUpdateController((received) => {
      options = received
      return apply
    })
    controller.register()
    options?.onNeedRefresh?.()
    const draft = blankDraft()
    const store: UpdateStore = {
      loadDraft: vi.fn(async () => {
        order.push('read')
        return draft
      }),
    }
    render(<UpdatePrompt store={store} controller={controller} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    await waitFor(() => expect(apply).toHaveBeenCalledWith(true))
    expect(store.loadDraft).toHaveBeenCalledOnce()
    expect(order).toEqual(['read', 'activate'])
  })

  it('refuse l’activation quand une séance est commencée', async () => {
    const { controller, apply } = updateReady()
    const draft = blankDraft()
    draft.sets[0].status = 'validated'
    const store: UpdateStore = {
      loadDraft: vi.fn(async () => draft),
    }
    render(<UpdatePrompt store={store} controller={controller} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/termine ta séance/i)
    expect(apply).not.toHaveBeenCalled()
  })

  it('laisse masquer la proposition sans activer la version', () => {
    const { controller, apply } = updateReady()
    const store: UpdateStore = {
      loadDraft: vi.fn(async () => undefined),
    }
    render(<UpdatePrompt store={store} controller={controller} />)

    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }))

    expect(screen.queryByText('Mise à jour disponible')).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })
})
