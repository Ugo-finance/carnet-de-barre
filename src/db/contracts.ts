/**
 * Contrats de la couche de persistance — CB-10.
 *
 * Ce fichier ne contient **aucune implémentation** : il fige ce que l'écran de séance
 * (Codex) peut appeler, avant que Dexie n'arrive avec CB-30 et CB-31. Une implémentation
 * en mémoire suffit pour développer l'interface.
 *
 * Règles rappelées ici parce qu'elles font partie du contrat, pas du code :
 *
 * - le brouillon est écrit à chaque changement, pas seulement à la fin (D9) ;
 * - la finalisation est une transaction unique et idempotente ;
 * - corriger une séance passée ne touche jamais les cibles (D6) ;
 * - un import de remplacement est atomique, et refusé tant qu'un brouillon est ouvert.
 */

import type { Draft, ProgressionEvent, Seance, SeanceType, Targets } from '../domain/types.ts'
import type { ExportFile } from '../domain/schema.ts'

/** Échec attendu et nommé, par opposition à une exception de stockage. */
export type StoreErrorCode =
  /**
   * Ni brouillon ni séance sous cet identifiant : il n'y a rien à finaliser.
   * Une séance **déjà** finalisée n'est pas une erreur, c'est un `applied: false`.
   */
  | 'draft-not-found'
  /** Un brouillon est ouvert, l'import de remplacement est bloqué. */
  | 'draft-in-progress'
  /** Les cibles ont changé depuis l'ouverture du brouillon (ajustement manuel entre-temps). */
  | 'stale-targets'
  /** Écriture refusée par le navigateur : quota, mode privé, base fermée. */
  | 'storage-unavailable'

export class StoreError extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.name = 'StoreError'
    this.code = code
  }
}

/** Résultat d'une finalisation, de quoi alimenter le récapitulatif de fin de séance. */
export interface FinalizeResult {
  seance: Seance
  targets: Targets
  events: ProgressionEvent[]
  /** `false` si le brouillon avait déjà été finalisé : rien n'a été réécrit. */
  applied: boolean
}

/** Ce que remplace un import, annoncé avant confirmation. */
export interface ImportPreview {
  format: 'seed' | 'current'
  seanceCount: number
  /** Bornes de l'historique importé, `null` si aucune séance. */
  firstDate: string | null
  lastDate: string | null
  /** Ce qui sera écrasé. */
  replacing: { seanceCount: number; targetsUpdatedAt: string }
}

export interface CarnetStore {
  // ---- lecture ----

  getTargets(): Promise<Targets>
  listSeances(): Promise<Seance[]>
  getSeance(id: string): Promise<Seance | undefined>
  loadDraft(): Promise<Draft | undefined>

  // ---- séance en cours ----

  /**
   * Ouvre un brouillon pour ce type de séance, ou rend celui qui est déjà ouvert.
   * Les séries sont pré-remplies depuis les cibles courantes, en statut `planned`.
   */
  openDraft(type: SeanceType, date: string): Promise<Draft>

  /**
   * Écrit le brouillon. Appelé à chaque changement : saisie, validation, note,
   * démarrage du chrono. Doit rester peu coûteux.
   */
  saveDraft(draft: Draft): Promise<void>

  /** Abandonne la séance en cours sans rien enregistrer dans l'historique. */
  clearDraft(): Promise<void>

  /**
   * Transforme le brouillon en séance : dérive `lines` et `tops`, applique le moteur
   * aux cibles, écrit la séance, écrit les cibles, ferme le brouillon — le tout dans
   * une seule transaction.
   *
   * **Idempotent, et c'est le seul chemin.** L'identifiant de la séance est celui du
   * brouillon. Un second appel — double tap, reprise après erreur réseau, second
   * onglet — retrouve la séance déjà écrite et rend le même `FinalizeResult` avec
   * `applied: false`, sans progresser une deuxième fois. Il ne lève pas d'erreur :
   * l'appelant n'a donc qu'un seul cas à coder.
   *
   * `StoreError('draft-not-found')` n'est levé que si ni brouillon ni séance
   * n'existent sous cet identifiant.
   */
  finalizeSeance(draftId: string): Promise<FinalizeResult>

  // ---- historique ----

  /** Corrige une séance passée. Sans effet sur les cibles (D6). */
  updateSeance(id: string, patch: Partial<Omit<Seance, 'id'>>): Promise<Seance>

  /** Supprime une séance. Sans effet sur les cibles (D6). */
  deleteSeance(id: string): Promise<void>

  /**
   * Ajuste une cible à la main. Action explicite : le moteur repart de cette valeur.
   * Passer `fail: null` efface un échec en attente.
   */
  adjustTarget(
    lift: keyof Omit<Targets, 'updatedAt'>,
    patch: { w?: number; fail?: number | null },
  ): Promise<Targets>

  // ---- échange ----

  /** Produit le fichier d'export. Le brouillon en cours n'y figure jamais. */
  exportAll(): Promise<ExportFile>

  /** Valide un contenu importé et décrit ce qu'il remplacerait, sans rien écrire. */
  previewImport(input: unknown): Promise<ImportPreview>

  /**
   * Remplace intégralement séances et cibles. Atomique : en cas d'erreur, rien n'est
   * écrit et l'état précédent reste intact. Refusé si un brouillon est ouvert.
   */
  importReplace(input: unknown): Promise<{ seanceCount: number; targets: Targets }>
}
