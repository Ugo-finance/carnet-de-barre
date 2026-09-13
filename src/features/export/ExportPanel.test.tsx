import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel, type ExchangePort } from './ExportPanel'
import { MemoryStore } from '../../db/memory'
import { serializeExport } from '../../db/exchange'

/** Presse-papiers et téléchargement n'existent pas sous jsdom : on les observe. */
function equiperNavigateur(options: { copieRefusee?: boolean } = {}) {
  const writeText = options.copieRefusee
    ? vi.fn().mockRejectedValue(new Error('refusé'))
    : vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

  const click = vi.fn()
  const creer = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = creer(tag)
    if (tag === 'a') element.click = click
    return element
  })
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:fake', configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })

  return { writeText, click }
}

async function magasinPret(): Promise<MemoryStore> {
  const store = new MemoryStore()
  await store.ready()
  return store
}

describe('export', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('copie les séances dans le presse-papiers en un tap', async () => {
    const { writeText } = equiperNavigateur()
    render(<ExportPanel store={await magasinPret()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copier mes séances' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0][0]).toContain(
      // Nombre en clair, jamais repris de `SCHEMA_VERSION` : une assertion sur la
      // constante se contenterait d'elle-même et laisserait passer tout incrément.
      // Passé à 2 en CB-55, pour le rôle de série `warmup`.
      '"schemaVersion": 2',
    )
    expect(await screen.findByText(/12 séances copiées/)).toBeInTheDocument()
  })

  it('bascule sur le téléchargement quand le navigateur refuse la copie', async () => {
    // Sur iOS, l'accès au presse-papiers est refusé hors geste direct. Perdre son
    // export pour une permission manquante serait absurde.
    const { click } = equiperNavigateur({ copieRefusee: true })
    render(<ExportPanel store={await magasinPret()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copier mes séances' }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(await screen.findByText(/Copie refusée/)).toBeInTheDocument()
  })

  it('propose le téléchargement direct', async () => {
    const { click } = equiperNavigateur()
    render(<ExportPanel store={await magasinPret()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le fichier' }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(await screen.findByText(/carnet-de-barre-\d{4}-\d{2}-\d{2}\.json/)).toBeInTheDocument()
  })
})

describe('import', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    equiperNavigateur()
  })

  it('annonce ce qui sera remplacé avant de rien écrire', async () => {
    const store = await magasinPret()
    const contenu = serializeExport(await store.exportAll())
    render(<ExportPanel store={store} />)

    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), { target: { value: contenu } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))

    expect(await screen.findByText('À confirmer')).toBeInTheDocument()
    expect(screen.getByText(/12 séances.*remplacer/s)).toBeInTheDocument()
    // Rien n'est écrit tant que la confirmation n'a pas été donnée.
    expect(await store.listSeances()).toHaveLength(12)
  })

  it('écrit les dates de l’aperçu comme partout ailleurs, en jj.mm.aaaa', async () => {
    // L'aperçu affichait les dates au format de stockage (2026-07-22). C'est le seul
    // écran où Ugo doit lire des dates avant une action destructive : lui montrer une
    // notation qu'il ne voit nulle part ailleurs est exactement le mauvais endroit.
    const store = await magasinPret()
    const contenu = serializeExport(await store.exportAll())
    render(<ExportPanel store={store} />)

    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), { target: { value: contenu } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))

    await screen.findByText('À confirmer')
    const annonce = screen.getByText(/séances.*remplacer/s)
    expect(annonce.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/)
    expect(annonce.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('ne remplace qu’après confirmation explicite', async () => {
    const store = await magasinPret()
    const reduit = { ...(await store.exportAll()) }
    reduit.seances = reduit.seances.slice(0, 3)
    render(<ExportPanel store={store} />)

    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), {
      target: { value: serializeExport(reduit) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remplacer définitivement' }))

    expect(await screen.findByText(/3 séances importées/)).toBeInTheDocument()
    expect(await store.listSeances()).toHaveLength(3)
  })

  it('refuse un contenu qui n’est pas du JSON, sans rien casser', async () => {
    const store = await magasinPret()
    render(<ExportPanel store={store} />)

    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), {
      target: { value: 'salut, voici mes séances' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/./)
    expect(screen.queryByText('À confirmer')).not.toBeInTheDocument()
    expect(await store.listSeances()).toHaveLength(12)
  })

  it('demande d’abord de coller quelque chose', async () => {
    render(<ExportPanel store={await magasinPret()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))
    expect(await screen.findByText(/Colle d’abord un export/)).toBeInTheDocument()
  })

  it('refuse d’importer tant qu’une séance est en cours', async () => {
    const store = await magasinPret()
    const contenu = serializeExport(await store.exportAll())
    const draft = await store.openDraft('C', '2026-09-20')
    await store.saveDraft(draft)

    render(<ExportPanel store={store} />)
    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), { target: { value: contenu } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remplacer définitivement' }))

    expect(await screen.findByText(/Une séance est en cours/)).toBeInTheDocument()
    expect(await store.listSeances()).toHaveLength(12)
  })

  it('accepte le format d’origine du dossier de transmission', async () => {
    const store = await magasinPret()
    const seed = await import('../../domain/seed.json', { with: { type: 'json' } })
    render(<ExportPanel store={store} />)

    fireEvent.change(screen.getByLabelText(/Contenu de l’export/), {
      target: { value: JSON.stringify(seed.default) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier ce contenu' }))

    expect(await screen.findByText('À confirmer')).toBeInTheDocument()
  })
})

describe('contrat minimal attendu du magasin', () => {
  it('n’a besoin que de trois méthodes', async () => {
    const port: ExchangePort = {
      exportAll: vi.fn(),
      previewImport: vi.fn(),
      importReplace: vi.fn(),
    }
    expect(Object.keys(port)).toEqual(['exportAll', 'previewImport', 'importReplace'])
  })
})
