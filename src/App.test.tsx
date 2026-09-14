/**
 * Le test qui part de `<App />` — CB-24.
 *
 * Il existe à cause d'un trou réel : `ExportPanel` et `TargetsPanel` étaient
 * construits, testés et fusionnés, mais **inatteignables** — `App.tsx` ne rendait que
 * l'écran de séance. Aucun test ne l'a vu, parce que tous montent leur écran
 * directement. Une couverture par composant ne peut pas voir ça, par construction.
 *
 * Ce fichier ferme la classe de défaut plutôt que l'instance : il vérifie qu'on
 * atteint chaque écran depuis le point d'entrée réel de l'app.
 */

import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { store } from './db/store'

/**
 * Mardi — donc **séance A**, celle qui contient le squat.
 *
 * Le fichier montait `<App />` sur l'horloge réelle, et l'app propose une séance
 * différente selon le jour : dimanche C, mardi A, jeudi B. Les tests passaient donc en
 * fonction du jour où on les lançait, et `atteint l'écran des cibles` est tombé le lundi
 * 14.09.2026 sur une CI verte la veille — l'écran de séance reste monté derrière celui
 * des cibles, et « Squat » s'y trouvait deux fois.
 *
 * Le jour est donc figé, et figé sur **le cas qui cassait** plutôt que sur celui qui
 * passait : un test de rotation pris un seul jour ne prouve rien des six autres.
 */
const MARDI = new Date('2026-09-15T08:00:00+02:00')

describe('navigation depuis le point d’entrée réel', () => {
  beforeEach(() => {
    // `Date` seulement : figer aussi les minuteurs suspend `fake-indexeddb`, et les
    // onze tests du fichier expirent au premier `findBy`.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MARDI)
  })

  afterEach(async () => {
    await store.clearDraft()
    vi.useRealTimers()
  })

  it('ouvre la séance par défaut', async () => {
    render(<App />)
    // L'accueil de séance reste le point d'entrée, avant tout brouillon.
    expect(await screen.findByRole('heading', { name: /Séance [ABC]/ })).toBeInTheDocument()
    expect(await store.loadDraft()).toBeUndefined()
  })

  it('atteint l’écran des cibles', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))

    expect(await screen.findByRole('heading', { name: 'Cibles' })).toBeInTheDocument()
    // Cherché **dans la liste des cibles**, et non dans le document entier : l'écran de
    // séance reste monté derrière celui-ci, et il porte lui aussi le mot « Squat » les
    // jours de séance A. La requête large trouvait alors deux éléments et le test tombait.
    const liste = await screen.findByRole('list')
    await waitFor(() => expect(within(liste).getByText('Squat')).toBeInTheDocument())
  })

  it('atteint l’écran d’export', async () => {
    // Sans cet écran, une séance faite ne peut pas sortir du téléphone : ni sauvegarde,
    // ni transmission pour l'événement Outlook.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(await screen.findByRole('button', { name: /Copier mes séances/ })).toBeInTheDocument()
  })

  it('garde la séance montée quand on la quitte', async () => {
    // Démonter l'écran de séance pour aller regarder une cible reviendrait à parier
    // qu'aucune sauvegarde n'est en vol. Le pari serait presque toujours gagné.
    render(<App />)
    const titre = await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(titre).toBeInTheDocument()
    expect(titre.closest('[hidden]')).not.toBeNull()
  })

  it('revient à la séance sans la recharger', async () => {
    render(<App />)
    const titre = await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Séance' }))

    // Même nœud : l'écran n'a pas été remonté, donc rien n'a été rejoué.
    expect(screen.getByRole('heading', { name: /Séance [ABC]/ })).toBe(titre)
    expect(titre.closest('[hidden]')).toBeNull()
  })

  it('signale l’onglet courant aux technologies d’assistance', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    expect(screen.getByRole('button', { name: 'Séance' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))

    expect(screen.getByRole('button', { name: 'Cibles' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Séance' })).not.toHaveAttribute('aria-current')
  })

  it('masque toute la navigation globale pendant une séance commencée', async () => {
    // L'interdiction d'ajuster reste protégée dans le magasin. À l'écran, le contrat
    // v2 va plus loin : une séance active retire toutes les sorties concurrentes.
    await store.ready()
    const commence = await store.openDraft('C', '2026-09-12')
    await store.saveDraft({
      ...commence,
      sets: commence.sets.map((set, index) =>
        index === 0 ? { ...set, status: 'validated' as const, weight: 92.5, reps: 3 } : set,
      ),
    })

    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
  })

  it('garde la navigation masquée après avoir quitté le focus, puis la rend après abandon', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })
    fireEvent.click(screen.getByRole('button', { name: /Démarrer la séance/ }))

    expect(await screen.findByRole('button', { name: 'Quitter la vue' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la vue' }))

    expect(await screen.findByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }))

    expect(await screen.findByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
  })

  it('atteint l’historique et y montre les séances de départ', async () => {
    // Sans cet écran, après une séance, Ugo n'a aucun moyen de vérifier qu'elle a été
    // enregistrée : le récapitulatif ne s'affiche qu'une fois et disparaît en quittant.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Historique' }))

    expect(await screen.findByRole('heading', { name: 'Historique' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('12 séances enregistrées.')).toBeInTheDocument())
  })

  it('laisse ajuster une cible quand le brouillon n’a jamais été touché', async () => {
    // L'accueil est en lecture seule et ne crée plus de brouillon. L'ajustement reste
    // donc disponible au moment précis où Ugo sort de la salle.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))
    await screen.findByRole('heading', { name: 'Cibles' })

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })

  it('démarre la séance sur la cible ajustée sans brouillon intermédiaire', async () => {
    // `SessionHome` garde son aperçu en mémoire. Le remontage demandé par CiblesTab
    // doit lui faire relire les cibles avant le démarrage atomique.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))
    await screen.findByRole('heading', { name: 'Cibles' })
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser' }))
    await waitFor(() => expect(screen.getByText('80 kg')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Séance' }))

    expect(await store.loadDraft()).toBeUndefined()
    fireEvent.click(await screen.findByRole('button', { name: /Démarrer la séance/ }))

    await waitFor(() => expect(store.loadDraft()).resolves.toBeDefined())
    const brouillon = await store.loadDraft()
    expect(brouillon?.baseTargets.squat.w).toBe(80)
    await store.clearDraft()
  })
})
