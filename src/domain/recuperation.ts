import type { Draft } from './types'

/**
 * La durée totale de la récupération en cours, en secondes — CB-77.
 *
 * **Dérivée, jamais stockée.** C'est ce que la barre de progression du mode récup prend
 * pour maximum ; le temps restant en est la part qu'il reste à écouler.
 *
 * Elle se calcule à partir du **début** de la récupération et non d'une durée enregistrée,
 * et ce choix tient aux ±30 s : `shiftedDeadline` écrête — un −30 s sur 20 s restantes
 * n'en retire que 20, un +30 s sur un chrono expiré repart de maintenant. Une durée
 * mise à jour de ±30 s nominaux divergerait donc du temps réellement ajouté, et la barre
 * sauterait en arrière ou dépasserait son maximum. Dérivée de l'échéance, elle suit
 * l'écrêtage sans que personne ait à y penser.
 *
 * Rend `undefined` quand la durée n'est pas connaissable — aucun chrono, ou brouillon
 * écrit avant que le début ne soit persisté. L'appelant retombe alors sur son
 * approximation, ce qui laisse une vieille séance reprenable.
 */
export function dureeRecuperation(draft: Draft): number | undefined {
  const { timerEndsAt, timerStartedAt } = draft
  if (timerEndsAt === null || timerStartedAt === null) return undefined
  // Au moins une seconde : une barre de maximum nul n'a pas de sens, et `RecoveryScreen`
  // diviserait par zéro.
  return Math.max(1, Math.ceil((timerEndsAt - timerStartedAt) / 1000))
}
