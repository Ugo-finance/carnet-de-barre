import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FinalizeResult } from '../../db/contracts'
import { PREFERENCES_PAR_DEFAUT } from '../../domain/preferences'
import type { Draft, Seance, SeanceType, SetLog, Targets } from '../../domain/types'
import { SessionHome, type SessionStore } from './SessionHome'

const TARGETS: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function draftFor(type: SeanceType, date: string): Draft {
  return {
    id: `draft-${type}-${date}`,
    type,
    date,
    sets: [],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    startedAt: 1,
    baseTargets: TARGETS,
    createdAt: 1,
    updatedAt: 1,
  }
}

function deadliftTop(): SetLog {
  return {
    id: 'c-deadlift:top:0',
    exerciseId: 'c-deadlift',
    role: 'top',
    index: 0,
    status: 'planned',
    loadKind: 'barTotal',
    weight: 92.5,
    reps: 3,
    rpe: null,
    targetWeight: 92.5,
    targetReps: 3,
  }
}

function deadliftWarmup(): SetLog {
  return {
    id: 'c-deadlift:warmup:0',
    exerciseId: 'c-deadlift',
    role: 'warmup',
    index: 0,
    status: 'planned',
    loadKind: 'barTotal',
    weight: 60,
    reps: 5,
    rpe: null,
    targetWeight: 60,
    targetReps: 5,
  }
}

function saved(type: SeanceType, date: string): Seance {
  return { id: `saved-${type}`, type, date, lines: [], tops: {}, notes: '' }
}

function fakeStore(options: { initial?: Draft; seances?: Seance[] } = {}) {
  let active = options.initial
  const store: SessionStore = {
    ready: vi.fn().mockResolvedValue(undefined),
    listSeances: vi.fn().mockResolvedValue(options.seances ?? []),
    getTargets: vi.fn().mockResolvedValue(TARGETS),
    getPreferences: vi.fn().mockResolvedValue(PREFERENCES_PAR_DEFAUT),
    loadDraft: vi.fn(async () => active),
    startSession: vi.fn(async (type: SeanceType, date: string, startOptions = {}) => {
      active ??= {
        ...draftFor(type, date),
        rushed: startOptions.rushed ?? PREFERENCES_PAR_DEFAUT.modePresseParDefaut,
      }
      return active
    }),
    saveDraft: vi.fn(async (draft: Draft) => {
      active = draft
    }),
    clearDraft: vi.fn(async () => {
      active = undefined
    }),
    finalizeSeance: vi.fn(async (id: string): Promise<FinalizeResult> => {
      const draft = active
      if (!draft || draft.id !== id) throw new Error('Brouillon introuvable')
      const seance: Seance = {
        id: draft.id,
        type: draft.type,
        date: draft.date,
        lines: [],
        tops: {},
        notes: draft.notes,
      }
      active = undefined
      return { seance, targets: TARGETS, events: [], applied: true }
    }),
  }
  return store
}

async function resumeSession() {
  fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
}

function advanceSummaryTo(heading: string): void {
  for (let index = 0; index < 20; index += 1) {
    if (screen.queryByRole('heading', { name: heading })) return
    const next = screen.queryByRole('button', { name: 'Suivant' })
    if (!next) break
    fireEvent.click(next)
  }
  throw new Error(`Page de récapitulatif introuvable : ${heading}`)
}

const SUNDAY = new Date('2026-09-20T14:00:00Z')

