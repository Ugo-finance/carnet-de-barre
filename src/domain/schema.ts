/**
 * Schémas de validation du format d'échange — CB-10.
 *
 * Deux formats sont acceptés en lecture :
 *
 * - le **format historique**, celui de `data/seed.json` : pas de `schemaVersion`,
 *   des séances qui n'ont que `lines` et `tops` ;
 * - le **format courant**, versionné, qui ajoute `schemaVersion`, un identifiant
 *   par séance et les séries détaillées, sans rien retirer du précédent.
 *
 * Un seul format est produit en écriture : le format courant. Une version future
 * inconnue est refusée **avant toute écriture** (REVUE-CODEX § 4).
 */

import { z } from 'zod'
import type { LiftKey } from './types.ts'

/** Version du format produit par cette build. À incrémenter uniquement sur évolution additive. */
export const SCHEMA_VERSION = 1

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ')

const weight = z.number().finite().nonnegative()
const nullableWeight = weight.nullable()
const nullableReps = z.number().int().positive().nullable()
const nullableRpe = z.number().min(5).max(10).nullable()

const seanceType = z.enum(['A', 'B', 'C'])

export const targetSchema = z.object({
  w: weight,
  inc: z.number().positive(),
  reps: z.number().int().positive(),
  sets: z.number().int().positive().optional(),
  /** Échec en attente à cette charge exacte, `null` si aucun. */
  fail: nullableWeight,
  note: z.string().optional(),
})

export const targetsSchema = z.object({
  updatedAt: isoDate,
  squat: targetSchema,
  bench: targetSchema,
  deadlift: targetSchema,
  tractions: targetSchema,
  benchVol: targetSchema,
})

const topRecordSchema = z.object({
  w: nullableWeight,
  reps: nullableReps,
  rpe: nullableRpe,
})

const topsSchema = z.object({
  squat: topRecordSchema.optional(),
  bench: topRecordSchema.optional(),
  deadlift: topRecordSchema.optional(),
  tractions: topRecordSchema.optional(),
  benchVol: topRecordSchema.optional(),
})

const loadKind = z.enum(['barTotal', 'perDumbbell', 'added', 'bodyweight', 'machine'])

export const setLogSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  role: z.enum(['top', 'backoff', 'volume', 'accessory']),
  index: z.number().int().nonnegative(),
  status: z.enum(['planned', 'entered', 'validated', 'skipped']),
  loadKind,
  weight: nullableWeight,
  reps: nullableReps,
  rpe: nullableRpe,
  targetWeight: nullableWeight,
  targetReps: nullableReps,
})

export const accessoryLogSchema = z.object({
  exerciseId: z.string().min(1),
  done: z.boolean(),
  note: z.string(),
})

/** Champs communs aux deux formats : ce que le seed contient déjà. */
const seanceCommon = {
  date: isoDate,
  type: seanceType,
  lines: z.array(z.string()),
  tops: topsSchema,
  notes: z.string(),
  approx: z.boolean().optional(),
}

/** Séance telle qu'elle apparaît dans `data/seed.json`. */
export const legacySeanceSchema = z.object(seanceCommon).strict()

/** Séance telle que l'app l'exporte. Les champs historiques restent obligatoires. */
export const seanceSchema = z
  .object({
    ...seanceCommon,
    id: z.string().min(1),
    legacy: z.boolean().optional(),
    sets: z.array(setLogSchema).optional(),
    accessories: z.array(accessoryLogSchema).optional(),
    ts: z.number().int().positive().optional(),
  })
  .strict()

/** Fichier au format historique (le seed). */
export const seedFileSchema = z
  .object({
    targets: targetsSchema,
    seances: z.array(legacySeanceSchema),
  })
  .strict()

/** Fichier au format courant, celui que l'app produit. */
export const exportFileSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    exportedAt: z.string().optional(),
    targets: targetsSchema,
    seances: z.array(seanceSchema),
  })
  .strict()

export type TargetsInput = z.infer<typeof targetsSchema>
export type LegacySeanceInput = z.infer<typeof legacySeanceSchema>
export type SeanceInput = z.infer<typeof seanceSchema>
export type ExportFile = z.infer<typeof exportFileSchema>
export type SeedFile = z.infer<typeof seedFileSchema>

/** Les cinq clés de lift, dans l'ordre d'affichage. */
export const LIFT_ORDER: readonly LiftKey[] = [
  'squat',
  'bench',
  'deadlift',
  'tractions',
  'benchVol',
]

export type ImportFailureReason =
  /** Le texte fourni n'est pas du JSON. */
  | 'invalid-json'
  /** `schemaVersion` dépasse ce que cette build sait lire. */
  | 'unsupported-version'
  /** JSON valide mais structure incorrecte. */
  | 'invalid-shape'

export type ImportResult =
  | { ok: true; format: 'seed' | 'current'; data: SeedFile | ExportFile }
  | { ok: false; reason: ImportFailureReason; message: string; issues: string[] }

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path} : ${issue.message}` : issue.message
  })
}

/**
 * Valide un contenu importé sans rien écrire.
 *
 * La version est examinée **avant** la structure : un fichier produit par une version
 * future de l'app est refusé même si sa forme ressemble à ce qu'on sait lire, plutôt
 * que d'être partiellement accepté.
 */
export function parseImport(input: unknown): ImportResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      reason: 'invalid-shape',
      message: "Le contenu n'est pas un objet JSON.",
      issues: [],
    }
  }

  const version = (input as { schemaVersion?: unknown }).schemaVersion

  if (version === undefined) {
    const parsed = seedFileSchema.safeParse(input)
    if (parsed.success) return { ok: true, format: 'seed', data: parsed.data }
    return {
      ok: false,
      reason: 'invalid-shape',
      message: "Le fichier ne correspond ni au format courant ni au format d'origine.",
      issues: formatIssues(parsed.error),
    }
  }

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      reason: 'invalid-shape',
      message: '`schemaVersion` doit être un entier positif.',
      issues: [],
    }
  }

  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unsupported-version',
      message: `Fichier en version ${version}, cette version de l'app lit jusqu'à ${SCHEMA_VERSION}. Mets l'app à jour avant d'importer.`,
      issues: [],
    }
  }

  const parsed = exportFileSchema.safeParse(input)
  if (parsed.success) return { ok: true, format: 'current', data: parsed.data }
  return {
    ok: false,
    reason: 'invalid-shape',
    message: 'Le fichier annonce le format courant mais sa structure est incorrecte.',
    issues: formatIssues(parsed.error),
  }
}

/** Variante qui part d'un texte, pour le collage direct dans l'écran d'import. */
export function parseImportText(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      message: "Ce n'est pas du JSON valide.",
      issues: [],
    }
  }
  return parseImport(raw)
}
