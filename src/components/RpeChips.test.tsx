import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { RpeChips, type RpeValue } from './RpeChips'

function ControlledRpe() {
  const [value, setValue] = useState<RpeValue | null>(null)
  return <RpeChips value={value} onChange={setValue} />
}

describe('RpeChips', () => {
  it('décrit le sens du RPE sans dépendre de la couleur', () => {
    render(<ControlledRpe />)

    fireEvent.click(screen.getByRole('button', { name: 'RPE 8,5 — maintien' }))
    expect(screen.getByText('RPE 8,5 · maintien')).toBeInTheDocument()
  })

  it('désélectionne le RPE choisi', () => {
    render(<ControlledRpe />)
    const choice = screen.getByRole('button', { name: 'RPE 9 — échec' })

    fireEvent.click(choice)
    fireEvent.click(choice)

    expect(screen.getByText('RPE non renseigné')).toBeInTheDocument()
  })
})
