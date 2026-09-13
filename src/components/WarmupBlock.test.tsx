import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { SetLog } from '../domain/types'
import { WarmupBlock } from './WarmupBlock'

function warmup(
  index: number,
  weight: number | null,
  reps: number,
  status: SetLog['status'],
): SetLog {
  return {
    id: `deadlift:warmup:${index}`,
    exerciseId: 'deadlift',
    role: 'warmup',
    index,
    status,
    loadKind: 'barTotal',
    weight,
    reps,
    rpe: null,
    targetWeight: weight,
    targetReps: reps,
  }
}

const SETS = [
  warmup(0, 60, 5, 'planned'),
  warmup(1, 72.5, 3, 'planned'),
  warmup(2, 82.5, 1, 'planned'),
]

function StatefulWarmup() {
  const [sets, setSets] = useState(SETS)
  const update = (setId: string, value: Pick<SetLog, 'weight' | 'reps' | 'rpe' | 'status'>) =>
    setSets((current) => current.map((set) => (set.id === setId ? { ...set, ...value } : set)))

  return (
    <WarmupBlock
      exerciseLabel="Soulevé de terre"
      loadKind="barTotal"
      sets={sets}
      onSetChange={update}
      onSetValidate={update}
    />
  )
}

describe('WarmupBlock', () => {
  it('affiche les paliers éditables, leurs plaques et les valide en un tap', () => {
    const onSetValidate = vi.fn()
    render(
      <WarmupBlock
        exerciseLabel="Soulevé de terre"
        loadKind="barTotal"
        sets={SETS}
        onSetChange={vi.fn()}
        onSetValidate={onSetValidate}
      />,
    )

    const first = screen.getByRole('article', { name: 'Palier 1' })
    expect(within(first).getByRole('textbox', { name: 'Poids' })).toHaveValue('60')
    expect(screen.getByText('Par côté : 20')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '60 kg — Par côté : 20' })).toBeInTheDocument()

    fireEvent.click(within(first).getByRole('button', { name: 'Valider' }))
    expect(onSetValidate).toHaveBeenCalledWith(
      'deadlift:warmup:0',
      expect.objectContaining({ weight: 60, reps: 5, status: 'validated' }),
    )
  })

  it('replie les paliers traités en une ligne et permet de les corriger', () => {
    render(<StatefulWarmup />)

    fireEvent.click(
      within(screen.getByRole('article', { name: 'Palier 1' })).getByRole('button', {
        name: 'Valider',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('article', { name: 'Palier 2' })).getByRole('button', {
        name: 'Sauter',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('article', { name: 'Palier 3' })).getByRole('button', {
        name: 'Valider',
      }),
    )

    const summary = screen.getByRole('button', {
      name: /✓ Échauffement 3\/3 · 60×5 · 72,5×3 · 82,5×1/,
    })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('article', { name: 'Palier 1' })).not.toBeInTheDocument()

    fireEvent.click(summary)
    expect(screen.getByRole('article', { name: 'Palier 1' })).toBeInTheDocument()
    expect(summary).toHaveAttribute('aria-expanded', 'true')
  })

  it('laisse chaque palier passable avec une cible tactile de 44 px', () => {
    const onSetChange = vi.fn()
    render(
      <WarmupBlock
        exerciseLabel="Soulevé de terre"
        loadKind="barTotal"
        sets={SETS}
        onSetChange={onSetChange}
        onSetValidate={vi.fn()}
      />,
    )

    const first = screen.getByRole('article', { name: 'Palier 1' })
    const skip = within(first).getByRole('button', { name: 'Sauter' })
    expect(skip).toHaveClass('min-h-11')
    fireEvent.click(skip)
    expect(onSetChange).toHaveBeenCalledWith(
      'deadlift:warmup:0',
      expect.objectContaining({ status: 'skipped' }),
    )
  })

  it('présente le premier palier de tractions comme poids du corps sans champ de lest', () => {
    const bodyweight = {
      ...warmup(0, null, 5, 'planned'),
      id: 'tractions:warmup:0',
      exerciseId: 'tractions',
      loadKind: 'added' as const,
    }
    render(
      <WarmupBlock
        exerciseLabel="Tractions lestées"
        loadKind="added"
        sets={[bodyweight]}
        onSetChange={vi.fn()}
        onSetValidate={vi.fn()}
      />,
    )

    const palier = screen.getByRole('article', { name: 'Palier 1' })
    expect(screen.getByText('PDC · poids du corps')).toBeInTheDocument()
    expect(within(palier).queryByRole('textbox', { name: 'Poids' })).not.toBeInTheDocument()
    expect(within(palier).getByRole('textbox', { name: 'Répétitions' })).toHaveValue('5')
  })
})
