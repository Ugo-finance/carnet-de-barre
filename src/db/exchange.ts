/**
 * Export et import — CB-40, moitié données.
 *
 * C'est le seul chemin par lequel l'historique d'Ugo sort du téléphone. Il sert à deux
 * choses qui ont des exigences différentes :
 *
 * - **transmettre les séances à Claude**, qui relit les `lines`, les `tops` et les
 *   cibles pour remplir l'événement Outlook de la séance suivante. D'où le maintien
 *   scrupuleux du format historique à l'intérieur du format versionné ;
 * - **servir de sauvegarde**. Une base IndexedDB n'est pas une sauvegarde : un
 *   navigateur qui purge son stockage, un téléphone perdu, et tout disparaît. Un
 *   export réimportable est la seule garantie de récupération.
 *
 * Deux principes gouvernent l'import :
 *
 * - on **valide tout avant d'écrire quoi que ce soit**. Un fichier à moitié accepté
 *   est pire qu'un fichier refusé ;
 * - on **remplace, on ne fusionne pas**. Fusionner demanderait de trancher des
 *   conflits sans rien savoir de ce qu'Ugo voulait, alors qu'un remplacement annoncé
 *   est prévisible.
 */

import { SCHEMA_VERSION, parseImport, type ExportFile } from '../domain/schema.ts'
import { empreinte } from '../domain/empreinte.ts'
import type { Seance, Targets } from '../domain/types.ts'
import { StoreError, type ImportPreview } from './contracts.ts'
import { legacySeanceId } from './seed.ts'
import { todayInZurich } from '../domain/schedule.ts'

export interface ExchangeSource {
  getTargets(): Promise<Targets>
  listSeances(): Promise<Seance[]>
}

/**
 * Construit le fichier d'export.
 *
 * Les séances sortent de la plus ancienne à la plus récente, à l'inverse de
 * l'affichage : un historique se relit dans le sens du temps, et c'est l'ordre du
 * seed que Claude connaît déjà.
 *
 * Le brouillon en cours n'y figure jamais : exporter une séance non terminée ferait
 * entrer des valeurs seulement pré-remplies dans ce qui sert de sauvegarde.
 */
export async function buildExport(source: ExchangeSource, now = new Date()): Promise<ExportFile> {
  const [targets, seances] = await Promise.all([source.getTargets(), source.listSeances()])
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    targets,
    seances: seances.toSorted((a, b) => a.date.localeCompare(b.date)),
  }
}

/** Nom de fichier proposé au téléchargement : daté, donc triable et non écrasable. */
export function exportFilename(now = new Date()): string {
  // Date civile de Zurich, pas UTC. Entre minuit et 2 h du matin l'été, `toISOString()`
  // rend encore la veille : le fichier d'une séance du samedi soir tard porterait la
  // date du vendredi, et Ugo classerait ses exports de travers sans jamais le voir.
  return `carnet-de-barre-${todayInZurich(now)}.json`
}

/** JSON indenté : il finit souvent collé dans une conversation, autant qu'il soit lisible. */
export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Contenu validé, prêt à être écrit.
 *
 * Les séances du format historique n'ont pas d'identifiant : on leur en fabrique un
 * de la même façon qu'à l'amorçage, pour qu'importer le seed d'origine donne
 * exactement le même état qu'un premier lancement.
 */
export interface ValidatedImport {
  format: 'seed' | 'current'
  targets: Targets
  seances: Seance[]
}

/**
 * Valide sans rien écrire.
 *
 * Lève une `StoreError` porteuse du motif, pour que l'interface puisse dire *pourquoi*
 * un fichier est refusé : ce n'est pas la même chose de coller du texte qui n'est pas
 * du JSON, et d'importer un fichier produit par une version future de l'app.
 */
export function validateImport(input: unknown): ValidatedImport {
  const result = parseImport(input)

  if (!result.ok) {
    const detail = result.issues.length > 0 ? ` (${result.issues.slice(0, 3).join(' ; ')})` : ''
    throw new StoreError('storage-unavailable', `${result.message}${detail}`)
  }

  if (result.format === 'seed') {
    const seances: Seance[] = result.data.seances.map((seance, index) => ({
      id: legacySeanceId(seance.date, index),
      date: seance.date,
      type: seance.type,
      lines: [...seance.lines],
      tops: { ...seance.tops },
      notes: seance.notes,
      ...(seance.approx === true ? { approx: true } : {}),
      legacy: true,
    }))
    return { format: 'seed', targets: structuredClone(result.data.targets), seances }
  }

  const file = result.data as ExportFile
  return {
    format: 'current',
    targets: structuredClone(file.targets),
    seances: structuredClone(file.seances) as Seance[],
  }
}

/**
 * Un carnet réduit à ce qu'un remplacement détruit.
 *
 * Les deux côtés de la comparaison passent par la **même** forme, et c'est voulu : deux
 * empreintes calculées sur des formes différentes ne seraient jamais comparables, et le
 * défaut ne se verrait qu'au premier refus inexplicable.
 */
export interface CarnetComparable {
  targets: Targets
  seances: Seance[]
}

/**
 * L'empreinte de contenu d'un carnet, locale ou candidate.
 *
 * Les séances sont **triées par identifiant** avant d'être empreintées. Un historique est
 * un ensemble, pas une liste ordonnée : deux lectures de la même base peuvent le rendre
 * dans un ordre différent, et prendre ce réordonnancement pour une modification
 * produirait un refus de confirmation que rien ne justifie. Le contenu, lui, est
 * intégralement couvert.
 */
export function empreinteCarnet(carnet: CarnetComparable): string {
  const seances = carnet.seances.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return empreinte({ targets: carnet.targets, seances })
}

/** La date de la séance la plus récente, `null` si l'historique est vide. */
function derniereDate(seances: Seance[]): string | null {
  const dates = seances.map((seance) => seance.date).toSorted()
  return dates[dates.length - 1] ?? null
}

/** Ce qu'un import remplacerait, à montrer avant de demander confirmation. */
export function describeImport(
  candidate: ValidatedImport,
  current: CarnetComparable,
): ImportPreview {
  const dates = candidate.seances.map((seance) => seance.date).toSorted()
  return {
    format: candidate.format,
    seanceCount: candidate.seances.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    targets: structuredClone(candidate.targets),
    replacing: {
      seanceCount: current.seances.length,
      targetsUpdatedAt: current.targets.updatedAt,
      lastDate: derniereDate(current.seances),
      targets: structuredClone(current.targets),
    },
    identite: {
      local: empreinteCarnet(current),
      candidat: empreinteCarnet(candidate),
    },
  }
}
