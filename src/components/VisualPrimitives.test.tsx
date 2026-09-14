import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BarbellLoad } from './BarbellLoad'
import { BottomNav } from './BottomNav'
import { BottomSheet } from './BottomSheet'
import { FocusSetCard } from './FocusSetCard'
import { ProgressBar } from './ProgressBar'

describe('barre dessinée', () => {
  it('annonce la charge et le chargement exact sans dépendre des couleurs', () => {
    const { container } = render(<BarbellLoad total={92.5} />)
    expect(
      screen.getByRole('img', { name: '92,5 kg — Par côté : 25 + 10 + 1,25' }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('[style*="--plate-color"]')).toHaveLength(3)
  })

  it('annonce explicitement une barre seule', () => {
    render(<BarbellLoad total={20} />)
    expect(screen.getByRole('img', { name: '20 kg — Barre seule' })).toBeInTheDocument()
  })
})

describe('progression', () => {
  it('borne une valeur hors plage tout en gardant les informations accessibles', () => {
    render(
      <ProgressBar value={18} max={16} label="Avancement de la séance" valueText="16 sur 16" />,
    )
    const progress = screen.getByRole('progressbar', { name: 'Avancement de la séance' })
    expect(progress).toHaveAttribute('aria-valuenow', '16')
    expect(progress).toHaveAttribute('aria-valuetext', '16 sur 16')
    expect(progress.firstElementChild).toHaveStyle({ width: '100%' })
  })
})

describe('navigation basse', () => {
  it('nomme l’onglet courant et transmet le choix', () => {
    const onSelect = vi.fn()
    render(<BottomNav active="history" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'Historique' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getAllByRole('button')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }))
    expect(onSelect).toHaveBeenCalledWith('progress')
  })
})

describe('feuille basse', () => {
  it('lie son titre au dialogue et offre une fermeture nommée', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open title="Ajuster la cible" onClose={onClose}>
        <p>Contenu</p>
      </BottomSheet>,
    )

    expect(screen.getByRole('dialog', { name: 'Ajuster la cible' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('carte de série focus', () => {
  it('rend le rôle, le superset et les deux actions explicites', () => {
    const onPrimary = vi.fn()
    const onSkip = vi.fn()
    render(
      <FocusSetCard
        role="optional"
        exercise="Élévations latérales"
        seriesLabel="série 1/2"
        load="12"
        unit="kg/haltère"
        supersetPartner="Curls"
        onPrimary={onPrimary}
        onSkip={onSkip}
      />,
    )

    expect(screen.getByText('Optionnel')).toBeInTheDocument()
    expect(screen.getByText('SS · Curls')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sauter — optionnel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider la série' }))
    expect(onSkip).toHaveBeenCalledOnce()
    expect(onPrimary).toHaveBeenCalledOnce()
  })

  it('garde l’erreur sur la carte et bloque les actions pendant l’écriture', () => {
    const onPrimary = vi.fn()
    const onSkip = vi.fn()
    render(
      <FocusSetCard
        role="warmup"
        exercise="Squat"
        seriesLabel="palier 1"
        load="20"
        unit="kg"
        skipLabel="Passer ce palier"
        busy
        errorMessage="Sauvegarde impossible."
        onPrimary={onPrimary}
        onSkip={onSkip}
      />,
    )

    expect(screen.getByRole('article', { name: 'Squat · palier 1' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Sauvegarde impossible.')
    expect(screen.getByRole('button', { name: 'Passer ce palier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Valider la série' })).toBeDisabled()
  })
})
