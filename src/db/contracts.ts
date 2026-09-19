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

import type {
  Draft,
  ProgressionEvent,
  Seance,
  SeanceType,
  TargetAdjustment,
  Targets,
} from '../domain/types.ts'
import type { ExportFile } from '../domain/schema.ts'
import type { Preferences } from '../domain/preferences.ts'
import type { ActionSauvegarde, EtatSauvegarde, LectureDistante } from '../domain/sauvegarde.ts'
import type { CarnetComparable } from './exchange.ts'

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
  /**
   * La confirmation porte sur un aperçu qui ne décrit plus la réalité — CB-79a.
   *
   * Le carnet local a changé depuis la comparaison, ou le fichier candidat n'est plus
   * celui qui a été comparé. Appliquer remplacerait un état qu'Ugo n'a jamais vu.
   */
  | 'stale-preview'

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
/**
 * L'identité des deux états comparés, à repasser à `importReplace` — CB-79a.
 *
 * Elle porte sur le **contenu**, pas sur des compteurs : corriger une séance passée
 * (D6) ne change ni le nombre de séances, ni sa date, ni son `ts`, et un résumé
 * laisserait donc passer une confirmation qui l'écraserait sans rien dire.
 */
export interface IdentiteComparaison {
  /** Le carnet du téléphone, tel qu'il était au moment de l'aperçu. */
  local: string
  /** Le fichier proposé, tel qu'il a été validé et affiché. */
  candidat: string
}

export interface ImportPreview {
  format: 'seed' | 'current'
  seanceCount: number
  /** Bornes de l'historique importé, `null` si aucune séance. */
  firstDate: string | null
  lastDate: string | null
  /** Les cibles que l'import poserait, états d'échec compris. */
  targets: Targets
  /** Ce qui sera écrasé, du même détail que le candidat pour que la comparaison ait un sens. */
  replacing: {
    seanceCount: number
    targetsUpdatedAt: string
    /** Date de la séance locale la plus récente, `null` si l'historique est vide. */
    lastDate: string | null
    targets: Targets
  }
  identite: IdentiteComparaison
}

/**
 * Ce que `preparerEnvoi` rend : la décision du protocole, et le carnet figé quand il y a
 * quelque chose à envoyer — CB-79b.
 *
 * `carnet` n'est renseigné que pour `{ type: 'envoyer' }`. C'est **l'instantané de la
 * génération partie**, pas le carnet courant : un réessai porte la même identité
 * d'opération, donc il doit porter le même contenu.
 */
export interface EnvoiPrepare {
  action: ActionSauvegarde
  carnet: CarnetComparable | null
}

/**
 * Ce dont un écran de sauvegarde a besoin, et rien de plus — CB-79b.
 *
 * Étroit **délibérément** : l'écran n'a aucune raison de pouvoir écrire une séance, et
 * un port large l'y autoriserait. Il se feint aussi en quelques lignes, ce qu'un magasin
 * entier ne permet pas.
 *
 * Aucun réseau ici. `preparerEnvoi` dit *quoi* envoyer et fige *quoi* exactement ; le
 * transport qui s'en sert n'existe pas encore, et tant qu'il n'existe pas, **rien n'est
 * sauvegardé nulle part**. L'écran ne doit pas laisser croire le contraire.
 */
