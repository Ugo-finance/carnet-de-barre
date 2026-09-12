import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { type EditableSet, SetCard } from './SetCard'

const planned: EditableSet = { weight: 75, reps: 4, rpe: null, status: 'planned' }

describe('SetCard', () => {
  it('valide une série préremplie en un tap', () => {
    const onValidate = vi.fn()
    render(
      <SetCard
        label="Top set"
        value={planned}
        onChange={vi.fn()}
        onValidate={onValidate}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onValidate).toHaveBeenCalledOnce()
    expect(onValidate).toHaveBeenCalledWith({ ...planned, status: 'validated' })
  })

  it('rend visible le passage de prévue à saisie', () => {
    function ControlledSet() {
      const [value, setValue] = useState(planned)
      return (
        <SetCard
          label="Top set"
          value={value}
          onChange={setValue}
          onValidate={setValue}
          onSkip={setValue}
        />
      )
    }

    render(<ControlledSet />)
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))

    expect(screen.getByText('Saisie')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Poids' })).toHaveValue('77,5')
  })

  it('permet de corriger une série validée avant finalisation', () => {
    function ControlledSet() {
      const [value, setValue] = useState<EditableSet>({ ...planned, status: 'validated' })
      return (
        <SetCard
          label="Top set"
          value={value}
          onChange={setValue}
          onValidate={setValue}
          onSkip={setValue}
        />
      )
    }

    render(<ControlledSet />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))

    expect(screen.getByText('Saisie')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Poids' })).toBeEnabled()
  })

  it('ne demande que les répétitions pour une série au poids du corps', () => {
    render(
      <SetCard
        label="Série 1"
        value={{ ...planned, weight: null }}
        onChange={vi.fn()}
        onValidate={vi.fn()}
        onSkip={vi.fn()}
        showWeight={false}
        showRpe={false}
      />,
    )

    expect(screen.queryByRole('textbox', { name: 'Poids' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Répétitions' })).toBeInTheDocument()
  })
})
