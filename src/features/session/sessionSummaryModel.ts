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
  chargeBeaten: boolean
  e1rmBeaten: boolean
}

/**
 * Les records des lifts travaillés dans la séance qui vient d'être finalisée.
 *
 * Leur valeur et leur date viennent du record global, tandis que le badge de nouveauté
 * se compare à l'historique antérieur. Comparer seulement les dates ne suffirait pas :
 * deux séances le même jour peuvent exister, et un record égalé n'est pas battu.
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
    const line = progression.find(({ lift }) => lift === candidate.lift)
    if (!line || (!line.recordCharge && !line.recordE1RM)) return []

    return [
      {
        lift: candidate.lift,
        label: line.label,
        loadKind: LIFTS[candidate.lift].loadKind,
        charge: line.recordCharge,
        e1rm: line.recordE1RM,
        chargeBeaten: beaten.charge,
        e1rmBeaten: beaten.e1rm,
      },
    ]
  })
}
