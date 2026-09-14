import type { FinalizeResult } from '../../db/contracts'
import { resumeProgression, topsPasses } from '../../db/selectors'
import { batLeRecord, type Record as LiftRecord } from '../../domain/e1rm'
import { LIFTS } from '../../domain/program'
import type { LiftKey, LoadKind, Seance } from '../../domain/types'

export interface SessionRecord {
  lift: LiftKey
  label: string
  loadKind: LoadKind
  charge: LiftRecord | null
  e1rm: LiftRecord | null
}

/**
 * Les records établis par la séance qui vient d'être finalisée.
 *
 * La comparaison se fait contre l'historique antérieur. Inclure d'abord la séance
 * courante dans le record global puis comparer sa date ne suffirait pas : deux séances
 * le même jour peuvent exister, et un record égalé n'est pas un record battu.
 */
export function sessionRecords(
  result: FinalizeResult,
  previousSeances: readonly Seance[],
): SessionRecord[] {
  const previousTops = topsPasses(previousSeances)
  const currentTops = topsPasses([result.seance])
  const progression = resumeProgression({
    targets: result.targets,
    draft: undefined,
    seances: [result.seance, ...previousSeances],
  }).lignes

  return currentTops.flatMap((candidate) => {
    const beaten = batLeRecord(previousTops, candidate)
    if (!beaten.charge && !beaten.e1rm) return []

    const line = progression.find(({ lift }) => lift === candidate.lift)
    if (!line) return []

    return [
      {
        lift: candidate.lift,
        label: line.label,
        loadKind: LIFTS[candidate.lift].loadKind,
        charge: beaten.charge ? line.recordCharge : null,
        e1rm: beaten.e1rm ? line.recordE1RM : null,
      },
    ]
  })
}
