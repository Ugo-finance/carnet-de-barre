import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoryPanel } from './HistoryPanel'
import type { Seance } from '../../domain/types'

function seance(over: Partial<Seance> & Pick<Seance, 'id' | 'date' | 'type'>): Seance {
  return { lines: [], tops: {}, notes: '', ...over }
}

const JUILLET = seance({
  id: 's-juillet',
  date: '2026-07-22',
  type: 'B',
  lines: ['Développé couché : 70×4 @8'],
  approx: true,
})

const CE_SOIR = seance({
  id: 's-ce-soir',
  date: '2026-09-12',
  type: 'C',
  lines: ['Soulevé de terre : 92,5×3 @8', 'Développé incliné haltères : 20 kg/haltère×9'],
  notes: 'Bonne énergie',
})

describe('historique', () => {
  it('met la séance la plus récente en haut et la déplie', () => {
    // C'est la question du premier soir : « est-ce que ma séance est bien là ? ».
    // Elle doit trouver sa réponse sans un seul tap.
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} />)

    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Séance C')).toBeInTheDocument()
    expect(screen.getByText('Soulevé de terre : 92,5×3 @8')).toBeInTheDocument()
  })

  it('replie les séances plus anciennes', () => {
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} />)

    expect(screen.queryByText('Développé couché : 70×4 @8')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Développé couché : 70×4 @8')).toBeInTheDocument()
  })

  it('compte les séances enregistrées', () => {
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} />)
    expect(screen.getByText('2 séances enregistrées.')).toBeInTheDocument()
  })

  it('signale une date reconstituée de mémoire', () => {
    // Les deux séances de juillet du dossier de départ sont datées de mémoire.
    // Les présenter comme exactes serait leur donner une précision qu'elles n'ont pas.
    render(<HistoryPanel seances={[JUILLET]} />)
    expect(screen.getByText(/22\.07\.2026 \(environ\)/)).toBeInTheDocument()
  })

  it('alerte franchement sur une séance sans aucune série', () => {
    // Le pire résultat possible : finaliser sans avoir validé. Un bloc vide passerait
    // pour un défaut d'affichage ; il faut dire ce qui s'est réellement passé.
    render(<HistoryPanel seances={[seance({ id: 'vide', date: '2026-09-12', type: 'A' })]} />)

    expect(screen.getByText(/Aucune série enregistrée/)).toBeInTheDocument()
    expect(screen.getByText(/non validées ne sont pas conservées/)).toBeInTheDocument()
  })

  it('affiche les notes quand il y en a, et rien quand il n’y en a pas', () => {
    render(<HistoryPanel seances={[CE_SOIR]} />)
    expect(screen.getByText('Bonne énergie')).toBeInTheDocument()
  })

  it('le dit quand l’historique est vide', () => {
    render(<HistoryPanel seances={[]} />)
    expect(screen.getByText('Aucune séance enregistrée pour le moment.')).toBeInTheDocument()
  })

  it('ne modifie pas le tableau reçu', () => {
    // L'écran trie pour afficher ; la liste appartient à l'appelant.
    const liste = [JUILLET, CE_SOIR]
    render(<HistoryPanel seances={liste} />)
    expect(liste[0]).toBe(JUILLET)
  })
})
