/**
 * Rotation hebdomadaire — CB-12.
 *
 * Dimanche 16 h séance C, mardi 19 h séance A, jeudi 19 h séance B, **heure de Zurich**.
 *
 * Deux notions à ne pas confondre, et c'est tout l'objet de ce fichier :
 *
 * - la **date de séance**, une date civile `AAAA-MM-JJ`, qui est ce qu'on enregistre ;
 * - l'**instant technique**, un `Date`, qui sert uniquement à savoir quel jour il est
 *   à Zurich.
 *
 * Le jour de la semaine ne se lit jamais avec `getDay()` : à 00 h 30 à Zurich, un
 * téléphone resté à l'heure de Londres est encore la veille, et proposerait la
 * mauvaise séance.
 */

import { WEEKDAY_TO_TYPE } from './program.ts'
import type { SeanceType } from './types.ts'

export const ZURICH = 'Europe/Zurich'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Date civile du jour à Zurich, quel que soit le fuseau de l'appareil. */
export function todayInZurich(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZURICH,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Jour de la semaine d'une date civile, 0 pour dimanche.
 *
 * Calculé en UTC sur les composants de la date : une date civile n'a pas de fuseau,
 * et la traiter comme un instant local introduirait un décalage.
 */
export function weekdayOf(isoDate: string): number {
  const match = ISO_DATE.exec(isoDate)
  if (!match) return Number.NaN
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Décale une date civile d'un nombre de jours, sans jamais passer par un fuseau. */
export function addDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate)
  if (!match) return isoDate
  const [, year, month, day] = match
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Type de séance prévu ce jour-là, ou `null` si ce n'est pas un jour d'entraînement. */
export function sessionTypeFor(isoDate: string): SeanceType | null {
  return WEEKDAY_TO_TYPE[weekdayOf(isoDate)] ?? null
}

/**
 * `true` si la séance prévue par la rotation ce jour-là figure parmi les types déjà
 * enregistrés aujourd'hui. C'est ce que `currentSession` attend, et rien d'autre :
 * une séance hors rotation ne compte pas.
 */
export function isScheduledSessionDone(
  isoDate: string,
  typesLoggedToday: readonly SeanceType[],
): boolean {
  const prevu = sessionTypeFor(isoDate)
  return prevu != null && typesLoggedToday.includes(prevu)
}

export interface UpcomingSession {
  type: SeanceType
  /**
   * Date **prévue** de cette séance, `AAAA-MM-JJ`. Elle peut être dans le futur :
   * un jour de repos, ou après la séance du jour déjà enregistrée, c'est la date de
   * la prochaine séance du calendrier, pas celle d'aujourd'hui.
   *
   * Ne jamais s'en servir pour dater ce qu'Ugo est en train de faire — on ne
   * s'entraîne que le jour où l'on est. Pour ça, `todayInZurich()`. Le champ
   * s'appelait `date`, ce qui invitait exactement à cette confusion et a produit
   * un défaut réel : un brouillon ouvert au mardi un dimanche soir.
   */
  scheduledDate: string
  /** Nombre de jours d'ici là. `0` = aujourd'hui. */
  inDays: number
  isToday: boolean
}

/**
 * Ce que l'écran d'accueil doit proposer.
 *
 * Règle D7 : la séance **prévue ce jour-là** reste proposée tant qu'elle n'est pas
 * terminée ; une fois terminée, on montre la suivante.
 *
 * `scheduledSessionDone` ne vaut `true` que si c'est bien la séance **de la rotation**
 * qui a été enregistrée aujourd'hui. Une séance hors rotation — un A lancé à la main
 * un dimanche — ne doit pas faire disparaître le C prévu ce dimanche : ce sont deux
 * choses différentes, et confondre les deux ferait sauter une séance du programme.
 *
 * Le sélecteur A/B/C reste disponible en permanence : ceci est une proposition, pas
 * une contrainte.
 */
export function currentSession(
  now: Date = new Date(),
  scheduledSessionDone = false,
): UpcomingSession {
  const today = todayInZurich(now)
  const todayType = sessionTypeFor(today)

  if (todayType && !scheduledSessionDone) {
    return { type: todayType, scheduledDate: today, inDays: 0, isToday: true }
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(today, offset)
    const type = sessionTypeFor(date)
    if (type) return { type, scheduledDate: date, inDays: offset, isToday: false }
  }

  // Inatteignable : la rotation couvre trois jours sur sept.
  return { type: 'A', scheduledDate: addDays(today, 1), inDays: 1, isToday: false }
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** « Aujourd'hui », « Demain », « Jeudi » — de quoi titrer l'écran d'accueil. */
export function describeWhen(session: UpcomingSession): string {
  if (session.inDays === 0) return "Aujourd'hui"
  if (session.inDays === 1) return 'Demain'
  const jour = JOURS[weekdayOf(session.scheduledDate)]
  return jour.charAt(0).toUpperCase() + jour.slice(1)
}
