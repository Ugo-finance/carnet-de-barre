import { fireEvent, render, screen, within } from '@testing-library/react'
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
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/hausse/i)).not.toBeInTheDocument()
  })

  it('affiche la prochaine séance, ses cibles et le rappel d’export', () => {
    render(
      <SessionSummary
        result={resultWith([])}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Prochaine séance · A' })).toBeInTheDocument()
    expect(screen.getByText('22.09.2026')).toBeInTheDocument()
    expect(screen.getByText('75 kg')).toBeInTheDocument()
    expect(screen.getByText('60 kg')).toBeInTheDocument()
    expect(screen.getByText(/exporter tes données/)).toBeInTheDocument()
  })

  it('affiche seulement le travail validé, la durée réelle et les notes enregistrées', () => {
    const result = resultWith([])
    result.seance = {
      ...result.seance,
      startedAt: 1_000,
      completedAt: 4_501_000,
      notes: 'Bonne vitesse\nGrip à surveiller',
      lines: ['Soulevé de terre : 97,5×3 @8'],
      sets: [
        {
          id: 'warmup',
          exerciseId: 'c-deadlift',
          role: 'warmup',
          index: 0,
          status: 'validated',
          loadKind: 'barTotal',
          weight: 60,
          reps: 5,
          rpe: null,
          targetWeight: 60,
          targetReps: 5,
        },
        {
          id: 'top',
          exerciseId: 'c-deadlift',
          role: 'top',
          index: 0,
          status: 'validated',
          loadKind: 'barTotal',
          weight: 97.5,
          reps: 3,
          rpe: 8,
          targetWeight: 97.5,
          targetReps: 3,
        },
        {
          id: 'skipped',
          exerciseId: 'c-deadlift',
          role: 'backoff',
          index: 0,
          status: 'skipped',
          loadKind: 'barTotal',
          weight: 87.5,
          reps: 5,
          rpe: null,
          targetWeight: 87.5,
          targetReps: 5,
        },
      ],
    }

    render(
      <SessionSummary
        result={result}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    const work = screen.getByRole('heading', { name: 'Travail validé' }).closest('section')!
    expect(within(work).getByText('1 h 15 min')).toBeInTheDocument()
    expect(within(work).getByText('Séries validées').nextSibling).toHaveTextContent('1')
    expect(within(work).getByText('Paliers validés').nextSibling).toHaveTextContent('1')
    expect(within(work).getByText('Soulevé de terre : 97,5×3 @8')).toBeInTheDocument()
    expect(screen.getByText(/Bonne vitesse/)).toHaveTextContent('Bonne vitesse Grip à surveiller')
  })

  it('masque la durée inconnue et ne fabrique aucune métrique', () => {
    render(
      <SessionSummary
        result={resultWith([])}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    expect(screen.queryByText('Durée')).not.toBeInTheDocument()
    expect(screen.getByText('Aucune série de travail validée.')).toBeInTheDocument()
    expect(screen.getByText('Aucune note.')).toBeInTheDocument()
    expect(screen.queryByText(/tonnage/i)).not.toBeInTheDocument()
  })

  it('montre uniquement les records réellement battus par cette séance', () => {
    const result = resultWith([])
    result.seance = {
      ...result.seance,
      tops: { deadlift: { w: 97.5, reps: 3, rpe: 8 } },
    }
    const previous: Seance[] = [
      {
        id: 'previous',
        date: '2026-09-13',
        type: 'C',
        lines: [],
        tops: { deadlift: { w: 92.5, reps: 3, rpe: 8 } },
        notes: '',
      },
    ]

    render(
      <SessionSummary
        result={result}
        previousSeances={previous}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    const records = screen.getByRole('region', { name: 'Records de la séance' })
    expect(within(records).getByText('Nouveau record')).toBeInTheDocument()
    expect(within(records).getByText('Soulevé de terre')).toBeInTheDocument()
    expect(within(records).getByText('97,5 kg')).toBeInTheDocument()
    expect(within(records).getByText('113,8 kg')).toBeInTheDocument()
    expect(within(records).getByText('Charge · 20.09.2026')).toBeInTheDocument()
    expect(within(records).getByText('e1RM · 20.09.2026')).toBeInTheDocument()
  })

  it('affiche un premier e1RM calculable sans le célébrer comme un record battu', () => {
    const result = resultWith([])
    result.seance = {
      ...result.seance,
      tops: { deadlift: { w: 92.5, reps: 3, rpe: 8 } },
    }

    render(
      <SessionSummary
        result={result}
        previousSeances={[
          {
            id: 'previous',
            date: '2026-09-13',
            type: 'C',
            lines: [],
            tops: { deadlift: { w: 92.5, reps: 3, rpe: null } },
            notes: '',
          },
        ]}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    const records = screen.getByRole('region', { name: 'Records de la séance' })
    expect(within(records).getByText('Records actuels')).toBeInTheDocument()
    expect(within(records).getByText('e1RM · 20.09.2026')).toBeInTheDocument()
    expect(within(records).queryByText('Nouveau record')).not.toBeInTheDocument()
  })

  it('porte la vraie date d’un record antérieur que la séance n’a pas battu', () => {
    const result = resultWith([])
    result.seance = {
      ...result.seance,
      tops: { deadlift: { w: 90, reps: 3, rpe: 8 } },
    }

    render(
      <SessionSummary
        result={result}
        previousSeances={[
          {
            id: 'previous',
            date: '2026-09-06',
            type: 'C',
            lines: [],
            tops: { deadlift: { w: 97.5, reps: 3, rpe: 8 } },
            notes: '',
          },
        ]}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
      />,
    )

    const records = screen.getByRole('region', { name: 'Records de la séance' })
    expect(within(records).getByText('Charge · 06.09.2026')).toBeInTheDocument()
    expect(within(records).getByText('e1RM · 06.09.2026')).toBeInTheDocument()
    expect(within(records).queryByText('Nouveau record')).not.toBeInTheDocument()
  })

  it('relie les deux sorties explicites', () => {
    const onHome = vi.fn()
    const onHistory = vi.fn()
    render(
      <SessionSummary
        result={resultWith([])}
        next={{ type: 'A', scheduledDate: '2026-09-22', inDays: 2, isToday: false }}
        onHome={onHome}
        onHistory={onHistory}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retour à l’accueil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voir dans l’historique' }))
    expect(onHome).toHaveBeenCalledOnce()
    expect(onHistory).toHaveBeenCalledOnce()
  })
})
