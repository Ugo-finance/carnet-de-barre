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

  it('refuse un nombre suivi de n’importe quoi, au lieu de garder le début', async () => {
    // Number.parseFloat('77,5abc') rend 77.5 sans rien signaler : l'écran annonce
    // refuser les fautes de frappe et enregistrerait une valeur jamais relue.
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), {
      target: { value: '77,5abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/en chiffres/)
    expect((await store.getTargets()).squat.w).toBe(75)
    expect(screen.getByText('75 kg')).toBeInTheDocument()
  })

  it('garde la saisie affichée quand la valeur est refusée', async () => {
    // Refermer le champ obligerait à tout retaper pour corriger un chiffre.
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '750' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))

    await screen.findByRole('status')
    expect(screen.getByLabelText('Nouvelle cible Squat')).toHaveValue('750')
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

describe('lecture seule pendant une séance', () => {
  it('cache les actions et explique pourquoi', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} verrouille />)

    expect(screen.queryByRole('button', { name: 'Ajuster' })).not.toBeInTheDocument()
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument()
    expect(screen.getByText(/empêcherait d’enregistrer ta séance/)).toBeInTheDocument()
  })

  it('cache aussi « Repartir à zéro », qui modifie tout autant', async () => {
    // Effacer un échec en attente change la cible : ça diverge comme le reste.
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    render(<TargetsPanel targets={await store.getTargets()} store={store} verrouille />)

    expect(screen.queryByRole('button', { name: 'Repartir à zéro' })).not.toBeInTheDocument()
    // L'information, elle, reste visible : c'est ce qu'il est venu chercher.
    expect(screen.getByText(/Deuxième essai à 70 kg/)).toBeInTheDocument()
  })

  it('laisse tout faire quand aucune séance n’est en cours', async () => {
    const store = await magasinPret()
    render(<TargetsPanel targets={await store.getTargets()} store={store} />)

    expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })
})