describe('SessionHome', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  it('annonce la séance C prévue sans créer de brouillon avant le geste explicite', async () => {
    const store = fakeStore()
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument()
    expect(store.startSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance C' }))

    expect(store.startSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    await waitFor(() =>
      expect(store.startSession).toHaveBeenCalledWith('C', '2026-09-20', { rushed: false }),
    )
  })

  it('transmet ensemble la séance manuelle et le mode pressé au démarrage', async () => {
    const store = fakeStore()
    render(<SessionHome store={store} now={SUNDAY} />)
    await screen.findByRole('heading', { name: 'Séance C' })

    fireEvent.click(screen.getByRole('button', { name: 'Séance A' }))
    expect(screen.getByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.getByText('Séance manuelle')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Mode pressé' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voir les cibles de la séance A' }))
    expect(screen.getByRole('list', { name: 'Contenu de la séance A' }).children).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    await waitFor(() =>
      expect(store.startSession).toHaveBeenCalledWith('A', '2026-09-20', { rushed: true }),
    )
  })

  it('reste sur l’accueil et permet de réessayer si le démarrage échoue', async () => {
    const store = fakeStore()
    vi.mocked(store.startSession).mockRejectedValueOnce(new Error('quota dépassé'))
    render(<SessionHome store={store} now={SUNDAY} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Voir les cibles de la séance C' }))
    fireEvent.click(screen.getByRole('button', { name: 'C’est parti' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Démarrage impossible : quota dépassé',
    )
    expect(screen.getByRole('button', { name: 'C’est parti' })).toBeEnabled()
  })

  it('propose la séance suivante mais date le brouillon du jour réel', async () => {
    const store = fakeStore({ seances: [saved('C', '2026-09-20')] })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.getByText('Mardi')).toBeInTheDocument()
    expect(store.startSession).not.toHaveBeenCalled()
  })

  it('ne repropose pas le dimanche une séance C faite la veille au soir', async () => {
    // Le cas réel d'Ugo, 12–13.09.2026 : entraîné samedi soir au lieu du dimanche,
    // l'app lui reproposait C le lendemain. « C'est stupide, la prochaine doit être
    // mardi. » C'est ce test qui tient sa réponse.
    const store = fakeStore({ seances: [saved('C', '2026-09-19')] })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(store.startSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Séance C' })).not.toBeInTheDocument()
  })

  it('propose quand même le C du dimanche si c’est un A qui a été fait la veille', async () => {
    // S'entraîner en avance sert son créneau, ça ne décale jamais la rotation :
    // un A fait samedi ne dispense pas du C prévu dimanche.
    const store = fakeStore({ seances: [saved('A', '2026-09-19')] })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument()
  })

  it('reprend un brouillon existant avant la proposition du calendrier', async () => {
    const store = fakeStore({ initial: draftFor('B', '2026-09-17') })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance B' })).toBeInTheDocument()
    expect(screen.getByText('Ta séance t’attend')).toBeInTheDocument()
    expect(store.startSession).not.toHaveBeenCalled()
  })

  it('restaure le chrono porté par un brouillon existant', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftTop()]
    initial.timerEndsAt = Date.now() + 150_000
    initial.timerLabel = 'Récup Soulevé de terre'
    const store = fakeStore({ initial })
    render(<SessionHome store={store} now={SUNDAY} />)

    await resumeSession()
    expect(await screen.findByText('Récup Soulevé de terre')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('ne lance aucun chrono après un palier d’échauffement', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftWarmup(), deadliftTop()]
    const store = fakeStore({ initial })
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await screen.findByRole('article', { name: 'Soulevé de terre · série de travail' })
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(store.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ timerEndsAt: null, timerLabel: null }),
    )
  })

  it('laisse intact un chrono actif après un palier d’échauffement', async () => {
    const deadline = Date.now() + 150_000
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftWarmup(), deadliftTop()]
    initial.timerEndsAt = deadline
    initial.timerLabel = 'Récup précédente'
    const store = fakeStore({ initial })
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await screen.findByRole('article', { name: 'Soulevé de terre · série de travail' })
    expect(screen.getByText('Récup précédente')).toBeInTheDocument()
    expect(store.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ timerEndsAt: deadline, timerLabel: 'Récup précédente' }),
    )
  })

  it('n’avance qu’après la réussite de la sauvegarde de la série', async () => {
    let releaseSave!: () => void
    const saving = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftTop()]
    const store = fakeStore({ initial })
    vi.mocked(store.saveDraft).mockReturnValueOnce(saving)
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.getByRole('heading', { name: 'Soulevé de terre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sauvegarde…' })).toBeDisabled()

    releaseSave()
    expect(
      await screen.findByRole('heading', { name: 'Toutes les séries sont traitées' }),
    ).toBeInTheDocument()
  })

  it('reste sur la série à confirmer quand sa sauvegarde échoue', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftTop()]
    const store = fakeStore({ initial })
    vi.mocked(store.saveDraft).mockRejectedValueOnce(new Error('quota dépassé'))
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sauvegarde impossible. Ta série reste à confirmer. Réessayer. (quota dépassé)',
    )
    expect(screen.getByRole('heading', { name: 'Soulevé de terre' })).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Réessayer' })
    expect(retry).toBeEnabled()
    fireEvent.click(retry)
    await waitFor(() => expect(store.saveDraft).toHaveBeenCalledTimes(2))
  })

  it('attend les écritures puis reprend le brouillon actualisé après avoir quitté le focus', async () => {
    let releaseSave!: () => void
    const saving = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [deadliftTop()]
    const store = fakeStore({ initial })
    vi.mocked(store.saveDraft).mockReturnValueOnce(saving)
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la vue' }))
    expect(screen.queryByRole('button', { name: 'Reprendre la séance' })).not.toBeInTheDocument()

    releaseSave()
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la séance' }))
    expect(screen.getByRole('textbox', { name: 'Poids' })).toHaveValue('95')
  })

  it('garde l’écran allumé entre deux chronos pendant la séance', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    const initial = { ...draftFor('C', '2026-09-20'), keepAwake: true }
    const store = fakeStore({ initial })

    render(<SessionHome store={store} now={SUNDAY} />)

    await resumeSession()
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('abandonne une séance en cours avant de rendre un nouveau démarrage possible', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    render(<SessionHome store={store} now={SUNDAY} />)
    await screen.findByRole('heading', { name: 'Séance C' })

    expect(screen.queryByRole('button', { name: 'Séance A' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Abandonner la séance C ?')).toBeInTheDocument()
    expect(store.clearDraft).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer l’abandon' }))

    await waitFor(() => expect(store.clearDraft).toHaveBeenCalledOnce())
    expect(
      screen.getByRole('button', { name: 'Voir les cibles de la séance C' }),
    ).toBeInTheDocument()
    expect(store.clearDraft).toHaveBeenCalledOnce()
  })

  it('conserve l’écran de reprise si l’abandon échoue', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    vi.mocked(store.clearDraft).mockRejectedValueOnce(new Error('écriture refusée'))
    render(<SessionHome store={store} now={SUNDAY} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Abandonner la séance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abandon impossible : écriture refusée',
    )
    expect(screen.getByRole('button', { name: 'Reprendre la séance' })).toBeInTheDocument()
  })

  it('explique une erreur d’initialisation sans écran vide', async () => {
    const store = fakeStore()
    vi.mocked(store.ready).mockRejectedValueOnce(new Error('IndexedDB refusée'))
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Carnet indisponible' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('IndexedDB refusée')
  })

  it('relit le carnet après une erreur d’initialisation', async () => {
    const store = fakeStore()
    vi.mocked(store.ready).mockRejectedValueOnce(new Error('IndexedDB refusée'))
    render(<SessionHome store={store} now={SUNDAY} />)
    await screen.findByRole('heading', { name: 'Carnet indisponible' })

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(store.ready).toHaveBeenCalledTimes(2)
  })

  it('sauvegarde les notes avant de finaliser et affiche la prochaine séance', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    vi.mocked(store.finalizeSeance).mockImplementationOnce(async (id) => ({
      seance: {
        id,
        type: 'C',
        date: '2026-09-20',
        lines: ['Soulevé de terre : 92,5×3 @8'],
        tops: { deadlift: { w: 92.5, reps: 3, rpe: 8 } },
        notes: 'Solide',
      },
      targets: { ...TARGETS, deadlift: { ...TARGETS.deadlift, w: 97.5 } },
      events: [
        {
          lift: 'deadlift',
          previous: 92.5,
          next: 97.5,
          outcome: 'progresse',
          message: 'Soulevé de terre → 97,5 kg',
        },
      ],
      applied: true,
    }))
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Solide' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    await screen.findByText('Séance enregistrée')
    advanceSummaryTo('Cibles recalculées')
    expect(screen.getByText('Soulevé de terre → 97,5 kg')).toBeInTheDocument()
    advanceSummaryTo('Prochaine séance · A')
    expect(screen.getByRole('heading', { name: 'Prochaine séance · A' })).toBeInTheDocument()
    expect(screen.getByText('22.09.2026')).toBeInTheDocument()
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Solide' }))
    expect(store.finalizeSeance).toHaveBeenCalledWith('draft-C-2026-09-20')
  })

  it('propose mardi après avoir fini C un samedi, jour creux', async () => {
    // Le P1 de Codex sur CB-44, dans le parcours complet. Ugo finit sa séance C le
    // samedi 12.09 : samedi n'est pas un jour de rotation, et la première version
    // lui répondait « Prochaine séance · C » le lendemain — celle qu'il venait de
    // terminer. Ce test échoue dès que le calcul rejuge le jour courant au lieu de
    // chercher le premier créneau non servi.
    const SAMEDI = new Date('2026-09-12T16:00:00Z')
    const store = fakeStore({ initial: draftFor('C', '2026-09-12') })
    render(<SessionHome store={store} now={SAMEDI} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    await screen.findByText('Séance enregistrée')
    advanceSummaryTo('Prochaine séance · A')
    expect(screen.getByRole('heading', { name: 'Prochaine séance · A' })).toBeInTheDocument()
    expect(screen.getByText('15.09.2026')).toBeInTheDocument()
  })

  it('ignore un deuxième tap pendant la finalisation', async () => {
    let resolveFinalize!: (value: FinalizeResult) => void
    const pending = new Promise<FinalizeResult>((resolve) => {
      resolveFinalize = resolve
    })
    const initial = draftFor('C', '2026-09-20')
    const store = fakeStore({ initial })
    vi.mocked(store.finalizeSeance).mockReturnValueOnce(pending)
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    const finish = screen.getByRole('button', { name: 'Terminer la séance' })
    fireEvent.click(finish)
    fireEvent.click(finish)

    await waitFor(() => expect(store.finalizeSeance).toHaveBeenCalledOnce())
    resolveFinalize({
      seance: saved('C', '2026-09-20'),
      targets: TARGETS,
      events: [],
      applied: true,
    })
    expect(await screen.findByText('Séance enregistrée')).toBeInTheDocument()
  })

  it('affiche le même récapitulatif quand la finalisation avait déjà été appliquée', async () => {
    const initial = draftFor('C', '2026-09-20')
    const store = fakeStore({ initial })
    vi.mocked(store.finalizeSeance).mockResolvedValueOnce({
      seance: saved('C', '2026-09-20'),
      targets: TARGETS,
      events: [],
      applied: false,
    })
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(await screen.findByText('Séance enregistrée')).toBeInTheDocument()
    expect(store.finalizeSeance).toHaveBeenCalledOnce()
  })

  it('revient à un accueil relu depuis le résultat de finalisation', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    await screen.findByText('Séance enregistrée')
    advanceSummaryTo('Prochaine séance · A')
    fireEvent.click(await screen.findByRole('button', { name: 'Retour à l’accueil' }))

    expect(await screen.findByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.queryByText('Séance enregistrée')).not.toBeInTheDocument()
  })

  it('transmet la sortie vers l’historique après finalisation', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    const onViewHistory = vi.fn()
    render(<SessionHome store={store} now={SUNDAY} onViewHistory={onViewHistory} />)
    await resumeSession()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    await screen.findByText('Séance enregistrée')
    advanceSummaryTo('Prochaine séance · A')
    fireEvent.click(await screen.findByRole('button', { name: 'Voir dans l’historique' }))

    expect(onViewHistory).toHaveBeenCalledOnce()
  })

  it('demande confirmation quand des séries restent non validées', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.sets = [
      {
        id: 'set-planned',
        exerciseId: 'c-deadlift',
        role: 'top',
        index: 0,
        status: 'planned',
        loadKind: 'barTotal',
        weight: 92.5,
        reps: 3,
        rpe: null,
        targetWeight: 92.5,
        targetReps: 3,
      },
    ]
    const store = fakeStore({ initial })
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    const dialog = screen.getByRole('dialog', { name: 'Séance incomplète' })
    expect(within(dialog).getByText(/1 série n’est pas validée/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Revenir à la séance' })).toHaveFocus()
    expect(store.finalizeSeance).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Séance incomplète' })).not.toBeInTheDocument()
    expect(store.finalizeSeance).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Séance incomplète' })).getByRole('button', {
        name: 'Terminer quand même',
      }),
    )
    await waitFor(() => expect(store.finalizeSeance).toHaveBeenCalledOnce())
  })

  it('attend la dernière sauvegarde avant d’appeler la finalisation', async () => {
    let releaseSave!: () => void
    const saving = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    vi.mocked(store.saveDraft).mockReturnValueOnce(saving)
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Dernière note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(store.finalizeSeance).not.toHaveBeenCalled()
    releaseSave()
    await waitFor(() => expect(store.finalizeSeance).toHaveBeenCalledOnce())
  })

  it('préserve l’éditeur et la saisie quand la finalisation échoue', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.notes = 'À conserver'
    const store = fakeStore({ initial })
    vi.mocked(store.finalizeSeance).mockRejectedValueOnce(new Error('quota dépassé'))
    render(<SessionHome store={store} now={SUNDAY} />)
    await resumeSession()

    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enregistrement impossible : quota dépassé',
    )
    expect(
      screen.getByRole('heading', { name: 'Toutes les séries sont traitées' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Notes de séance/ })).toHaveValue('À conserver')
  })
})
