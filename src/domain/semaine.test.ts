import { describe, expect, it } from 'vitest'
import { grouperParSemaine, lundiDeLaSemaine, parOrdreAntichronologique } from './semaine.ts'
import type { Seance } from './types.ts'

function seance(date: string, type: Seance['type'], extra: Partial<Seance> = {}): Seance {
  return { id: `${date}-${type}`, date, type, lines: [], tops: {}, notes: '', ...extra }
}

describe('lundiDeLaSemaine', () => {
  it('rend le lundi de la semaine en cours pour chaque jour de la semaine', () => {
    // Semaine du lundi 14.09.2026 au dimanche 20.09.2026.
    expect(lundiDeLaSemaine('2026-09-14')).toBe('2026-09-14')
    expect(lundiDeLaSemaine('2026-09-15')).toBe('2026-09-14')
    expect(lundiDeLaSemaine('2026-09-18')).toBe('2026-09-14')
    expect(lundiDeLaSemaine('2026-09-19')).toBe('2026-09-14')
  })

  it('rattache le dimanche à la semaine qui s’achève, pas à celle qui commence', () => {
    // Le cas qui casse une implémentation naïve : `getUTCDay` rend 0 le dimanche, et
    // reculer de 0 - 1 jour amènerait au lundi *suivant*. C'est le jour de la séance C.
    expect(lundiDeLaSemaine('2026-09-20')).toBe('2026-09-14')
  })

  it('sépare bien un dimanche du lundi qui le suit', () => {
    expect(lundiDeLaSemaine('2026-09-20')).toBe('2026-09-14')
    expect(lundiDeLaSemaine('2026-09-21')).toBe('2026-09-21')
  })

  it('traverse un changement d’année sans se tromper de semaine', () => {
    // Vendredi 01.01.2027 appartient à la semaine du lundi 28.12.2026.
    expect(lundiDeLaSemaine('2027-01-01')).toBe('2026-12-28')
  })

  it('rend la date telle quelle si elle est illisible, plutôt que d’inventer un lundi', () => {
    expect(lundiDeLaSemaine('pas-une-date')).toBe('pas-une-date')
  })
})

describe('grouperParSemaine', () => {
  it('groupe les séances d’une même semaine et ouvre par la plus récente', () => {
    const groupes = grouperParSemaine([
      seance('2026-09-15', 'A'),
      seance('2026-09-20', 'C'),
      seance('2026-09-17', 'B'),
    ])

    expect(groupes).toHaveLength(1)
    expect(groupes[0].lundi).toBe('2026-09-14')
    expect(groupes[0].dimanche).toBe('2026-09-20')
    expect(groupes[0].seances.map((s) => s.date)).toEqual([
      '2026-09-20',
      '2026-09-17',
      '2026-09-15',
    ])
  })

  it('sépare deux semaines que seul un jour d’écart distingue', () => {
    // Dimanche puis lundi : consécutifs dans le calendrier, mais dans deux semaines.
    const groupes = grouperParSemaine([seance('2026-09-20', 'C'), seance('2026-09-21', 'A')])

    expect(groupes.map((g) => g.lundi)).toEqual(['2026-09-21', '2026-09-14'])
    expect(groupes[0].seances.map((s) => s.date)).toEqual(['2026-09-21'])
    expect(groupes[1].seances.map((s) => s.date)).toEqual(['2026-09-20'])
  })

  it('rend les semaines de la plus récente à la plus ancienne', () => {
    const groupes = grouperParSemaine([
      seance('2026-09-01', 'A'),
      seance('2026-09-21', 'A'),
      seance('2026-09-15', 'A'),
    ])

    expect(groupes.map((g) => g.lundi)).toEqual(['2026-09-21', '2026-09-14', '2026-08-31'])
  })

  it('départage deux séances du même jour par leur instant de finalisation', () => {
    const groupes = grouperParSemaine([
      seance('2026-09-15', 'A', { id: 'matin', ts: 1000 }),
      seance('2026-09-15', 'B', { id: 'soir', ts: 2000 }),
    ])

    expect(groupes[0].seances.map((s) => s.id)).toEqual(['soir', 'matin'])
  })

  it('ne touche jamais à la date métier d’une séance', () => {
    // L'invariant du module : la semaine est dérivée, jamais écrite. Si le groupement
    // réécrivait la date sur le lundi, l'historique mentirait sur le jour de la séance
    // et une correction D6 partirait d'une valeur fausse.
    const entree = [seance('2026-09-20', 'C'), seance('2026-09-17', 'B')]
    const avant = entree.map((s) => ({ ...s }))

    const groupes = grouperParSemaine(entree)

    expect(entree).toEqual(avant)
    expect(groupes.flatMap((g) => g.seances).map((s) => s.date)).toEqual([
      '2026-09-20',
      '2026-09-17',
    ])
  })

  it('ne fabrique aucune semaine vide entre deux groupes éloignés', () => {
    // Six semaines séparent ces deux séances. L'historique dit ce qui a été fait ;
    // l'absence se lit déjà dans le saut de dates.
    const groupes = grouperParSemaine([seance('2026-09-15', 'A'), seance('2026-08-04', 'A')])

    expect(groupes).toHaveLength(2)
  })

  it('rend une liste vide sans séance', () => {
    expect(grouperParSemaine([])).toEqual([])
  })
})

describe('parOrdreAntichronologique', () => {
  it('ne modifie pas le tableau reçu', () => {
    const entree = [seance('2026-09-01', 'A'), seance('2026-09-20', 'C')]

    parOrdreAntichronologique(entree)

    expect(entree.map((s) => s.date)).toEqual(['2026-09-01', '2026-09-20'])
  })

  it('place une séance datée sans instant de finalisation après celle qui en a un', () => {
    const trie = parOrdreAntichronologique([
      seance('2026-09-15', 'A', { id: 'sans-ts' }),
      seance('2026-09-15', 'B', { id: 'avec-ts', ts: 5 }),
    ])

    expect(trie.map((s) => s.id)).toEqual(['avec-ts', 'sans-ts'])
  })
})
