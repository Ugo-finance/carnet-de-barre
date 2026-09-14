/**
 * Maximum estimé et records — CB-13.
 *
 * Les valeurs attendues viennent de l'historique réel d'Ugo, pas d'exemples inventés :
 * une formule se juge sur les charges qu'il a vraiment portées, et c'est là qu'on voit
 * qu'ignorer le RPE lui coûterait six kilos sur son soulevé.
 *
 * Le fichier commence par ce que le module **refuse** de calculer. C'est la moitié du
 * lot : trois cas où rendre un nombre serait pire que ne rien rendre.
 */

import { describe, expect, it } from 'vitest'
import { batLeRecord, e1rm, recordCharge, recordE1RM, type TopPasse } from './e1rm.ts'

function top(over: Partial<TopPasse> = {}): TopPasse {
  return {
    date: '2026-09-06',
    lift: 'deadlift',
    weight: 87.5,
    reps: 3,
    rpe: 8,
    loadKind: 'barTotal',
    ...over,
  }
}

describe('ce que le maximum estimé refuse de calculer', () => {
  it('ne rend rien sans RPE', () => {
    // Six des quatorze top sets à la barre de l'historique n'en portent pas. Retomber
    // sur Epley nu mélangerait deux échelles, et un « record » pourrait être battu par
    // un changement de formule plutôt que par un progrès.
    expect(e1rm(top({ rpe: null }))).toBeNull()
  })

  it('ne rend rien pour le développé volume, même noté avec un RPE', () => {
    // P1 de Codex sur #58. `Seance.tops.benchVol` porte la **plus légère** des trois
    // séries de volume, agrégée par `deriveSeance` et non mesurée. Le schéma d'export
    // accepte parfaitement un RPE dessus — seule son absence habituelle masquait le
    // chemin, et une absence de donnée ne fait pas respecter une règle.
    expect(e1rm(top({ lift: 'benchVol', weight: 60, reps: 8, rpe: 8 }))).toBeNull()
  })

  it('ne rend rien sur une charge qui n’est pas à la barre', () => {
    // « +20 kg » de lest n'est le maximum de rien tant que l'app ignore le poids de
    // corps d'Ugo, et elle l'ignore.
    expect(e1rm(top({ lift: 'tractions', loadKind: 'added', weight: 20 }))).toBeNull()
    expect(e1rm(top({ loadKind: 'bodyweight', weight: null }))).toBeNull()
    expect(e1rm(top({ loadKind: 'perDumbbell', weight: 24 }))).toBeNull()
  })

  it('ne rend rien sans répétitions connues', () => {
    // Le cas réel du 03.09 : tractions à 20 kg, rien de noté.
    expect(e1rm(top({ reps: null }))).toBeNull()
    expect(e1rm(top({ reps: 0 }))).toBeNull()
  })

  it('ne rend rien d’une charge absente ou nulle', () => {
    expect(e1rm(top({ weight: null }))).toBeNull()
    expect(e1rm(top({ weight: 0 }))).toBeNull()
  })
})

describe('le maximum estimé sur les séances réelles d’Ugo', () => {
  it('compte les répétitions en réserve du soulevé du 06.09', () => {
    // 87,5 × 3 @8 : deux répétitions en réserve, donc cinq effectives.
    // 87,5 × (1 + 5/30) = 102,08 → 102,1.
    expect(e1rm(top())).toBe(102.1)
  })

  it('mesure la force et non la prudence', () => {
    // Le même soulevé sans tenir compte du RPE donnerait 96,3. Six kilos d'écart, et
    // c'est l'argument entier du choix de formule : @8 n'est pas un effort maximal.
    const sansRir = 87.5 * (1 + 3 / 30)
    expect(Math.round(sansRir * 10) / 10).toBe(96.3)
    expect(e1rm(top())).toBeGreaterThan(96.3)
  })

  it('rend le même maximum pour deux efforts équivalents', () => {
    // 4 @8 et 5 @9 laissent tous deux six répétitions effectives : la formule doit
    // les égaler, sinon elle récompenserait la manière de noter.
    expect(e1rm(top({ weight: 80, reps: 4, rpe: 8 }))).toBe(
      e1rm(top({ weight: 80, reps: 5, rpe: 9 })),
    )
  })

  it('traite un RPE de 10 comme un effort sans réserve', () => {
    expect(e1rm(top({ weight: 90, reps: 1, rpe: 10 }))).toBe(93)
  })

  it('ne retranche pas de répétitions sur un RPE aberrant', () => {
    // Un import mal formé pourrait porter un RPE au-delà de 10. Le maximum estimé doit
    // alors valoir la charge plus les seules répétitions faites, jamais moins.
    expect(e1rm(top({ weight: 90, reps: 2, rpe: 12 }))).toBe(96)
  })
})

