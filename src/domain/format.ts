/**
 * Mise en forme des nombres et des dates — CB-11.
 *
 * L'interface est en français : virgule décimale partout, dates en `jj.mm.aaaa`.
 * Fonctions pures, aucune dépendance au DOM.
 */

import type { LoadKind } from './types.ts'

/**
 * Nombre en français, sans zéro décimal inutile : `62.5` → `62,5`, `70` → `70`.
 * Une valeur absente s'écrit `—`, jamais `0` ni `null`.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded).replace('.', ',')
}

/** Charge avec son unité : `62,5 kg`. */
export function formatKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${formatNumber(value)} kg`
}

/**
 * Charge présentée selon sa nature. Un lest s'écrit avec son signe (`+15 kg`),
 * un poids de corps ne s'écrit pas du tout : ce ne sont pas les mêmes grandeurs.
 */
export function formatLoad(value: number | null | undefined, loadKind: LoadKind): string {
  if (loadKind === 'bodyweight') return 'poids de corps'
  if (value == null || !Number.isFinite(value)) return '—'
  if (loadKind === 'added') return `+${formatNumber(value)} kg`
  if (loadKind === 'perDumbbell') return `${formatNumber(value)} kg/haltère`
  return `${formatNumber(value)} kg`
}

/** RPE : `8` ou `8,5`, jamais `8.5`. */
export function formatRpe(value: number | null | undefined): string {
  return value == null ? '?' : formatNumber(value)
}

/** Date de séance `2026-09-20` → `20.09.2026`. Aucun décalage de fuseau : c'est du texte. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  return `${match[3]}.${match[2]}.${match[1]}`
}

/** Durée du chrono : `2:30`, `0:45`. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