export interface SauvegardePort {
  etatSauvegarde(): Promise<EtatSauvegarde>
  preparerEnvoi(appareil: string, distant: LectureDistante): Promise<EnvoiPrepare>
  acquitterEnvoi(generation: number, revision: number): Promise<EtatSauvegarde>
  /** Le geste explicite d'Ugo devant un conflit. `revision` est celle qui lui a été montrée. */
  resoudreConflit(revision: number): Promise<EtatSauvegarde>
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
   * Démarre la séance : relit ou crée le brouillon canonique, lui pose `startedAt`, et
   * écrit le tout **dans une seule transaction** — CB-62.
   *
   * Il n'existe pas de version décomposée de ce geste, et c'est le point. Une séquence
   * `openDraft()` puis `saveDraft(startDraft(copie))` réécrit la copie que l'appelant
   * tenait en main : si une cible a été ajustée entre les deux, le brouillon stocké
   * avait été reconstruit sur les nouvelles cibles et la réécriture y remet les
   * anciennes `baseTargets`. La séance démarre alors condamnée — `finalizeSeance` la
   * refusera par `stale-targets`, en salle, après le travail.
   *
   * C'est le défaut déjà payé sur `adjustTarget`, déplacé au démarrage. Le contrôle
   * vit donc au point d'écriture. P1 de Codex sur #54.
   *
   * **Idempotente** : reprendre une séance déjà démarrée rend la même, `startedAt`
   * inchangé. Un second tap ne peut pas raccourcir une durée réelle.
   *
   * `rushed` porte le choix fait sur l'accueil, qui reste un choix d'interface jusqu'au
   * clic : type, date, mode et `startedAt` forment **une seule intention utilisateur**
   * (`docs/refonte/10-interaction.md` § 1). Le passer après coup par `saveDraft`
   * casserait l'atomicité que cette méthode existe pour tenir. Omis, on retombe sur la
   * préférence `modePresseParDefaut`. Une séance **déjà démarrée** garde le sien : le
   * choix de l'accueil ne rouvre pas une file qu'Ugo a repliée en salle.
   */
  startSession(
    type: SeanceType,
    date: string,
    options?: { now?: number; rushed?: boolean },
  ): Promise<Draft>

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
   *
   * **Journalisé** : la cible et sa trace sont écrites dans la même transaction, pour
   * qu'il n'existe jamais d'état où une cible a bougé sans que rien ne dise pourquoi.
   */
  adjustTarget(
    lift: keyof Omit<Targets, 'updatedAt'>,
    patch: { w?: number; fail?: number | null },
  ): Promise<Targets>

  /**
   * Le journal des ajustements manuels, du plus ancien au plus récent.
   *
   * Répond à « pourquoi cette cible est-elle là ? » des semaines après coup. Local :
   * il n'entre pas dans le format d'échange, et le moteur ne le lit jamais.
   */
  listTargetAdjustments(): Promise<TargetAdjustment[]>

  // ---- réglages locaux ----

  /**
   * Les quatre réglages d'Ugo, complétés par leurs défauts — CB-62.
   *
   * Ne lève jamais : une ligne absente, abîmée ou écrite par une version inconnue rend
   * les défauts plutôt qu'une erreur. Un réglage n'a pas assez de valeur pour empêcher
   * l'app de s'ouvrir.
   */
  getPreferences(): Promise<Preferences>

  /**
   * Écrit les réglages modifiés et rend l'état complet qui en résulte.
   *
   * Un correctif partiel, et jamais un remplacement : deux onglets qui règlent chacun
   * un interrupteur ne doivent pas s'effacer l'un l'autre. La version du format est
   * écrite avec, pour que la ligne dise ce qu'elle savait.
   */
  savePreferences(patch: Partial<Preferences>): Promise<Preferences>

  // ---- échange ----

  /** Produit le fichier d'export. Le brouillon en cours n'y figure jamais. */
  exportAll(): Promise<ExportFile>

  /** Valide un contenu importé et décrit ce qu'il remplacerait, sans rien écrire. */
  previewImport(input: unknown): Promise<ImportPreview>

  /**
   * Remplace intégralement séances et cibles. Atomique : en cas d'erreur, rien n'est
   * écrit et l'état précédent reste intact. Refusé si un brouillon est ouvert.
   *
   * **`identite` est obligatoire**, et vient de l'aperçu qui a été montré. Le contrôle a
   * lieu *dans* la transaction : entre l'aperçu et la confirmation, une autre fenêtre ou
   * l'app installée qui partage la base peut avoir écrit. Une signature où l'identité
   * serait facultative serait une garde qu'on peut oublier d'appeler, c'est-à-dire pas
   * une garde.
   *
   * Lève `stale-preview` si le carnet local ou le fichier candidat ont changé depuis.
   */
  importReplace(
    input: unknown,
    identite: IdentiteComparaison,
  ): Promise<{ seanceCount: number; targets: Targets }>
}
