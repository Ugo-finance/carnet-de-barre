import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('propose la séance suivante quand la séance prévue du jour est terminée', async () => {
    const store = fakeStore({ seances: [saved('C', '2026-09-20')] })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance A' })).toBeInTheDocument()
    expect(screen.getByText('Mardi')).toBeInTheDocument()
    expect(store.openDraft).toHaveBeenCalledWith('A', '2026-09-22')
  })

  it('reprend un brouillon existant avant la proposition du calendrier', async () => {
    const store = fakeStore({ initial: draftFor('B', '2026-09-17') })
    render(<SessionHome store={store} now={SUNDAY} />)

    expect(await screen.findByRole('heading', { name: 'Séance B' })).toBeInTheDocument()
    expect(screen.getByText('Séance à reprendre')).toBeInTheDocument()
    expect(store.openDraft).not.toHaveBeenCalled()
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
})
