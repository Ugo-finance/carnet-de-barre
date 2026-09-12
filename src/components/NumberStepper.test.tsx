import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { NumberStepper } from './NumberStepper'

function ControlledStepper() {
  const [value, setValue] = useState<number | null>(20)
  return <NumberStepper label="Poids" value={value} onChange={setValue} step={2.5} unit="kg" />
}

describe('NumberStepper', () => {
  it('applique le pas sans erreur de virgule flottante', () => {
    render(<ControlledStepper />)

    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))

    expect(screen.getByRole('textbox', { name: 'Poids' })).toHaveValue('25')
  })

  it('accepte une saisie avec virgule', () => {
    render(<ControlledStepper />)
    const input = screen.getByRole('textbox', { name: 'Poids' })

    fireEvent.change(input, { target: { value: '22,5' } })
    fireEvent.blur(input)

    expect(input).toHaveValue('22,5')
  })

  it('revient à la valeur contrôlée avant un pas si la saisie est invalide', () => {
    render(<ControlledStepper />)
    const input = screen.getByRole('textbox', { name: 'Poids' })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'invalide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Poids de 2,5' }))

    expect(input).toHaveValue('22,5')
  })

  it('respecte une borne maximale optionnelle', () => {
    render(<NumberStepper label="Répétitions" value={100} onChange={vi.fn()} step={1} max={100} />)

    expect(screen.getByRole('button', { name: 'Augmenter Répétitions de 1' })).toBeDisabled()
  })
})
