/**
 * Le test qui part de `<App />` — CB-24.
 *
 * Il existe à cause d'un trou réel : les écrans de données et de cibles étaient
 * construits, testés et fusionnés, mais **inatteignables** — `App.tsx` ne rendait que
 * l'écran de séance. Aucun test ne l'a vu, parce que tous montent leur écran
 * directement. Une couverture par composant ne peut pas voir ça, par construction.
 *
 * Ce fichier ferme la classe de défaut plutôt que l'instance : il vérifie qu'on
 * atteint chaque écran depuis le point d'entrée réel de l'app.
 */

import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
let finalizedSessionId: string | undefined

function advanceSummaryTo(heading: string): void {
  for (let index = 0; index < 20; index += 1) {
    if (screen.queryByRole('heading', { name: heading })) return
    const next = screen.queryByRole('button', { name: 'Suivant' })
    if (!next) break
    fireEvent.click(next)
  }
  throw new Error(`Page de récapitulatif introuvable : ${heading}`)
}

describe('navigation depuis le point d’entrée réel', () => {
  beforeEach(() => {
    // `Date` seulement : figer aussi les minuteurs suspend `fake-indexeddb`, et les
    // onze tests du fichier expirent au premier `findBy`.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MARDI)
  })

  afterEach(async () => {
    await store.clearDraft()
    if (finalizedSessionId) {
      await store.deleteSeance(finalizedSessionId)
      finalizedSessionId = undefined
    }
    vi.useRealTimers()
  })

  it('ouvre la séance par défaut', async () => {
    render(<App />)
    // L'accueil de séance reste le point d'entrée, avant tout brouillon.
    expect(await screen.findByRole('heading', { name: /Séance [ABC]/ })).toBeInTheDocument()
    expect(await store.loadDraft()).toBeUndefined()
  })

  it('atteint l’écran de progression', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))

    expect(await screen.findByRole('heading', { name: 'Progression' })).toBeInTheDocument()
    // Cherché **dans la liste des cibles**, et non dans le document entier : l'écran de
    // séance reste monté derrière celui-ci, et il porte lui aussi le mot « Squat » les
    // jours de séance A. La requête large trouvait alors deux éléments et le test tombait.
    const liste = await screen.findByRole('list')
    await waitFor(() => expect(within(liste).getByText('Squat')).toBeInTheDocument())
  })

  it('atteint les réglages et l’export', async () => {
    // Sans cet écran, une séance faite ne peut pas sortir du téléphone : ni sauvegarde,
    // ni transmission pour l'événement Outlook.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }))

    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Matériel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Export' }))
    expect(await screen.findByRole('button', { name: /Copier mes séances/ })).toBeInTheDocument()
  })

  it('garde la séance montée quand on la quitte', async () => {
    // Démonter l'écran de séance pour aller regarder une cible reviendrait à parier
    // qu'aucune sauvegarde n'est en vol. Le pari serait presque toujours gagné.
    render(<App />)
    const titre = await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }))

    expect(titre).toBeInTheDocument()
    expect(titre.closest('[hidden]')).not.toBeNull()
  })

  it('revient à la séance sans la recharger', async () => {
    render(<App />)
    const titre = await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))
    fireEvent.click(screen.getByRole('button', { name: 'Séance' }))

    // Même nœud : l'écran n'a pas été remonté, donc rien n'a été rejoué.
    expect(screen.getByRole('heading', { name: /Séance [ABC]/ })).toBe(titre)
    expect(titre.closest('[hidden]')).toBeNull()
  })

  it('signale l’onglet courant aux technologies d’assistance', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    expect(screen.getByRole('button', { name: 'Séance' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))

    expect(screen.getByRole('button', { name: 'Progression' })).toHaveAttribute(
      'aria-current',
      'page',
    )
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

    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
  })

  it('garde la navigation masquée après avoir quitté le focus, puis la rend après abandon', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })
    fireEvent.click(screen.getByRole('button', { name: /Voir les cibles de la séance/ }))
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Actions' }))
    expect(screen.getByRole('button', { name: 'Quitter la vue' })).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la vue' }))

    expect(await screen.findByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }))

    expect(
      await screen.findByRole('navigation', { name: 'Navigation principale' }),
    ).toBeInTheDocument()
  })

  it('atteint l’historique et y montre les séances de départ', async () => {
    // Sans cet écran, après une séance, Ugo n'a aucun moyen de vérifier qu'elle a été
    // enregistrée : le récapitulatif ne s'affiche qu'une fois et disparaît en quittant.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Historique' }))

    expect(await screen.findByRole('heading', { name: 'Historique' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/^12 séances enregistrées, sur \d+ semaines\.$/)).toBeInTheDocument(),
    )
  })

  it('ouvre l’historique depuis le récapitulatif réellement finalisé', async () => {
    await store.ready()
    const draft = await store.startSession('A', '2026-09-15', { now: MARDI.getTime() })
    finalizedSessionId = draft.id
    await store.saveDraft({
      ...draft,
      sets: draft.sets.map((set) => ({ ...set, status: 'skipped' as const })),
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer la séance' }))
    await screen.findByText('Séance enregistrée')
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument()
    advanceSummaryTo('Prochaine séance · B')
    fireEvent.click(await screen.findByRole('button', { name: 'Voir dans l’historique' }))

    expect(await screen.findByRole('heading', { name: 'Historique' })).toBeInTheDocument()
    expect(
      await screen.findByRole('navigation', { name: 'Navigation principale' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/^13 séances enregistrées, sur \d+ semaines\.$/)).toBeInTheDocument(),
    )
  })

  it('laisse ajuster une cible quand le brouillon n’a jamais été touché', async () => {
    // L'accueil est en lecture seule et ne crée plus de brouillon. L'ajustement reste
    // donc disponible au moment précis où Ugo sort de la salle.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))
    await screen.findByRole('heading', { name: 'Progression' })

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })

  it('démarre la séance sur la cible ajustée sans brouillon intermédiaire', async () => {
    // `SessionHome` garde son aperçu en mémoire. Le remontage demandé par ProgressionTab
    // doit lui faire relire les cibles avant le démarrage atomique.
    render(<App />)
    await screen.findByRole('heading', { name: /Séance [ABC]/ })

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))
    await screen.findByRole('heading', { name: 'Progression' })
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Ajuster' })[0])
    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))
    // La feuille ne se referme qu'en cas de succès : c'est le seul signal qui dit que
    // l'écriture est passée. Attendre « 80 kg » à l'écran ne le dit pas — un record de
    // 80 kg porte le même texte, et le test repartait alors avant la fin de l'écriture.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Séance' }))

    expect(await store.loadDraft()).toBeUndefined()
    fireEvent.click(await screen.findByRole('button', { name: /Voir les cibles de la séance/ }))
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    await waitFor(() => expect(store.loadDraft()).resolves.toBeDefined())
    const brouillon = await store.loadDraft()
    expect(brouillon?.baseTargets.squat.w).toBe(80)
    await store.clearDraft()
  })
  async function prepareRecovery() {
    await store.ready()
    const draft = await store.startSession('A', '2026-09-15', { now: MARDI.getTime() })
    const work = draft.sets.find(
      (set) => set.exerciseId === 'a-bench-vol' && set.role === 'volume' && set.index === 2,
    )
    const warmup = draft.sets.find(
      (set) => set.exerciseId === 'a-tractions-lestees' && set.role === 'warmup',
    )
    expect(work).toBeDefined()
    expect(warmup).toBeDefined()
    if (!work || !warmup) throw new Error('Scénario de récupération incomplet')
    await store.saveDraft({
      ...draft,
      sets: draft.sets.map((set) => ({
        ...set,
        status:
          set.id === work.id || set.id === warmup.id ? ('planned' as const) : ('skipped' as const),
      })),
    })
    return { work, warmup }
  }

  it('ouvre la récup après écriture, affiche le prochain palier et garde son échéance après sortie', async () => {
    const { warmup } = await prepareRecovery()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }))
    const recovery = await screen.findByRole('dialog', { name: 'Récupération' })
    expect(within(recovery).getByRole('region', { name: 'Prochaine série' })).toHaveTextContent(
      'Tractions lestées',
    )
    expect(within(recovery).getByRole('region', { name: 'Prochaine série' })).toHaveTextContent(
      'palier 1',
    )
    const saved = await store.loadDraft()
    expect(
      saved?.sets.find((set) => set.exerciseId === 'a-bench-vol' && set.index === 2)?.status,
    ).toBe('validated')
    const deadline = saved?.timerEndsAt
    expect(deadline).toBeGreaterThan(MARDI.getTime())
    fireEvent.click(within(recovery).getByRole('button', { name: '+30 s' }))
    expect(recovery).toBeInTheDocument()
    await waitFor(async () =>
      expect((await store.loadDraft())?.timerEndsAt).toBe(Number(deadline) + 30_000),
    )
    fireEvent.click(within(recovery).getByRole('button', { name: 'Revenir à la saisie' }))
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Répétitions' })
    fireEvent.change(input, { target: { value: '7' } })
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(async () =>
      expect((await store.loadDraft())?.sets.find((set) => set.id === warmup.id)?.status).toBe(
        'validated',
      ),
    )
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    expect((await store.loadDraft())?.timerEndsAt).toBe(Number(deadline) + 30_000)
  })

  it('garde la progression de récupération après un rechargement', async () => {
    // CB-77, P3 de la revue #70. La durée totale vivait en état React : après un
    // rechargement en pleine récup, le chiffre restait juste et **la barre repartait de
    // zéro** — 60 s écoulées sur 150 affichaient `max=90 value=0`. Elle disait donc
    // « tu viens de poser la barre » à un Ugo qui souffle depuis une minute.
    //
    // Le parcours part de la base réelle et passe par un démontage : c'est le seul
    // montage qui exerce le défaut, et un test sur le composant isolé ne pourrait pas le
    // voir, puisqu'on lui passerait la durée à la main.
    const { warmup } = await prepareRecovery()
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }))
    const recovery = await screen.findByRole('dialog', { name: 'Récupération' })
    const barre = within(recovery).getByRole('progressbar', {
      name: 'Temps de récupération écoulé',
    })
    expect(barre).toHaveAttribute('max', '150')
    expect(barre).toHaveAttribute('value', '0')
    const debut = (await store.loadDraft())?.timerStartedAt
    expect(debut).toBe(MARDI.getTime())

    // Rechargement une minute plus tard : l'app est relancée, le brouillon relu.
    view.unmount()
    vi.setSystemTime(new Date(MARDI.getTime() + 60_000))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    // La récup ne se rouvre pas toute seule — CB-74. On y revient par le geste explicite.
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le chrono' }))
    const reprise = screen.getByRole('dialog', { name: 'Récupération' })
    const barreReprise = within(reprise).getByRole('progressbar', {
      name: 'Temps de récupération écoulé',
    })
    expect(within(reprise).getByRole('timer')).toHaveTextContent('1:30')
    expect(barreReprise).toHaveAttribute('max', '150')
    expect(barreReprise).toHaveAttribute('value', '60')
    expect((await store.loadDraft())?.timerStartedAt).toBe(debut)
    expect(warmup).toBeDefined()
  })

  it('ajoute 30 s sans faire reculer le temps déjà écoulé', async () => {
    // Le critère de cohérence des ±30 s, et il ne se voit **pas** au moment du clic :
    // à cet instant l'écoulé vaut zéro des deux côtés, et `max` se rabat sur le restant
    // quand il le dépasse. Une première version de ce test s'arrêtait là et ne
    // distinguait rien — aucune mutation ne la faisait rougir.
    //
    // Ce qui distingue, c'est l'**écoulé** une fois qu'il est non nul. Un +30 s doit
    // agrandir le total sans déplacer ce qu'Ugo a déjà attendu : la barre avance, elle
    // ne recule jamais. Faire glisser le début avec l'échéance lui volerait 30 s.
    await prepareRecovery()
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }))
    const recovery = await screen.findByRole('dialog', { name: 'Récupération' })
    const debut = (await store.loadDraft())?.timerStartedAt
    const echeance = (await store.loadDraft())?.timerEndsAt
    fireEvent.click(within(recovery).getByRole('button', { name: '+30 s' }))
    await waitFor(async () =>
      expect((await store.loadDraft())?.timerEndsAt).toBe(Number(echeance) + 30_000),
    )
    // Le début ne bouge pas : c'est lui qui fait que l'écoulé ne recule pas.
    expect((await store.loadDraft())?.timerStartedAt).toBe(debut)

    view.unmount()
    vi.setSystemTime(new Date(MARDI.getTime() + 60_000))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le chrono' }))
    const reprise = screen.getByRole('dialog', { name: 'Récupération' })
    const barre = within(reprise).getByRole('progressbar', {
      name: 'Temps de récupération écoulé',
    })
    expect(barre).toHaveAttribute('max', '180')
    expect(barre).toHaveAttribute('value', '60')
  })

  it('refuse d’ouvrir la récup avant une écriture réussie, puis permet la reprise sans réouverture automatique', async () => {
    await prepareRecovery()
    // IndexedDB garde ses tâches réelles ; seules l’horloge et les boucles du chrono
    // sont pilotées, pour que l’expiration ne dépende pas du rythme du serveur CI.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(MARDI)
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    const save = vi.spyOn(store, 'saveDraft').mockRejectedValueOnce(new Error('panne écriture'))
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sauvegarde impossible')
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    save.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await screen.findByRole('dialog', { name: 'Récupération' })
    const deadline = (await store.loadDraft())?.timerEndsAt
    view.unmount()
    vi.setSystemTime(new Date(MARDI.getTime() + 30_000))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('2:00')
    expect((await store.loadDraft())?.timerEndsAt).toBe(deadline)
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le chrono' }))
    const recovery = screen.getByRole('dialog', { name: 'Récupération' })
    fireEvent.click(within(recovery).getByRole('timer'))
    expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
    expect((await store.loadDraft())?.timerEndsAt).toBe(deadline)
    const input = screen.getByRole('textbox', { name: 'Répétitions' })
    fireEvent.change(input, { target: { value: '7' } })
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Agrandir le chrono' }))
      expect(screen.getByRole('dialog', { name: 'Récupération' })).toBeInTheDocument()
      act(() => {
        vi.setSystemTime(new Date(Number(deadline) - 250))
        vi.advanceTimersByTime(250)
      })
      expect(screen.queryByRole('dialog', { name: 'Récupération' })).not.toBeInTheDocument()
      expect(input).toHaveValue('7')
      expect(vibrate).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate')
    }
  })
})