/** L'historique réel, réduit aux tops que le seed porte. */
const HISTORIQUE: TopPasse[] = [
  { date: '2026-07-26', lift: 'squat', weight: 75, reps: 4, rpe: 8, loadKind: 'barTotal' },
  { date: '2026-08-03', lift: 'squat', weight: 77.5, reps: 4, rpe: 9, loadKind: 'barTotal' },
  { date: '2026-09-01', lift: 'squat', weight: 80, reps: 4, rpe: 9, loadKind: 'barTotal' },
  { date: '2026-09-08', lift: 'squat', weight: 80, reps: 4, rpe: 9, loadKind: 'barTotal' },
  { date: '2026-08-30', lift: 'deadlift', weight: 80, reps: 3, rpe: null, loadKind: 'barTotal' },
  { date: '2026-09-06', lift: 'deadlift', weight: 87.5, reps: 3, rpe: 8, loadKind: 'barTotal' },
  { date: '2026-07-29', lift: 'tractions', weight: 15, reps: 4, rpe: 8, loadKind: 'added' },
  { date: '2026-09-10', lift: 'tractions', weight: 20, reps: 3, rpe: null, loadKind: 'added' },
]

/**
 * L'ordre dans lequel les magasins rendent vraiment l'historique : **du plus récent au
 * plus ancien** (`listSeances()`, Dexie comme mémoire).
 *
 * P1 de Codex : la première version de ces tests écrivait `HISTORIQUE` dans l'ordre
 * chronologique, qui est l'inverse. Elle masquait donc le défaut au lieu de le montrer.
 */
const ORDRE_DU_MAGASIN = [...HISTORIQUE].reverse()

describe('les records', () => {
  it.each([
    { nom: 'du plus ancien au plus récent', tops: HISTORIQUE },
    { nom: 'du plus récent au plus ancien, comme le magasin', tops: ORDRE_DU_MAGASIN },
  ])('garde la première date d’un record égalé, entrée $nom', ({ tops }) => {
    // Le squat à 80 × 4 @9 a été fait le 01.09 puis le 08.09. Un record égalé n'est pas
    // un record battu : réafficher la date du jour ferait croire à un progrès.
    //
    // Les deux ordres, parce que le résultat ne doit dépendre que des dates. C'est
    // exactement ce que la première version ne vérifiait pas.
    expect(recordE1RM(tops, 'squat')).toEqual({ valeur: 93.3, date: '2026-09-01' })
    expect(recordCharge(tops, 'squat')).toEqual({ valeur: 80, date: '2026-09-01' })
  })

  it('rend le même record quel que soit l’ordre d’entrée', () => {
    for (const lift of ['squat', 'deadlift', 'tractions'] as const) {
      expect(recordCharge(ORDRE_DU_MAGASIN, lift)).toEqual(recordCharge(HISTORIQUE, lift))
      expect(recordE1RM(ORDRE_DU_MAGASIN, lift)).toEqual(recordE1RM(HISTORIQUE, lift))
    }
  })

  it('ne retient pour l’e1RM que les séries qui en ont un', () => {
    // Le soulevé du 30.08 est plus **ancien** et sans RPE ; celui du 06.09 est plus
    // lourd et noté. Le record d'e1RM ne peut venir que du second.
    expect(recordE1RM(HISTORIQUE, 'deadlift')).toEqual({ valeur: 102.1, date: '2026-09-06' })
  })

  it('n’a aucun maximum estimé pour les tractions, mais un record de charge', () => {
    // Les deux mesures répondent à deux questions : « ai-je soulevé plus lourd ? » et
    // « suis-je plus fort ? ». La première marche partout, la seconde non.
    expect(recordE1RM(HISTORIQUE, 'tractions')).toBeNull()
    expect(recordCharge(HISTORIQUE, 'tractions')).toEqual({ valeur: 20, date: '2026-09-10' })
  })

  it('ne rend rien pour un lift sans historique', () => {
    expect(recordCharge(HISTORIQUE, 'benchVol')).toBeNull()
    expect(recordE1RM(HISTORIQUE, 'benchVol')).toBeNull()
  })
})

describe('battre un record', () => {
  it('se compare à l’historique antérieur, jamais à soi-même', () => {
    const candidat = top({ date: '2026-09-13', weight: 92.5, reps: 3, rpe: 8 })
    expect(batLeRecord(HISTORIQUE, candidat)).toEqual({ charge: true, e1rm: true })
  })

  it('n’annonce pas un record quand la charge est égalée', () => {
    const candidat = top({ lift: 'squat', date: '2026-09-13', weight: 80, reps: 4, rpe: 9 })
    expect(batLeRecord(HISTORIQUE, candidat)).toEqual({ charge: false, e1rm: false })
  })

  it('peut battre la charge sans battre le maximum estimé', () => {
    // Plus lourd mais moins bien : 90 × 1 @10 pèse plus que 87,5 × 3 @8 et estime moins.
    // C'est précisément pourquoi les deux records existent séparément.
    const candidat = top({ date: '2026-09-13', weight: 90, reps: 1, rpe: 10 })
    expect(batLeRecord(HISTORIQUE, candidat)).toEqual({ charge: true, e1rm: false })
  })

  it('n’annonce aucun record d’e1RM au premier RPE noté', () => {
    // Rien à battre n'est pas un exploit. Le soulevé du 30.08 n'a pas de RPE : s'il
    // était le seul de l'historique, le premier suivant ne serait pas un record.
    const sansRepere: TopPasse[] = [
      {
        date: '2026-08-30',
        lift: 'deadlift',
        weight: 80,
        reps: 3,
        rpe: null,
        loadKind: 'barTotal',
      },
    ]
    expect(batLeRecord(sansRepere, top())).toEqual({ charge: true, e1rm: false })
  })
})
