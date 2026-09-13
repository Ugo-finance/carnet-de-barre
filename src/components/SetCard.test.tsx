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
    const onValidate = vi.fn()
    function ControlledSet() {
      const [value, setValue] = useState<EditableSet>({ ...planned, status: 'validated' })
      return (
        <SetCard
          label="Top set"
          value={value}
          onChange={setValue}
          onValidate={onValidate}
          onSkip={setValue}
        />
      )
    }

    render(<ControlledSet />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))

    // Le statut validé est conservé dans le brouillon : même si iOS décharge la PWA
    // ici, le remontage ne peut pas confondre cette correction avec une première saisie.
    expect(screen.getByText('Correction')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Poids' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Poids' })).toHaveValue('77,5')

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onValidate).not.toHaveBeenCalled()
    expect(screen.getByText('Validée')).toBeInTheDocument()
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
