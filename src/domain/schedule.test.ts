import { describe, expect, it } from 'vitest'
import {
  addDays,
  currentSession,
  describeWhen,
  isScheduledSessionDone,
  previousScheduledDay,
  sessionTypeFor,
  todayInZurich,
  weekdayOf,
} from './schedule.ts'

/** Instant sans ambiguïté : toujours construit en UTC, jamais parsé en heure locale. */
const instant = (iso: string): Date => new Date(iso)

describe('date civile à Zurich', () => {
  it('donne la date du jour à Zurich', () => {
    // 12.09.2026 14 h UTC = 16 h à Zurich (CEST).
    expect(todayInZurich(instant('2026-09-12T14:00:00Z'))).toBe('2026-09-12')
  })

  it('bascule à minuit heure de Zurich, pas à minuit UTC', () => {
    // 22 h 30 UTC le 12 = 00 h 30 le 13 à Zurich : on est déjà le lendemain.
    expect(todayInZurich(instant('2026-09-12T22:30:00Z'))).toBe('2026-09-13')
    // 21 h 30 UTC le 12 = 23 h 30 le 12 à Zurich : encore la veille.
    expect(todayInZurich(instant('2026-09-12T21:30:00Z'))).toBe('2026-09-12')
  })

  it('tient le changement d’heure du 25.10.2026', () => {
    // Recul d'une heure à 03 h locale. 00 h 30 UTC = 02 h 30 CEST, toujours le 25.
    expect(todayInZurich(instant('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    // 23 h 30 UTC le 25 = 00 h 30 le 26 en CET (UTC+1).
    expect(todayInZurich(instant('2026-10-25T23:30:00Z'))).toBe('2026-10-26')
  })

  it('donne le même résultat quel que soit le fuseau de l’appareil', () => {
    // La fonction nomme explicitement Europe/Zurich : le fuseau du système ne compte pas.
    const moment = instant('2026-09-12T22:30:00Z')
    expect(todayInZurich(moment)).toBe('2026-09-13')
    expect(todayInZurich(new Date(moment.getTime()))).toBe('2026-09-13')
  })

  it('reste en heure d’hiver en janvier', () => {
    // 23 h 30 UTC le 14 = 00 h 30 le 15 à Zurich (CET, UTC+1).
    expect(todayInZurich(instant('2027-01-14T23:30:00Z'))).toBe('2027-01-15')
  })
})

describe('jour de la semaine et décalage', () => {
  it('lit le jour d’une date civile sans passer par un fuseau', () => {
    expect(weekdayOf('2026-09-13')).toBe(0) // dimanche
    expect(weekdayOf('2026-09-15')).toBe(2) // mardi
    expect(weekdayOf('2026-09-17')).toBe(4) // jeudi
  })

  it('décale une date en franchissant les mois et les années', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('ne saute pas de jour au changement d’heure', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('rotation dimanche C, mardi A, jeudi B', () => {
  it('attribue chaque jour de la semaine', () => {
    const semaine = [
      ['2026-09-13', 'C'], // dimanche
      ['2026-09-14', null], // lundi
      ['2026-09-15', 'A'], // mardi
      ['2026-09-16', null], // mercredi
      ['2026-09-17', 'B'], // jeudi
      ['2026-09-18', null], // vendredi
      ['2026-09-19', null], // samedi
    ] as const
    for (const [date, attendu] of semaine) {
      expect(sessionTypeFor(date), date).toBe(attendu)
    }
  })
})

describe('ce que propose l’écran d’accueil', () => {
  it('propose la séance du jour quand c’en est un', () => {
    // Dimanche 20.09.2026, la séance visée pour la première utilisation réelle.
    const session = currentSession(instant('2026-09-20T14:00:00Z'), false)
    expect(session).toMatchObject({
      type: 'C',
      scheduledDate: '2026-09-20',
      inDays: 0,
      isToday: true,
    })
  })

  it('garde la séance du jour tant qu’elle n’est pas terminée, même tard', () => {
    const session = currentSession(instant('2026-09-20T19:00:00Z'), false)
    expect(session.isToday).toBe(true)
  })

  it('passe à la suivante une fois la séance du jour enregistrée', () => {
    // Dimanche terminé → mardi, séance A, dans deux jours.
    const session = currentSession(instant('2026-09-20T18:00:00Z'), true)
    expect(session).toMatchObject({
      type: 'A',
      scheduledDate: '2026-09-22',
      inDays: 2,
      isToday: false,
    })
  })

  it('propose la prochaine séance un jour creux', () => {
    // Lundi 21.09 → mardi 22.09, séance A.
    const session = currentSession(instant('2026-09-21T10:00:00Z'), false)
    expect(session).toMatchObject({ type: 'A', scheduledDate: '2026-09-22', inDays: 1 })
  })

  it('enjambe le week-end depuis un vendredi', () => {
    // Vendredi 18.09 → dimanche 20.09, séance C.
    const session = currentSession(instant('2026-09-18T10:00:00Z'), false)
    expect(session).toMatchObject({ type: 'C', scheduledDate: '2026-09-20', inDays: 2 })
  })

  it('ne saute pas la séance prévue après une séance hors rotation', () => {
    // Dimanche : la rotation prévoit C. Un A lancé à la main ne doit pas faire
    // disparaître le C du jour, sinon le programme perd une séance.
    const dimanche = '2026-09-20'
    expect(isScheduledSessionDone(dimanche, [{ date: dimanche, type: 'A' }])).toBe(false)
    const session = currentSession(instant(`${dimanche}T14:00:00Z`), false)
    expect(session).toMatchObject({ type: 'C', isToday: true })
  })

  it('passe à la suivante quand c’est bien la séance prévue qui est faite', () => {
    const dimanche = '2026-09-20'
    expect(isScheduledSessionDone(dimanche, [{ date: dimanche, type: 'C' }])).toBe(true)
    expect(
      isScheduledSessionDone(dimanche, [
        { date: dimanche, type: 'A' },
        { date: dimanche, type: 'C' },
      ]),
    ).toBe(true)
    const session = currentSession(instant(`${dimanche}T18:00:00Z`), true)
    expect(session).toMatchObject({ type: 'A', scheduledDate: '2026-09-22' })
  })

  it('ne considère aucune séance comme prévue un jour creux', () => {
    expect(
      isScheduledSessionDone('2026-09-21', [
        { date: '2026-09-21', type: 'A' },
        { date: '2026-09-21', type: 'B' },
        { date: '2026-09-21', type: 'C' },
      ]),
    ).toBe(false)
  })

  it('trouve toujours une séance dans les sept jours', () => {
    for (let jour = 1; jour <= 30; jour += 1) {
      const date = `2026-09-${String(jour).padStart(2, '0')}`
      const session = currentSession(instant(`${date}T12:00:00Z`), true)
      expect(session.inDays).toBeGreaterThanOrEqual(1)
      expect(session.inDays).toBeLessThanOrEqual(7)
    }
  })

  it('sert le créneau du dimanche avec un C fait la veille au soir', () => {
    // Le cas réel du 12–13.09.2026 : Ugo s'est entraîné samedi soir au lieu du dimanche.
    // L'app lui reproposait C le lendemain — « c'est stupide », et il avait raison.
    const samedi = '2026-09-12'
    const dimanche = '2026-09-13'
    expect(isScheduledSessionDone(dimanche, [{ date: samedi, type: 'C' }])).toBe(true)

    const session = currentSession(instant(`${dimanche}T10:00:00Z`), true)
    expect(session).toMatchObject({ type: 'A', scheduledDate: '2026-09-15', isToday: false })
  })

  it('ne sert pas le créneau avec une séance d’un autre type faite en avance', () => {
    // Un A fait samedi ne dispense pas du C prévu dimanche : s'entraîner en avance sert
    // son créneau, ça ne décale jamais la rotation.
    expect(isScheduledSessionDone('2026-09-13', [{ date: '2026-09-12', type: 'A' }])).toBe(false)
  })

  it('ne remonte pas au-delà du créneau précédent', () => {
    // Le créneau du dimanche 13.09 s'ouvre après le jeudi 10.09. Un C fait le dimanche
    // d'avant appartient au créneau passé et ne sert pas celui-ci.
    expect(isScheduledSessionDone('2026-09-13', [{ date: '2026-09-06', type: 'C' }])).toBe(false)
    // Borne exclusive : le jour même du créneau précédent n'y entre pas non plus.
    expect(isScheduledSessionDone('2026-09-13', [{ date: '2026-09-10', type: 'C' }])).toBe(false)
    // Mais le lendemain de ce jour-là, oui.
    expect(isScheduledSessionDone('2026-09-13', [{ date: '2026-09-11', type: 'C' }])).toBe(true)
  })

  it('ne compte pas une séance postérieure au jour examiné', () => {
    expect(isScheduledSessionDone('2026-09-13', [{ date: '2026-09-14', type: 'C' }])).toBe(false)
  })

  it('donne le jour de rotation précédent', () => {
    expect(previousScheduledDay('2026-09-13')).toBe('2026-09-10')
    expect(previousScheduledDay('2026-09-15')).toBe('2026-09-13')
    expect(previousScheduledDay('2026-09-17')).toBe('2026-09-15')
    // Depuis un jour creux aussi : le lundi 14.09 renvoie au dimanche 13.09.
    expect(previousScheduledDay('2026-09-14')).toBe('2026-09-13')
  })

  it('utilise la date de Zurich, pas celle d’UTC, juste après minuit', () => {
    // 22 h 30 UTC samedi 19.09 = 00 h 30 dimanche 20.09 à Zurich : c'est jour de séance C.
    const session = currentSession(instant('2026-09-19T22:30:00Z'), false)
    expect(session).toMatchObject({ type: 'C', scheduledDate: '2026-09-20', isToday: true })
  })
})

describe('libellé de l’échéance', () => {
  it('dit aujourd’hui, demain, puis nomme le jour', () => {
    expect(describeWhen({ type: 'C', scheduledDate: '2026-09-20', inDays: 0, isToday: true })).toBe(
      "Aujourd'hui",
    )
    expect(
      describeWhen({ type: 'A', scheduledDate: '2026-09-22', inDays: 1, isToday: false }),
    ).toBe('Demain')
    expect(
      describeWhen({ type: 'B', scheduledDate: '2026-09-17', inDays: 3, isToday: false }),
    ).toBe('Jeudi')
  })
})
