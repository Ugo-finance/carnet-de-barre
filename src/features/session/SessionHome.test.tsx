import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FinalizeResult } from '../../db/contracts'
import { SEANCES } from '../../domain/program'
import type { Draft, Seance, SeanceType, Targets } from '../../domain/types'
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
    accessories: SEANCES[type].exercises
      .filter((exercise) => exercise.kind === 'optional')
      .map((exercise) => ({ exerciseId: exercise.id, done: false, note: '' })),
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    baseTargets: TARGETS,
    createdAt: 1,
    updatedAt: 1,
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
    loadDraft: vi.fn(async () => active),
    openDraft: vi.fn(async (type: SeanceType, date: string) => {
      active ??= draftFor(type, date)
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

const SUNDAY = new Date('2026-09-20T14:00:00Z')

describe('SessionHome', () => {
  it('ouvre directement la séance C prévue le dimanche', async () => {
    const store = fakeStore()
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument()
    expect(store.openDraft).toHaveBeenCalledWith('C', '2026-09-20')
  })

  it('propose la séance suivante mais date le brouillon du jour réel', async () => {
    const store = fakeStore({ seances: [saved('C', '2026-09-20')] })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui · hors rotation")).toBeInTheDocument()
    expect(store.openDraft).toHaveBeenCalledWith('A', '2026-09-20')
  })

  it('reprend un brouillon existant avant la proposition du calendrier', async () => {
    const store = fakeStore({ initial: draftFor('B', '2026-09-17') })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance B' })).toBeInTheDocument()
    expect(screen.getByText('Séance à reprendre')).toBeInTheDocument()
    expect(store.openDraft).not.toHaveBeenCalled()
  })

  it('restaure le chrono porté par un brouillon existant', async () => {
    const initial = draftFor('C', '2026-09-20')
    initial.timerEndsAt = Date.now() + 150_000
    initial.timerLabel = 'Récup Soulevé de terre'
    const store = fakeStore({ initial })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByText('Récup Soulevé de terre')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('ne remplace une séance en cours qu’après un abandon explicite', async () => {
    const store = fakeStore({ initial: draftFor('C', '2026-09-20') })
    render(<SessionHome store={store} now={SUNDAY} />)
    await screen.findByRole('heading', { name: 'Séance C' })

    fireEvent.click(screen.getByRole('button', { name: 'Séance A' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Séance C en cours')).toBeInTheDocument()
    expect(store.clearDraft).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Abandonner et ouvrir A' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Séance A' })).toBeInTheDocument(),
    )
    expect(store.clearDraft).toHaveBeenCalledOnce()
    expect(store.openDraft).toHaveBeenLastCalledWith('A', '2026-09-20')
    expect(screen.getByText("Aujourd'hui · hors rotation")).toBeInTheDocument()
  })

  it('explique une erreur d’initialisation sans écran vide', async () => {
    const store = fakeStore()
    vi.mocked(store.ready).mockRejectedValueOnce(new Error('IndexedDB refusée'))
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Carnet indisponible : IndexedDB refusée',
    )
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
    await screen.findByRole('heading', { name: 'Séance C' })

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Solide' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(await screen.findByText('Soulevé de terre → 97,5 kg')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prochaine séance · A' })).toBeInTheDocument()
    expect(screen.getByText('22.09.2026')).toBeInTheDocument()
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Solide' }))
    expect(store.finalizeSeance).toHaveBeenCalledWith('draft-C-2026-09-20')
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
    await screen.findByRole('heading', { name: 'Séance C' })

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
    await screen.findByRole('heading', { name: 'Séance C' })

    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    const dialog = screen.getByRole('dialog', { name: 'Séance incomplète' })
    expect(within(dialog).getByText(/1 série n’est pas validée/)).toBeInTheDocument()
    expect(store.finalizeSeance).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Revenir à la séance' }))
    expect(screen.queryByRole('dialog', { name: 'Séance incomplète' })).not.toBeInTheDocument()
    expect(store.finalizeSeance).not.toHaveBeenCalled()

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
    await screen.findByRole('heading', { name: 'Séance C' })

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
    await screen.findByRole('heading', { name: 'Séance C' })

    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enregistrement impossible : quota dépassé',
    )
    expect(screen.getByRole('heading', { name: 'Séance C' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Notes de séance/ })).toHaveValue('À conserver')
  })
})
