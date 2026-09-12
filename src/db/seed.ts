/**
 * Chargement de l'historique de départ — CB-30.
 *
 * Les douze séances réelles du 22.07 au 10.09.2026, plus les cinq cibles arrêtées au
 * 12.09. Conversion **pure**, sans base de données : elle se teste sans navigateur.
 *
 * Deux règles que ce fichier applique et qu'il ne faut pas relâcher :
 *
 * - les `lines` historiques ne sont **jamais** reconverties en séries. Ce sont des
 *   phrases écrites à la main, souvent partielles, parfois marquées ⚠️ ; en déduire
 *   des `SetLog` reviendrait à inventer des données ;
 * - rien n'est rejoué dans le moteur de progression. Les cibles fournies sont un
 *   état déjà arbitré, qui contient des décisions manuelles (tractions ramenées de
 *   +20 à +15 pour la prise large, développé volume maintenu à 60). Aucun moteur ne
 *   les reproduirait, et ce n'est pas son travail.
 */

import seedJson from '../domain/seed.json' with { type: 'json' }
import { seedFileSchema } from '../domain/schema.ts'
import type { Seance, Targets } from '../domain/types.ts'

export interface SeedData {
  seances: Seance[]
  targets: Targets
}

/**
 * Identifiant stable et reproductible d'une séance historique.
 *
 * Deux imports du même seed donnent les mêmes identifiants, ce qui rend la mise en
 * base idempotente sans avoir à comparer les contenus. Le rang est nécessaire parce
 * que deux séances pourraient partager une date.
 */
export function legacySeanceId(date: string, index: number): string {
  return `legacy-${date}-${index}`
}

/**
 * Lit le seed embarqué et le valide avant de le convertir.
 *
 * Lève si le fichier est invalide : c'est une ressource livrée avec l'app, pas une
 * entrée utilisateur. Une erreur ici signifie que la build est cassée, et il vaut
 * mieux le savoir au premier lancement que découvrir un historique tronqué.
 */
export function loadSeed(): SeedData {
  const parsed = seedFileSchema.parse(seedJson)

  const seances: Seance[] = parsed.seances.map((seance, index) => ({
    id: legacySeanceId(seance.date, index),
    date: seance.date,
    type: seance.type,
    lines: [...seance.lines],
    tops: { ...seance.tops },
    notes: seance.notes,
    ...(seance.approx === true ? { approx: true } : {}),
    legacy: true,
  }))

  return { seances, targets: structuredClone(parsed.targets) }
}
