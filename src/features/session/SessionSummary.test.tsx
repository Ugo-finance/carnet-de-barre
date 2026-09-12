import { render, screen } from '@testing-library/react'
import type { FinalizeResult } from '../../db/contracts'
import type { ProgressionEvent, Seance, Targets } from '../../domain/types'
import { SessionSummary } from './SessionSummary'

const TARGETS: Targets = {
  updatedAt: '2026-09-20',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 72.5, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 97.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

function resultWith(events: ProgressionEvent[]): FinalizeResult {
  const seance: Seance = {
    id: 'seance-c',
    date: '2026-09-20',
    type: 'C',
    lines: [],
    tops: {},
    notes: '',
  }
  return { seance, targets: TARGETS, events, applied: true }
}

describe('SessionSummary', () => {
  it('reprend exactement les messages du moteur, y compris un ajustement à la baisse', () => {
    const message = 'Soulevé de terre → 90 kg (ajusté sous la cible précédente)'
    render(
      <SessionSummary
        result={resultWith([
          { lift: 'deadlift', previous: 92.5, next: 90, outcome: 'ajuste', message },
        ])}
        next={{ type: 'A', date: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/hausse/i)).not.toBeInTheDocument()
  })

  it('affiche la prochaine séance, ses cibles et le rappel d’export', () => {
    render(
      <SessionSummary
        result={resultWith([])}
        next={{ type: 'A', date: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Prochaine séance · A' })).toBeInTheDocument()
    expect(screen.getByText('22.09.2026')).toBeInTheDocument()
    expect(screen.getByText('75 kg')).toBeInTheDocument()
    expect(screen.getByText('60 kg')).toBeInTheDocument()
    expect(screen.getByText(/exporter tes données/)).toBeInTheDocument()
  })
})
