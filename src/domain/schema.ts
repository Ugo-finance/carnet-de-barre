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

/**
 * Version du format produit par cette build. À incrémenter uniquement sur évolution additive.
 *
 * Passée à 2 en CB-55, pour le rôle de série `warmup`. L'évolution n'enlève rien : un
 * export v1 et le seed non versionné restent lus sans changement. Ce qui change est le
 * sens du refus dans l'autre sens — un fichier v2 porte des paliers qu'une build v1 ne
 * saurait pas exclure de la progression, et doit donc bien être refusé par elle.
 */
export const SCHEMA_VERSION = 2

/** Vraie date du calendrier, pas seulement la bonne forme : `2026-99-99` est refusé. */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ')
  .refine(isRealDate, "cette date n'existe pas au calendrier")

const weight = z.number().finite().nonnegative()
const nullableWeight = weight.nullable()

/**
 * Répétitions **réalisées**. Zéro est une valeur connue et légitime : la série a été
 * tentée et manquée. C'est `null` qui veut dire « non noté », et qui ne compte jamais
 * comme un échec.
 */
const nullableReps = z.number().int().nonnegative().nullable()

/** Répétitions **visées**. Une cible à zéro répétition n'a pas de sens. */
const nullableTargetReps = z.number().int().positive().nullable()

const nullableRpe = z.number().min(5).max(10).nullable()

const seanceType = z.enum(['A', 'B', 'C'])

export const targetSchema = z
  .object({
    w: weight,
    inc: z.number().positive(),
    reps: z.number().int().positive(),
    sets: z.number().int().positive().optional(),
    /** Échec en attente à cette charge exacte, `null` si aucun. */
    fail: nullableWeight,
    note: z.string().optional(),
  })
  .strict()

export const targetsSchema = z
  .object({
    updatedAt: isoDate,
    squat: targetSchema,
    bench: targetSchema,
    deadlift: targetSchema,
    tractions: targetSchema,
    benchVol: targetSchema,
  })
  .strict()

const topRecordSchema = z
  .object({
    w: nullableWeight,
    reps: nullableReps,
    rpe: nullableRpe,
  })
  .strict()

const topsSchema = z
  .object({
    squat: topRecordSchema.optional(),
    bench: topRecordSchema.optional(),
    deadlift: topRecordSchema.optional(),
    tractions: topRecordSchema.optional(),
    benchVol: topRecordSchema.optional(),
  })
  .strict()

const loadKind = z.enum(['barTotal', 'perDumbbell', 'added', 'bodyweight', 'machine'])

export const setLogSchema = z
  .object({
    id: z.string().min(1),
    exerciseId: z.string().min(1),
    role: z.enum(['top', 'backoff', 'volume', 'accessory', 'warmup']),
    index: z.number().int().nonnegative(),
    status: z.enum(['planned', 'entered', 'validated', 'skipped']),
    loadKind,
    weight: nullableWeight,
    reps: nullableReps,
    rpe: nullableRpe,
    targetWeight: nullableWeight,
    targetReps: nullableTargetReps,
  })
  .strict()

export const accessoryLogSchema = z
  .object({
    exerciseId: z.string().min(1),
    done: z.boolean(),
    note: z.string(),
  })
  .strict()

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
  .superRefine((file, ctx) => {
    // Les identifiants indexent les séances en base : deux séances homonymes se
    // masqueraient l'une l'autre à l'écriture, alors que l'aperçu en annoncerait deux.
    const vues = new Set<string>()
    file.seances.forEach((seance, index) => {
      if (vues.has(seance.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['seances', index, 'id'],
          message: `identifiant de séance en double : ${seance.id}`,
        })
      }
      vues.add(seance.id)

      const sets = seance.sets
      if (!sets) return
      const vuesSet = new Set<string>()
      sets.forEach((set, rang) => {
        if (vuesSet.has(set.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['seances', index, 'sets', rang, 'id'],
            message: `identifiant de série en double dans la séance : ${set.id}`,
          })
        }
        vuesSet.add(set.id)
      })
    })
  })

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

/**
 * Union **discriminée** sur `format` : vérifier le format donne le bon type de `data`.
 *
 * La version précédente déclarait `format: 'seed' | 'current'` et `data: SeedFile |
 * ExportFile` sans les lier. Un appelant pouvait donc tester le format et recevoir
 * quand même le type de l'autre — il lui fallait un `as` pour avancer, c'est-à-dire
 * exactement l'endroit où le compilateur cesse de vérifier quoi que ce soit.
 *
 * Le défaut est resté invisible tant que les fichiers de test échappaient au typage
 * (CB-04) : ce sont eux qui l'exerçaient.
 */
export type ImportResult =
  | { ok: true; format: 'seed'; data: SeedFile }
  | { ok: true; format: 'current'; data: ExportFile }
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
