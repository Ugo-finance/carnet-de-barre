import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildDraft } from '../../db/draft'
import type { Draft, SeanceType, SetLog, Targets } from '../../domain/types'
import { SessionFocus } from './SessionFocus'
import { buildSessionQueue } from './sessionQueue'

const TARGETS: Targets = {
  updatedAt: '2026-09-14',
  squat: { w: 80, inc: 2.5, reps: 4, fail: null },
  bench: { w: 72.5, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 100, inc: 5, reps: 3, fail: null },
  tractions: { w: 17.5, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 62.5, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function draft(type: SeanceType = 'C'): Draft {
  return buildDraft(type, '2026-09-20', TARGETS, { id: `focus-${type}`, now: 1 })
}

function callbacks() {
  return {
    onSetChange: vi.fn(),
    onValidate: vi.fn(),
    onSkip: vi.fn(),
    onNotesChange: vi.fn(),
    onFinish: vi.fn(),
    onExit: vi.fn(),
  }
}

function props(value: Draft = draft()) {
  return {
    type: value.type,
    queue: buildSessionQueue(value),
    elapsedLabel: '12 min',
    notes: value.notes,
    ...callbacks(),
  }
}

function treatBefore(value: Draft, setId: string): Draft {
  const order = buildSessionQueue(value).map(({ set }) => set.id)
  const targetIndex = order.indexOf(setId)
  if (targetIndex < 0) throw new Error(`Série absente du scénario : ${setId}`)
  return {
    ...value,
    sets: value.sets.map((set) => {
      const index = order.indexOf(set.id)
      return index >= 0 && index < targetIndex ? { ...set, status: 'validated' as const } : set
    }),
  }
}

function withStatus(value: Draft, setId: string, status: SetLog['status']): Draft {
  return {
    ...value,
    sets: value.sets.map((set) => (set.id === setId ? { ...set, status } : set)),
  }
}

function openActions(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
}

describe('SessionFocus', () => {
  it('ne rend que la série canonique avec l’avancement et le chrono stable', () => {
    render(<SessionFocus {...props()} />)

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Soulevé de terre' })).toBeInTheDocument()
    expect(screen.queryByText('Développé incliné')).not.toBeInTheDocument()
    expect(screen.getByText('Série 1/16')).toBeInTheDocument()
    expect(screen.getByText('Séance C · Exercice 1/5')).toBeInTheDocument()
    expect(screen.getByText('Repos libre')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '0/16 séries traitées',
    )
  })

  it('n’avance pas avant que le parent fournisse le brouillon écrit', () => {
    const value = draft()
    const actions = props(value)
    render(<SessionFocus {...actions} />)
    const currentName = screen.getByRole('article').getAttribute('aria-label')

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(actions.onValidate).toHaveBeenCalledOnce()
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', currentName)
    expect(screen.getByText('Série 1/16')).toBeInTheDocument()
  })

  it('garde les notes accessibles sans afficher une seconde carte de série', () => {
    const actions = props()
    render(<SessionFocus {...actions} />)

    openActions()
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes de séance (facultatif)' }), {
      target: { value: 'Genou stable' },
    })

    expect(actions.onNotesChange).toHaveBeenCalledWith('Genou stable')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('affiche le RPE uniquement sur le top set', () => {
    const value = treatBefore(draft(), 'c-deadlift:top:0')
    render(<SessionFocus {...props(value)} />)

    expect(screen.getByRole('group', { name: 'RPE' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /100 kg — Par côté/ })).toBeInTheDocument()
  })

  it('rend le partenaire puis l’exercice suivant dans un superset', () => {
    const value = treatBefore(draft('A'), 'a-tractions-lestees:accessory:0')
    render(<SessionFocus {...props(value)} />)

    expect(screen.getByText('SS · Dips lestés')).toBeInTheDocument()
    openActions()
    expect(screen.getByText('Dips lestés · série 1/3')).toBeInTheDocument()
  })

  it('permet de passer un palier et un optionnel depuis leur nature réelle', () => {
    const warmupActions = props()
    const { unmount } = render(<SessionFocus {...warmupActions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Passer ce palier' }))
    expect(warmupActions.onSkip).toHaveBeenCalledOnce()
    unmount()

    const optional = treatBefore(draft(), 'c-elevations:accessory:0')
    const optionalActions = props(optional)
    render(<SessionFocus {...optionalActions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sauter — optionnel' }))
    expect(optionalActions.onSkip).toHaveBeenCalledOnce()
  })

  it('offre une relecture précédente puis un retour explicite à la série courante', () => {
    let value = draft()
    const first = buildSessionQueue(value)[0]!.set.id
    const second = buildSessionQueue(value)[1]!.set.id
    value = withStatus(value, first, 'validated')
    value = withStatus(value, second, 'validated')
    render(<SessionFocus {...props(value)} />)

    const canonicalName = screen.getByRole('article').getAttribute('aria-label')
    openActions()
    fireEvent.click(screen.getByRole('button', { name: 'Précédente' }))
    expect(screen.getByRole('article')).not.toHaveAttribute('aria-label', canonicalName)

    openActions()
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la série courante' }))
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', canonicalName)
  })

  it('identifie un palier sauté quand il est relu', () => {
    let value = draft()
    const first = buildSessionQueue(value)[0]!.set.id
    const second = buildSessionQueue(value)[1]!.set.id
    value = withStatus(value, first, 'validated')
    value = withStatus(value, second, 'skipped')
    render(<SessionFocus {...props(value)} />)

    openActions()
    fireEvent.click(screen.getByRole('button', { name: 'Précédente' }))

    expect(screen.getByText('Statut : Sautée')).toBeInTheDocument()
    expect(screen.queryByText('Statut : Validée')).not.toBeInTheDocument()
  })

  it('duplique précédente/suivante au balayage sans dépasser la série canonique', () => {
    let value = draft()
    const first = buildSessionQueue(value)[0]!.set.id
    const second = buildSessionQueue(value)[1]!.set.id
    value = withStatus(value, first, 'validated')
    value = withStatus(value, second, 'validated')
    render(<SessionFocus {...props(value)} />)
    const screenRoot = screen.getByRole('main')
    const canonicalName = screen.getByRole('article').getAttribute('aria-label')

    fireEvent.touchStart(screenRoot, { touches: [{ clientX: 180, clientY: 100 }] })
    fireEvent.touchEnd(screenRoot, { changedTouches: [{ clientX: 250, clientY: 104 }] })
    expect(screen.getByRole('article')).not.toHaveAttribute('aria-label', canonicalName)

    fireEvent.touchStart(screenRoot, { touches: [{ clientX: 250, clientY: 100 }] })
    fireEvent.touchEnd(screenRoot, { changedTouches: [{ clientX: 180, clientY: 104 }] })
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', canonicalName)

    // Depuis la série à faire, un autre balayage vers la gauche ne peut pas l'ignorer.
    fireEvent.touchStart(screenRoot, { touches: [{ clientX: 250, clientY: 100 }] })
    fireEvent.touchEnd(screenRoot, { changedTouches: [{ clientX: 180, clientY: 104 }] })
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', canonicalName)
  })

  it('ignore un geste vertical ou trop court', () => {
    let value = draft()
    const first = buildSessionQueue(value)[0]!.set.id
    value = withStatus(value, first, 'validated')
    render(<SessionFocus {...props(value)} />)
    const screenRoot = screen.getByRole('main')
    const canonicalName = screen.getByRole('article').getAttribute('aria-label')

    fireEvent.touchStart(screenRoot, { touches: [{ clientX: 180, clientY: 80 }] })
    fireEvent.touchEnd(screenRoot, { changedTouches: [{ clientX: 200, clientY: 160 }] })

    expect(screen.getByRole('article')).toHaveAttribute('aria-label', canonicalName)
  })

  it('garde la carte et bloque ses actions pendant une écriture en échec', () => {
    const actions = props()
    render(<SessionFocus {...actions} writing errorMessage="Sauvegarde impossible. Réessayer." />)

    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).getByRole('alert')).toHaveTextContent('Sauvegarde impossible. Réessayer.')
    expect(screen.getByRole('button', { name: 'Sauvegarde…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Passer ce palier' })).toBeDisabled()
    openActions()
    expect(screen.getByRole('button', { name: 'Quitter la vue' })).toBeDisabled()
  })

  it('nomme explicitement l’action qui retente une sauvegarde échouée', () => {
    const actions = props()
    render(<SessionFocus {...actions} errorMessage="Sauvegarde impossible. Réessayer." />)

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(actions.onValidate).toHaveBeenCalledWith(
      actions.queue[0]!.set.id,
      expect.objectContaining({ status: 'validated' }),
    )
  })

  it('offre la finalisation quand toute la file est traitée', () => {
    const value = {
      ...draft(),
      sets: draft().sets.map((set) => ({ ...set, status: 'validated' as const })),
    }
    const actions = props(value)
    render(<SessionFocus {...actions} />)

    expect(
      screen.getByRole('heading', { name: 'Toutes les séries sont traitées' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    expect(actions.onFinish).toHaveBeenCalledOnce()
  })

  it('permet de saisir les notes avant la finalisation', () => {
    const base = draft()
    const value = {
      ...base,
      sets: base.sets.map((set) => ({ ...set, status: 'validated' as const })),
    }
    const actions = props(value)
    render(<SessionFocus {...actions} />)

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Solide' },
    })
    expect(actions.onNotesChange).toHaveBeenCalledWith('Solide')
  })

  it('permet de demander une fin incomplète sans quitter la série courante', () => {
    const actions = props()
    render(<SessionFocus {...actions} />)

    openActions()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    expect(actions.onFinish).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Soulevé de terre' })).toBeInTheDocument()
  })

  it('reste finalisable après une erreur d’enregistrement', () => {
    const base = draft()
    const value = {
      ...base,
      sets: base.sets.map((set) => ({ ...set, status: 'skipped' as const })),
    }
    const actions = props(value)
    const { rerender } = render(<SessionFocus {...actions} finishing />)

    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
    rerender(
      <SessionFocus {...actions} finishErrorMessage="Enregistrement impossible : quota dépassé" />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement impossible : quota dépassé')
    expect(screen.getByRole('button', { name: 'Terminer la séance' })).toBeEnabled()
  })

  it('affiche le chrono actif au même emplacement', () => {
    render(
      <SessionFocus
        {...props()}
        timer={{
          endsAt: Date.now() + 60_000,
          label: 'Récup top set',
          onAdjust: vi.fn(),
          onStop: vi.fn(),
        }}
      />,
    )

    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByText('Récup top set')).toBeInTheDocument()
    expect(screen.queryByText('Repos libre')).not.toBeInTheDocument()
  })
})
