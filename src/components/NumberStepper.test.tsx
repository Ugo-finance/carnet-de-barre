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
})
