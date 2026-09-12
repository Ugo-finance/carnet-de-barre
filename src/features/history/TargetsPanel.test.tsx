import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TargetsPanel } from './TargetsPanel'
import { MemoryStore } from '../../db/memory'

async function magasinPret(): Promise<MemoryStore> {
  const store = new MemoryStore()
  await store.ready()
  return store
}

describe('affichage des cibles', () => {
  it('montre les cinq cibles courantes', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    expect(screen.getByText('75 kg')).toBeInTheDocument()
    expect(screen.getByText('92,5 kg')).toBeInTheDocument()
    // Le lest des tractions s'écrit avec son signe : ce n'est pas une charge de barre.
    expect(screen.getByText('+15 kg')).toBeInTheDocument()
  })

  it('explique pourquoi une cible ne bouge pas après un échec', async () => {
    // Sans cette ligne, une cible figée passe pour un bug alors que c'est la règle.
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    expect(screen.getByText(/Deuxième essai à 70 kg/)).toBeInTheDocument()
  })

  it('ne propose « Repartir à zéro » que s’il y a un échec en attente', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)
    expect(screen.queryByRole('button', { name: 'Repartir à zéro' })).not.toBeInTheDocument()
  })
})

describe('ajustement', () => {
  it('pose une nouvelle cible et la réaffiche', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '77,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))

    await waitFor(() => expect(screen.getByText('77,5 kg')).toBeInTheDocument())
    expect((await store.getTargets()).squat.w).toBe(77.5)
  })

  it('accepte la virgule décimale', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '82,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))

    await waitFor(() => expect(screen.getByText('82,5 kg')).toBeInTheDocument())
  })

  it('pré-remplit avec la cible actuelle', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    expect(screen.getByLabelText('Nouvelle cible Squat')).toHaveValue('75')
  })

  it('renonce sans rien changer', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.getByText('75 kg')).toBeInTheDocument()
    expect((await store.getTargets()).squat.w).toBe(75)
  })

  it('refuse une valeur absurde et le dit, sans rien écrire', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '750' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/500 kg/)
    expect((await store.getTargets()).squat.w).toBe(75)
  })

  it('efface un échec en attente à la demande', async () => {
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Repartir à zéro' }))

    await waitFor(() => expect(screen.queryByText(/Deuxième essai/)).not.toBeInTheDocument())
    expect((await store.getTargets()).bench.fail).toBeNull()
  })
})
