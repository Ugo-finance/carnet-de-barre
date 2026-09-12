import { describe, expect, it } from 'vitest'
import { SeanceEditError, removeSet, reviseSet } from './edit.ts'
import { buildDraft, setId } from './draft.ts'
import { draftToSeance } from './derive.ts'
import type { Seance, Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

const TOP_SQUAT = setId('a-squat', 'top', 0)

/** Une séance A telle que l'app l'enregistre, avec son top set validé. */
function seanceEnregistree(weight = 95): Seance {
  const draft = buildDraft('A', '2026-09-15', CIBLES, { id: 'seance-a', now: 1 })
  return draftToSeance(
    {
      ...draft,
      sets: draft.sets.map((set) =>
        set.id === TOP_SQUAT ? { ...set, status: 'validated', weight, reps: 4, rpe: 8 } : set,
      ),
    },
    1000,
  )
}

describe('corriger une série', () => {
  it('re-dérive le résumé après correction de la charge', () => {
    // Le cas réel : 95 tapé au lieu de 92,5, aperçu en relisant. Sans ça, Ugo ne peut
    // que supprimer toute la séance pour corriger un chiffre.
    const seance = seanceEnregistree(95)
    expect(seance.lines).toContain('Squat : 95×4 @8')

    const patch = reviseSet(seance, TOP_SQUAT, { weight: 92.5 })

    expect(patch.lines).toContain('Squat : 92,5×4 @8')
    expect(patch.lines).not.toContain('Squat : 95×4 @8')
  })

  it('met les tops à jour, pas seulement le texte', () => {
    // `tops` est le contrat de relecture pour l'événement Outlook. Corriger la ligne
    // en laissant le top mentir donnerait deux vérités dans le même objet.
    const seance = seanceEnregistree(95)
    expect(seance.tops.squat?.w).toBe(95)

    const patch = reviseSet(seance, TOP_SQUAT, { weight: 92.5 })

    expect(patch.tops.squat?.w).toBe(92.5)
  })

  it('corrige aussi les répétitions et le RPE', () => {
    const patch = reviseSet(seanceEnregistree(), TOP_SQUAT, { reps: 3, rpe: 9 })
    expect(patch.tops.squat).toMatchObject({ reps: 3, rpe: 9 })
  })

  it('ne modifie jamais la séance reçue', () => {
    const seance = seanceEnregistree(95)
    reviseSet(seance, TOP_SQUAT, { weight: 92.5 })
    expect(seance.tops.squat?.w).toBe(95)
    expect(seance.sets?.find((set) => set.id === TOP_SQUAT)?.weight).toBe(95)
  })

  it('ne rend que les champs dérivés, pas la séance entière', () => {
    // L'appelant ne doit pas avoir l'occasion d'altérer un champ sans le vouloir.
    const patch = reviseSet(seanceEnregistree(), TOP_SQUAT, { weight: 92.5 })
    expect(Object.keys(patch).toSorted()).toEqual(['lines', 'sets', 'tops'])
  })

  it('refuse une séance du carnet papier, en disant pourquoi', () => {
    // Les douze séances de départ n'ont que des lignes écrites à la main. Fabriquer
    // des séries à partir du texte inventerait des données jamais saisies.
    const papier: Seance = {
      id: 'legacy',
      date: '2026-07-22',
      type: 'B',
      lines: ['Développé couché : 70×4 @8'],
      tops: {},
      notes: '',
      legacy: true,
    }

    expect(() => reviseSet(papier, 'peu-importe', { weight: 75 })).toThrow(/carnet papier/)
  })

  it('refuse une série qui n’appartient pas à la séance', () => {
    expect(() => reviseSet(seanceEnregistree(), 'inconnue', { weight: 80 })).toThrow(
      SeanceEditError,
    )
  })

  it('refuse les valeurs absurdes plutôt que de les écrire', () => {
    const seance = seanceEnregistree()
    expect(() => reviseSet(seance, TOP_SQUAT, { weight: 750 })).toThrow(/charge/)
    expect(() => reviseSet(seance, TOP_SQUAT, { weight: -5 })).toThrow(/charge/)
    expect(() => reviseSet(seance, TOP_SQUAT, { reps: 2.5 })).toThrow(/répétitions/)
    expect(() => reviseSet(seance, TOP_SQUAT, { rpe: 12 })).toThrow(/RPE/)
  })

  it('accepte une charge nulle et un RPE effacé', () => {
    // 0 kg de lest est une charge réelle ; un RPE non noté n'est pas une erreur.
    const patch = reviseSet(seanceEnregistree(), TOP_SQUAT, { weight: 0, rpe: null })
    expect(patch.sets?.find((set) => set.id === TOP_SQUAT)?.weight).toBe(0)
    expect(patch.tops.squat?.rpe).toBeNull()
  })
})

describe('retirer une série', () => {
  it('la retire du résumé et des tops', () => {
    // La série validée par erreur, jamais faite.
    const seance = seanceEnregistree(95)

    const patch = removeSet(seance, TOP_SQUAT)

    expect(patch.sets?.some((set) => set.id === TOP_SQUAT)).toBe(false)
    expect(patch.lines.join(' ')).not.toContain('Squat')
    expect(patch.tops.squat).toBeUndefined()
  })

  it('refuse une série absente', () => {
    expect(() => removeSet(seanceEnregistree(), 'inconnue')).toThrow(SeanceEditError)
  })
})
