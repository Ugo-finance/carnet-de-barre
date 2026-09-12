import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('affiche le titre', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Carnet de barre' })).toBeInTheDocument()
  })
})
