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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { store } from './db/store'

describe('navigation depuis le point d’entrée réel', () => {
  it('ouvre la séance par défaut', async () => {
    render(<App />)
    // C'est le seul écran qu'Ugo ouvre les mains sur une barre : il doit être là sans
    // qu'il ait à choisir.
    expect(await screen.findByRole('heading', { name: /Séance [ABC]/ })).toBeInTheDocument()
  })

  it('atteint l’écran des cibles', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))

    expect(await screen.findByRole('heading', { name: 'Cibles' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Squat')).toBeInTheDocument())
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

  it('interdit d’ajuster une cible pendant une séance COMMENCÉE', async () => {
    // P1 trouvé par Codex après la fusion de la navigation. `SessionHome` ouvre un
    // brouillon dès le démarrage ; rendre l'onglet Cibles atteignable a du même coup
    // rendu l'ajustement atteignable pendant une séance. Or `finalizeSeance` refuse
    // d'écrire quand les cibles ont bougé depuis l'ouverture du brouillon, et aucun
    // écran ne sait rebaser un brouillon : Ugo aurait dû abandonner toute sa saisie.
    // Il faut vraiment commencer : depuis CB-27, un brouillon vierge ne verrouille
    // plus rien, parce que l'app en ouvre un toute seule à chaque affichage.
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

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))
    await screen.findByRole('heading', { name: 'Cibles' })

    await waitFor(() => expect(screen.getByText(/lecture seule/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ajuster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Repartir à zéro' })).not.toBeInTheDocument()

    await store.clearDraft()
  })

  it('laisse quand même consulter les cibles pendant la séance', async () => {
    // Savoir ce qui est visé pendant qu'on s'entraîne est l'usage légitime de l'écran.
    // Le verrou porte sur la modification, pas sur la lecture.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))

    await waitFor(() => expect(screen.getByText('Squat')).toBeInTheDocument())
    expect(screen.getByText('75 kg')).toBeInTheDocument()
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
    // CB-27. L'écran d'accueil ouvre un brouillon dès l'affichage, y compris juste
    // après une finalisation. Verrouiller là-dessus interdisait l'ajustement au
    // moment précis où Ugo sort de la salle.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cibles' }))
    await screen.findByRole('heading', { name: 'Cibles' })

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })

  it('reporte la cible ajustée dans la séance affichée', async () => {
    // Le point que Codex a soulevé : `SessionHome` reste monté et tient l'ancien
    // brouillon. Sans remontage, sa prochaine sauvegarde réécrirait les anciennes
    // cibles de référence et la finalisation lèverait `stale-targets`.
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

    // Le brouillon relu porte la nouvelle cible : l'écran a bien été remonté.
    const brouillon = await store.loadDraft()
    expect(brouillon?.baseTargets.squat.w).toBe(80)
  })
})
