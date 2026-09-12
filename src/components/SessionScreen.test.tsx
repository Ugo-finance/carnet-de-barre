import { fireEvent, render, screen, within } from '@testing-library/react'
import { SEANCES } from '../domain/program'
import type { Draft, SeanceType, SetLog, Targets } from '../domain/types'
import { SessionScreen } from './SessionScreen'

const TARGETS: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function draftFor(type: SeanceType): Draft {
  const sets = SEANCES[type].exercises.flatMap((exercise): SetLog[] => {
    if (exercise.kind === 'optional') return []
    const target = exercise.lift ? TARGETS[exercise.lift] : undefined
    const count = exercise.kind === 'topset' ? 1 : exercise.sets
    return Array.from({ length: count }, (_, index) => ({
      id: `${exercise.id}:${index}`,
      exerciseId: exercise.id,
      role:
        exercise.kind === 'topset'
          ? ('top' as const)
          : exercise.kind === 'volume'
            ? ('volume' as const)
            : ('accessory' as const),
      index,
      status: 'planned' as const,
      loadKind: exercise.loadKind,
      weight:
        exercise.loadKind === 'bodyweight' ? null : (target?.w ?? exercise.suggestedWeight ?? null),
      reps: target?.reps ?? exercise.reps ?? exercise.repsRange?.[0] ?? null,
      rpe: null,
      targetWeight:
        exercise.loadKind === 'bodyweight' ? null : (target?.w ?? exercise.suggestedWeight ?? null),
      targetReps: target?.reps ?? exercise.reps ?? exercise.repsRange?.[0] ?? null,
    }))
  })

  return {
    id: `draft-${type}`,
    type,
    date: type === 'C' ? '2026-09-20' : '2026-09-22',
    sets,
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

function renderSession(
  type: SeanceType,
  overrides: Partial<Parameters<typeof SessionScreen>[0]> = {},
) {
  const props = {
    draft: draftFor(type),
    whenLabel: "Aujourd'hui",
    onSelectType: vi.fn(),
    onSetChange: vi.fn(),
    onSetValidate: vi.fn(),
    onAccessoryChange: vi.fn(),
    onNotesChange: vi.fn(),
    onTimerAdjust: vi.fn(),
    onTimerStop: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  }
  render(<SessionScreen {...props} />)
  return props
}

describe('SessionScreen', () => {
  it.each([
    ['A', '75 kg', '60 kg'],
    ['B', '70 kg', '+15 kg'],
    ['C', '92,5 kg', '20 kg/haltère'],
  ] as const)('affiche les cibles principales de la séance %s', (type, first, second) => {
    renderSession(type)

    expect(screen.getByText(first)).toBeInTheDocument()
    expect(screen.getByText(second)).toBeInTheDocument()
  })

  it('respecte l’ordre de la séance C et affiche les plaques de la barre', () => {
    renderSession('C')
    const cards = screen.getAllByRole('article')

    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Soulevé de terre',
      'Top set',
      'Développé incliné haltères',
      'Série 1',
      'Série 2',
      'Série 3',
      'Presse 45°',
      'Série 1',
      'Série 2',
      'Tractions poids de corps',
      'Série 1',
      'Série 2',
      'Élévations latérales',
    ])
    expect(screen.getByText('Par côté : 25 + 10 + 1,25')).toBeInTheDocument()
  })

  it('laisse les trois séances accessibles avec des cibles tactiles de 44 px', () => {
    const onSelectType = vi.fn()
    renderSession('C', { onSelectType })

    const button = screen.getByRole('button', { name: 'Séance A' })
    expect(button).toHaveClass('min-h-11')
    fireEvent.click(button)
    expect(onSelectType).toHaveBeenCalledWith('A')
  })

  it('valide une série préremplie en un tap avec son identifiant', () => {
    const onSetValidate = vi.fn()
    renderSession('A', { onSetValidate })
    const squat = screen.getByRole('article', { name: 'Squat' })

    fireEvent.click(within(squat).getByRole('button', { name: 'Valider' }))

    expect(onSetValidate).toHaveBeenCalledWith(
      'a-squat:0',
      expect.objectContaining({ weight: 75, reps: 4, status: 'validated' }),
      { seconds: 150, label: 'Récup Squat' },
    )
  })

  it('demande 75 secondes de récupération pour un exercice en superset', () => {
    const onSetValidate = vi.fn()
    renderSession('A', { onSetValidate })
    const tractions = screen.getByRole('article', { name: 'Tractions lestées' })

    fireEvent.click(within(tractions).getAllByRole('button', { name: 'Valider' })[0])

    expect(onSetValidate).toHaveBeenCalledWith(
      'a-tractions-lestees:0',
      expect.objectContaining({ status: 'validated' }),
      { seconds: 75, label: 'Récup Tractions lestées' },
    )
  })

  it('ne propose pas de poids sur les tractions au poids du corps', () => {
    renderSession('C')
    const pdc = screen.getByRole('article', { name: 'Tractions poids de corps' })

    expect(within(pdc).queryByRole('textbox', { name: 'Poids' })).not.toBeInTheDocument()
    expect(within(pdc).getAllByRole('textbox', { name: 'Répétitions' })).toHaveLength(2)
  })

  it('conserve la saisie libre d’un exercice optionnel', () => {
    const onAccessoryChange = vi.fn()
    renderSession('C', { onAccessoryChange })
    const optional = screen.getByRole('article', { name: 'Élévations latérales' })

    fireEvent.change(within(optional).getByRole('textbox'), { target: { value: '8 kg × 12' } })

    expect(onAccessoryChange).toHaveBeenCalledWith('c-elevations', {
      done: false,
      note: '8 kg × 12',
    })
  })

  it('transmet les notes et permet de terminer la séance', () => {
    const onNotesChange = vi.fn()
    const onFinish = vi.fn()
    renderSession('C', { onNotesChange, onFinish })

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Bonne énergie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(onNotesChange).toHaveBeenCalledWith('Bonne énergie')
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('désactive la finalisation pendant l’écriture et affiche son erreur près du bouton', () => {
    renderSession('C', {
      finishing: true,
      finishErrorMessage: 'Enregistrement impossible : quota dépassé',
    })

    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('quota dépassé')
  })
})
