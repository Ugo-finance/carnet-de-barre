/**
 * Accès à l'historique et au brouillon — CB-30.
 *
 * Deux implémentations du même contrat vivent côte à côte :
 *
 * - `DexieStore`, celle de l'app, adossée à IndexedDB ;
 * - `MemoryStore` (voir `memory.ts`), qui sert à développer l'écran de séance sans
 *   navigateur et à faire tourner la suite de tests de contrat.
 *
 * Le partage d'une suite de tests entre les deux est ce qui donne confiance : la
 * version en mémoire est vérifiée en CI, l'adaptateur Dexie l'est par le parcours
 * bout en bout de CB-42, dans un vrai navigateur. Aucune dépendance de test
 * supplémentaire n'a donc été nécessaire.
 */

import type {
  Draft,
  LiftKey,
  ProgressionEvent,
  Seance,
  SeanceType,
  TargetAdjustment,
  Targets,
} from '../domain/types.ts'
import type { ExportFile } from '../domain/schema.ts'
import type {
  CarnetStore,
  EnvoiPrepare,
  SauvegardePort,
  FinalizeResult,
  IdentiteComparaison,
  ImportPreview,
} from './contracts.ts'
import { StoreError } from './contracts.ts'
import {
  SEEDED_KEY,
  TARGETS_KEY,
  type CarnetDatabase,
  db as defaultDb,
  ensureSeeded,
} from './database.ts'
import {
  buildDraft,
  hydrateDraft,
  isDraftActive,
  reprendreAvecMode,
  reutilisable,
  startDraft,
} from './draft.ts'
import {
  PREFERENCES_PAR_DEFAUT,
  readPreferences,
  writePreferences,
  type Preferences,
} from '../domain/preferences.ts'
import { applyProgression, draftToSeance, targetsDiverged } from './derive.ts'
import { applyTargetPatch, type TargetPatch } from './targets.ts'
import { seanceSchema } from '../domain/schema.ts'
import { buildExport, describeImport, empreinteCarnet, validateImport } from './exchange.ts'
import {
  lireSauvegarde,
  noterMutation,
  SAUVEGARDE_KEY,
  type InstantaneEnVol,
  type LigneSauvegarde,
} from './sauvegarde.ts'
import {
  acquitter,
  envoyer,
  garderLeMien,
  prochaineAction,
  type EtatSauvegarde,
  type LectureDistante,
} from '../domain/sauvegarde.ts'
import { todayInZurich } from '../domain/schedule.ts'

/**
 * Clé du journal des événements de progression d'une séance.
 *
 * Il vit dans `meta`, donc en local : il n'entre pas dans l'export, et n'oblige donc
 * pas à faire évoluer le format d'échange pour un besoin purement d'affichage.
 */
const eventsKey = (seanceId: string): string => `events:${seanceId}`

/**
 * Clé du journal des ajustements manuels de cibles (UGO-172).
 *
 * Une seule entrée `meta` porte toute la liste : un ajustement manuel est rare, et
 * les relire tous d'un coup est précisément l'usage qu'on en fera — comprendre après
 * coup pourquoi une cible est là où elle est.
 */
const ADJUSTMENTS_KEY = 'target-adjustments'

/**
 * Les réglages vivent dans `meta`, comme le journal d'ajustements.
 *
 * Pas dans une table à eux : ils forment une seule ligne, et une table entière pour un
 * enregistrement unique ajouterait une version Dexie à rejouer sur le téléphone d'Ugo
 * sans rien apporter. `meta` survit par ailleurs à un effacement volontaire de
 * l'historique, ce qui est le bon comportement — effacer ses séances n'est pas
 * réinitialiser ses réglages.
 */
const PREFERENCES_KEY = 'preferences'

/**
 * La part du contrat implémentée à ce stade : lecture de l'historique et cycle de vie
 * complet d'une séance, de l'ouverture du brouillon à sa finalisation. L'édition de
 * l'historique et l'échange JSON arrivent avec CB-33 et CB-40.
 */
export type DraftStore = Pick<
  CarnetStore,
  | 'getTargets'
  | 'listSeances'
  | 'getSeance'
  | 'loadDraft'
  | 'openDraft'
  | 'startSession'
  | 'saveDraft'
  | 'clearDraft'
  | 'finalizeSeance'
  | 'adjustTarget'
  | 'getPreferences'
  | 'savePreferences'
  | 'exportAll'
  | 'previewImport'
  | 'importReplace'
>

export class DexieStore implements DraftStore, SauvegardePort {
  private readonly database: CarnetDatabase

  constructor(database: CarnetDatabase = defaultDb) {
    this.database = database
  }

  /** À appeler une fois au démarrage, avant toute lecture. */
  async ready(): Promise<void> {
    await ensureSeeded(this.database)
  }

  async getTargets(): Promise<Targets> {
    const row = await this.database.targets.get(TARGETS_KEY)
    if (!row) {
      throw new StoreError('storage-unavailable', "Les cibles n'ont pas été initialisées.")
    }
    const { key: _key, ...targets } = row
    return targets
  }

  /** Les séances les plus récentes d'abord : c'est l'ordre de lecture de l'historique. */
  async listSeances(): Promise<Seance[]> {
    const seances = await this.database.seances.orderBy('date').toArray()
    return seances.toReversed()
  }

  async getSeance(id: string): Promise<Seance | undefined> {
    return this.database.seances.get(id)
  }

  /**
   * Le brouillon en cours, s'il y en a un.
   *
   * Un seul à la fois : deux séances ouvertes en parallèle n'ont pas de sens, et
   * permettre l'ambiguïté compliquerait la finalisation pour rien. Si plusieurs
   * lignes traînent, la plus récente gagne.
   */
  async loadDraft(): Promise<Draft | undefined> {
    const drafts = await this.database.drafts.toArray()
    if (drafts.length === 0) return undefined
    const recent = drafts.reduce((latest, draft) =>
      draft.updatedAt > latest.updatedAt ? draft : latest,
    )
    // Une ligne écrite avant l'ajout d'un champ n'en a pas : on la complète ici, au
    // seul point où les brouillons entrent dans l'app.
    return hydrateDraft(recent)
  }

  /**
   * Le démarrage, en une transaction — CB-62.
   *
   * Tout se joue **dedans** : la relecture du brouillon stocké, sa construction s'il
   * n'existe pas, la pose de `startedAt` et l'écriture. Aucun objet venu de l'appelant
   * n'entre ici, et c'est la raison d'être de la méthode — une copie tenue par l'écran
   * d'accueil peut avoir été rendue périmée par un ajustement de cible, et la réécrire
   * ressusciterait ses anciennes `baseTargets`.
   *
   * `seances` et `targets` sont lues dans la même transaction plutôt que par
   * `listSeances()` / `getTargets()`, qui en ouvriraient une seconde et rouvriraient la
   * fenêtre qu'on ferme.
   */
  async startSession(
    type: SeanceType,
    date: string,
    options: { now?: number; rushed?: boolean } = {},
  ): Promise<Draft> {
    const now = options.now ?? Date.now()
    return this.database.transaction(
      'rw',
      this.database.drafts,
      this.database.targets,
      this.database.seances,
      // `meta` porte les réglages, lus par la construction. Une table hors portée fait
      // lever Dexie au premier démarrage sans brouillon — donc en salle, pas en test.
      this.database.meta,
      async () => {
        const stocke = await this.database.drafts.toCollection().first()
        const existant = stocke ? hydrateDraft(stocke) : undefined
        const draft =
          existant && reutilisable(existant, type, date)
            ? reprendreAvecMode(existant, options.rushed)
            : await this.construireDansTransaction(type, date, options.rushed)

        // Idempotent : une séance déjà démarrée garde son instant. Reprendre après un
        // rechargement ne redémarre pas le compteur.
        const demarre = startDraft(draft, now)
        await this.database.drafts.clear()
        await this.database.drafts.put({ ...demarre, updatedAt: now })
        return { ...demarre, updatedAt: now }
      },
    )
  }

  /**
   * Construit un brouillon neuf **sans ouvrir de transaction** : l'appelant en tient une.
   *
   * Les réglages voyagent ici comme dans `openDraft` : une séance démarrée depuis
   * l'accueil et une séance démarrée depuis le sélecteur doivent s'ouvrir dans le même
   * état. Les oublier ferait de `startSession` le seul chemin qui ignore le mode pressé.
   */
  private async construireDansTransaction(
    type: SeanceType,
    date: string,
    rushed?: boolean,
  ): Promise<Draft> {
    const row = await this.database.targets.get(TARGETS_KEY)
    if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
    const { key: _key, ...targets } = row
    const seances = await this.database.seances.toArray()
    const reglages = await this.database.meta.get(PREFERENCES_KEY)
    const preferences = readPreferences(reglages?.value)
    return buildDraft(type, date, targets, {
      id: crypto.randomUUID(),
      seances,
      // Le choix de l'accueil l'emporte sur la préférence, qui n'est qu'un défaut.
      preferences: {
        ...preferences,
        modePresseParDefaut: rushed ?? preferences.modePresseParDefaut,
      },
    })
  }

  /**
   * Écrit le brouillon. Appelé à chaque frappe, à chaque validation, à chaque
   * démarrage de chrono : c'est ce qui fait qu'un rechargement ne perd rien.
   *
   * **Remplacement, pas ajout.** Il n'existe jamais qu'un brouillon à la fois. Un
   * simple `put` laisserait deux lignes si deux onglets ouvraient chacun le leur avant
   * la première écriture : `loadDraft` masquerait la plus ancienne, et finaliser la
   * plus récente la ferait ressurgir. Le vidage et l'écriture tiennent donc dans une
   * transaction, ce qui aligne cet adaptateur sur l'implémentation en mémoire.
   */
  async saveDraft(draft: Draft): Promise<void> {
    const row = { ...draft, updatedAt: Date.now() }
    await this.database.transaction('rw', this.database.drafts, async () => {
      await this.database.drafts.clear()
      await this.database.drafts.put(row)
    })
  }

  async clearDraft(): Promise<void> {
    await this.database.drafts.clear()
  }

  /**
   * Rend le brouillon déjà ouvert, **quel que soit le type demandé**.
   *
   * Changer de sélecteur A/B/C ne doit jamais détruire une saisie en cours : D9 dit
   * que rien ne se perd, et une séance à moitié saisie effacée par un tap sur le
   * sélecteur serait la pire perte possible, en pleine salle. C'est à l'interface de
   * proposer explicitement d'abandonner via `clearDraft` avant d'en ouvrir une autre.
   */
  async openDraft(type: SeanceType, date: string): Promise<Draft> {
    const existing = await this.loadDraft()
    if (existing) return existing

    const targets = await this.getTargets()
    // L'historique entre ici : c'est lui qui décide de la charge des accessoires.
    // Sans lui, l'app reproposerait indéfiniment la valeur de la table — le défaut
    // qu'Ugo a vu en salle le 12.09.
    const seances = await this.listSeances()
    // Les réglages décident de l'état d'ouverture — écran maintenu, mode pressé. Lus
    // ici et pas dans `buildDraft` : la fonction reste pure, le magasin fait l'entrée.
    const preferences = await this.getPreferences()
    const draft = buildDraft(type, date, targets, {
      id: crypto.randomUUID(),
      seances,
      preferences,
    })
    await this.database.transaction('rw', this.database.drafts, async () => {
      await this.database.drafts.clear()
      await this.database.drafts.put(draft)
    })
    return draft
  }

  /**
   * Une transaction unique : la séance, les cibles et la fermeture du brouillon
   * partent ensemble ou pas du tout. Idempotente par construction, puisque la séance
   * porte l'identifiant du brouillon.
   */
  async finalizeSeance(draftId: string): Promise<FinalizeResult> {
    return this.database.transaction(
      'rw',
      this.database.seances,
      this.database.targets,
      this.database.drafts,
      // `meta` porte le journal des événements : l'oublier ici ferait lever Dexie
      // au premier enregistrement réel, une table hors portée étant interdite.
      this.database.meta,
      async () => {
        const existing = await this.database.seances.get(draftId)
        if (existing) {
          // Double tap, reprise après erreur, second onglet : on rend ce qui existe
          // déjà, sans progresser une deuxième fois. Les événements sont rejoués
          // depuis le journal, pour qu'une reprise réaffiche le récapitulatif.
          const row = await this.database.targets.get(TARGETS_KEY)
          if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
          const { key: _key, ...targets } = row
          const journal = await this.database.meta.get(eventsKey(draftId))
          await this.database.drafts.delete(draftId)
          return {
            seance: existing,
            targets,
            events: (journal?.value as ProgressionEvent[] | undefined) ?? [],
            applied: false,
          }
        }

        const stocke = await this.database.drafts.get(draftId)
        if (!stocke) {
          throw new StoreError('draft-not-found', 'Aucune séance en cours sous cet identifiant.')
        }
        const draft = hydrateDraft(stocke)

        const row = await this.database.targets.get(TARGETS_KEY)
        if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
        const { key: _key, ...current } = row

        // Un ajustement manuel fait pendant la séance ne doit pas être écrasé sans
        // qu'Ugo le sache : on refuse d'enregistrer et on garde le brouillon intact.
        if (targetsDiverged(draft.baseTargets, current)) {
          throw new StoreError(
            'stale-targets',
            'Les cibles ont été ajustées depuis le début de cette séance. Rouvre la séance avant d’enregistrer.',
          )
        }

        const seance = draftToSeance(draft)
        const { targets, events } = applyProgression(draft, current)

        await this.database.seances.put(seance)
        await this.database.targets.put({ key: TARGETS_KEY, ...targets })
        await this.database.meta.put({ key: eventsKey(seance.id), value: events })
        // La séance vient d'entrer au carnet : elle doit partir. Même transaction.
        await this.noterMutationCarnet()
        await this.database.drafts.delete(draftId)

        return { seance, targets, events, applied: true }
      },
    )
  }

  /**
   * Ajuste une cible à la main. Le moteur repart de la valeur posée.
   *
   * Une seule transaction : la lecture et l'écriture ne peuvent pas être séparées par
   * une finalisation de séance qui écrirait entre les deux.
   */
  async adjustTarget(lift: LiftKey, patch: TargetPatch): Promise<Targets> {
    return this.database.transaction(
      'rw',
      this.database.targets,
      // `drafts` est dans la portée pour que le refus soit **atomique** avec la lecture :
      // un garde d'interface ne suffit pas. L'écran peut lire « pas de brouillon » une
      // fraction de seconde avant que l'écran de séance n'en ouvre un, et une seconde
      // fenêtre contourne l'interface entièrement.
      this.database.drafts,
      // `meta` porte le journal des ajustements. Écrire la cible et sa trace dans
      // deux transactions séparées laisserait exister un état où la cible a bougé
      // sans que rien ne dise pourquoi — exactement la question à laquelle ce
      // journal existe pour répondre.
      this.database.meta,
      // `seances` depuis CB-45 : la reconstruction du brouillon rejoue la progression
      // des accessoires, qui lit l'historique. Une table hors portée fait lever Dexie
      // — le test du raccord l'a levé dès le premier essai.
      this.database.seances,
      async () => {
        // L'invariant vit ici, au point d'écriture, et pas seulement dans l'écran :
        // déplacer une cible pendant une séance rendrait le brouillon impossible à
        // finaliser (`stale-targets`), et aucun écran ne sait rebaser un brouillon.
        // Ugo devrait abandonner toute sa saisie. Même règle que `importReplace`.
        //
        // Mais un brouillon **jamais touché** n'est pas une séance en cours : l'écran
        // d'accueil en ouvre un dès l'affichage, y compris juste après une
        // finalisation. Refuser là-dessus interdisait d'ajuster une cible au moment
        // précis où Ugo sort de la salle. On le reconstruit donc sur les nouvelles
        // cibles, dans cette même transaction : il ne portait aucune information.
        const stockeExistant = await this.database.drafts.toCollection().first()
        const existant = stockeExistant ? hydrateDraft(stockeExistant) : undefined
        if (existant && isDraftActive(existant)) {
          throw new StoreError(
            'draft-in-progress',
            'Une séance est en cours. Termine-la avant d’ajuster une cible.',
          )
        }

        const row = await this.database.targets.get(TARGETS_KEY)
        if (!row) throw new StoreError('storage-unavailable', 'Cibles introuvables.')
        const { key: _key, ...courant } = row
        const at = todayInZurich()
        const targets = applyTargetPatch(courant, lift, patch, at)
        // Un patch vide rend l'objet inchangé : ne rien journaliser plutôt que
        // d'inscrire un ajustement qui n'a rien ajusté.
        if (targets === courant) return targets

        await this.database.targets.put({ key: TARGETS_KEY, ...targets })
        await this.noterMutationCarnet()
        const journal = await this.database.meta.get(ADJUSTMENTS_KEY)
        const precedents = (journal?.value ?? []) as TargetAdjustment[]
        const trace: TargetAdjustment = { at, lift, before: courant[lift], after: targets[lift] }
        await this.database.meta.put({ key: ADJUSTMENTS_KEY, value: [...precedents, trace] })

        if (existant) {
          // Même identifiant : l'écran de séance peut encore le tenir en mémoire, et
          // un identifiant neuf ferait diverger sa copie sans qu'il s'en aperçoive.
          // Il reste à l'interface à se remonter pour relire celui-ci — c'est écrit
          // dans le parcours d'acceptation du ticket.
          // Les séances se lisent **dans cette transaction**, pas via `listSeances()`
          // qui en ouvrirait une seconde. Sans elles, ajuster une cible effacerait les
          // charges d'accessoires calculées et ramènerait Ugo aux valeurs de la table :
          // le défaut du « 20 kg par haltère », revenu par la porte de derrière.
          const historique = await this.database.seances.toArray()
          await this.database.drafts.put({
            ...buildDraft(existant.type, existant.date, targets, {
              id: existant.id,
              seances: historique,
            }),
            // La préférence d'écran n'est pas une donnée de séance : la reconstruction
            // remet les charges à jour, elle n'a aucune raison de rallumer ou d'éteindre
            // l'écran d'Ugo à son insu.
            keepAwake: existant.keepAwake,
            // Le mode pressé relève exactement du même raisonnement, et il y échappait :
            // il repartait du défaut à chaque reconstruction. Depuis CB-62 ce défaut
            // vient d'un réglage, ce qui rendrait la perte plus visible — un ajustement
            // de cible rouvrirait la séance repliée alors qu'Ugo l'avait dépliée.
            rushed: existant.rushed,
          })
        }
        return targets
      },
    )
  }

  /** Le journal des ajustements manuels, du plus ancien au plus récent. */
  async listTargetAdjustments(): Promise<TargetAdjustment[]> {
    const journal = await this.database.meta.get(ADJUSTMENTS_KEY)
    return (journal?.value ?? []) as TargetAdjustment[]
  }

  // ---- correction de l'historique (D6) ----

  /**
   * Corrige une séance déjà enregistrée.
   *
   * **Ne touche jamais aux cibles** (D6). Corriger une séance de juillet ne doit pas
   * rejouer une progression vieille de deux mois : les cibles d'aujourd'hui sont le
   * produit de tout ce qui s'est passé depuis, et les recalculer à partir d'un point
   * du passé effacerait chaque décision prise entre-temps.
   *
   * Pas de contrôle de brouillon ici, contrairement à `adjustTarget` et
   * `importReplace` : puisque rien ne bouge côté cibles, `targetsDiverged` ne verra
   * aucune divergence et une séance en cours reste finalisable.
   */
  /**
   * Fait avancer la génération de sauvegarde — CB-79b.
   *
   * **À appeler depuis l'intérieur d'une transaction qui verrouille déjà `meta`**, et
   * dans la même que la donnée couverte. Deux transactions séparées laisseraient exister
   * un instant où la séance est écrite et la génération ne l'est pas ; un plantage là —
   * iOS tue un onglet en arrière-plan sans prévenir — et la séance ne partirait jamais,
   * sans que rien ne le signale.
   */
  private async noterMutationCarnet(): Promise<void> {
    const stocke = await this.database.meta.get(SAUVEGARDE_KEY)
    const ligne = noterMutation(lireSauvegarde(stocke?.value))
    await this.database.meta.put({ key: SAUVEGARDE_KEY, value: ligne })
  }

  /** L'état du protocole tel qu'il est enregistré. */
  async etatSauvegarde(): Promise<EtatSauvegarde> {
    const stocke = await this.database.meta.get(SAUVEGARDE_KEY)
    return lireSauvegarde(stocke?.value).etat
  }

  /**
   * Décide quoi faire, et **fige** ce qui part — CB-79b.
   *
   * Tout se joue dans une transaction : la décision est prise sur l'état canonique, pas
   * sur une copie que l'appelant tiendrait depuis un moment. C'est ce que demandait la
   * précondition d'`envoyer` — une décision calculée avant une réponse et enregistrée
   * après elle ferait renaître un envoi déjà acquitté.
   *
   * L'instantané n'est pris qu'**une fois par génération**. Un réessai porte la même
   * identité d'opération, donc il doit porter le même contenu : renvoyer le carnet
   * d'aujourd'hui sous l'identité d'hier ferait diverger ce que le serveur a enregistré
   * de ce que nous croyons lui avoir envoyé.
   */
  async preparerEnvoi(appareil: string, distant: LectureDistante): Promise<EnvoiPrepare> {
    return this.database.transaction(
      'rw',
      this.database.seances,
      this.database.targets,
      this.database.meta,
      async () => {
        const stocke = await this.database.meta.get(SAUVEGARDE_KEY)
        const ligne = lireSauvegarde(stocke?.value)
        const action = prochaineAction(ligne.etat, distant, appareil)
        if (action.type !== 'envoyer') return { action, carnet: null }

        const dejaFige =
          ligne.instantane?.generation === action.generation ? ligne.instantane : null
        const instantane =
          dejaFige ??
          ({
            generation: action.generation,
            carnet: {
              seances: await this.database.seances.toArray(),
              targets: await this.getTargets(),
            },
          } satisfies InstantaneEnVol)

        await this.database.meta.put({
          key: SAUVEGARDE_KEY,
          value: {
            etat: envoyer(ligne.etat, action.generation, appareil),
            instantane,
          } satisfies LigneSauvegarde,
        })
        return { action, carnet: instantane.carnet }
      },
    )
  }

  /** Prendre acte d'un envoi confirmé, et libérer son instantané. */
  async acquitterEnvoi(generation: number, revision: number): Promise<EtatSauvegarde> {
    return this.database.transaction('rw', this.database.meta, async () => {
      const stocke = await this.database.meta.get(SAUVEGARDE_KEY)
      const ligne = lireSauvegarde(stocke?.value)
      const etat = acquitter(ligne.etat, generation, revision)
      // L'instantané ne se libère que s'il portait la génération confirmée. Un envoi
      // plus récent garde le sien, puisqu'il attend encore sa propre réponse.
      const instantane =
        ligne.instantane && ligne.instantane.generation > generation ? ligne.instantane : null
      await this.database.meta.put({
        key: SAUVEGARDE_KEY,
        value: { etat, instantane } satisfies LigneSauvegarde,
      })
      return etat
    })
  }

  /**
   * « J'ai vu l'autre carnet, garde le mien. »
   *
   * Le geste explicite d'Ugo, jamais une décision de l'app. `revision` est celle qui lui
   * a été **montrée** : le transport devra conditionner son écriture à celle-là, pour
   * qu'un distant ayant bougé depuis l'affichage repose le conflit au lieu d'être écrasé
   * sans que personne ne l'ait vu. Ce conditionnement viendra avec le transport ; tant
   * qu'il n'existe pas, cette opération n'envoie rien par elle-même.
   */
  async resoudreConflit(revision: number): Promise<EtatSauvegarde> {
    return this.database.transaction('rw', this.database.meta, async () => {
      const stocke = await this.database.meta.get(SAUVEGARDE_KEY)
      const ligne = lireSauvegarde(stocke?.value)
      const etat = garderLeMien(ligne.etat, revision)
      await this.database.meta.put({
        key: SAUVEGARDE_KEY,
        value: { ...ligne, etat } satisfies LigneSauvegarde,
      })
      return etat
    })
  }

  async updateSeance(id: string, patch: Partial<Omit<Seance, 'id'>>): Promise<Seance> {
    // `meta` entre dans le verrou : la génération de sauvegarde s'écrit avec la
    // correction, pas après elle.
    return this.database.transaction('rw', this.database.seances, this.database.meta, async () => {
      const courante = await this.database.seances.get(id)
      if (!courante) {
        throw new StoreError('storage-unavailable', 'Cette séance n’existe pas ou plus.')
      }

      const suivante = { ...courante, ...patch, id }
      // Valider avant d'écrire : une correction manuelle est exactement l'endroit où
      // une date impossible ou un type inconnu peut entrer dans la base.
      const verdict = seanceSchema.safeParse(suivante)
      if (!verdict.success) {
        throw new StoreError('storage-unavailable', 'Cette correction rendrait la séance invalide.')
      }

      await this.database.seances.put(verdict.data)
      await this.noterMutationCarnet()
      return verdict.data
    })
  }

  /**
   * Supprime une séance. **Sans effet sur les cibles** (D6), pour la même raison.
   *
   * Supprimer une séance dont la progression a déjà été appliquée laisse donc les
   * cibles où elles sont. C'est voulu : Ugo a réellement soulevé ces charges, et la
   * cible reflète ce qu'il sait faire, pas le contenu de la table `seances`. S'il veut
   * aussi revenir en arrière sur une cible, l'ajustement manuel est là pour ça — un
   * geste explicite, journalisé.
   */
  async deleteSeance(id: string): Promise<void> {
    // Une suppression n'avait pas de transaction du tout : elle n'écrivait qu'une ligne.
    // Elle en a une maintenant, parce qu'elle en écrit deux — la séance qui part et la
    // génération qui dit qu'il faut le faire savoir.
    await this.database.transaction('rw', this.database.seances, this.database.meta, async () => {
      await this.database.seances.delete(id)
      await this.noterMutationCarnet()
    })
  }

  // ---- échange ----

  /**
   * Ne lève pas, volontairement, et c'est une exception assumée à la règle du projet.
   *
   * Partout ailleurs une lecture qui échoue doit se voir. Ici l'appelant est l'écran de
   * réglages, et la seule alternative à un défaut serait de ne rien afficher : une base
   * indisponible n'empêche pas Ugo de vouloir couper la vibration, et son geste sera
   * refusé — bruyamment, lui — au moment de l'écriture.
   */
  async getPreferences(): Promise<Preferences> {
    try {
      const row = await this.database.meta.get(PREFERENCES_KEY)
      return readPreferences(row?.value)
    } catch {
      return { ...PREFERENCES_PAR_DEFAUT }
    }
  }

  /**
   * Lecture et écriture dans la **même** transaction : deux onglets qui basculent
   * chacun un interrupteur doivent se cumuler, pas s'écraser. Sans la transaction, le
   * second lirait l'état d'avant le premier et le réécrirait tel quel.
   */
  async savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
    return this.database.transaction('rw', this.database.meta, async () => {
      const row = await this.database.meta.get(PREFERENCES_KEY)
      const fusion = { ...readPreferences(row?.value), ...patch }
      await this.database.meta.put({ key: PREFERENCES_KEY, value: writePreferences(fusion) })
      return fusion
    })
  }

  async exportAll(): Promise<ExportFile> {
    return buildExport(this)
  }

  async previewImport(input: unknown): Promise<ImportPreview> {
    const candidate = validateImport(input)
    // L'historique entier, et non son décompte : l'empreinte porte sur le contenu, seule
    // façon de voir qu'une séance passée a été corrigée entre l'aperçu et la
    // confirmation. Le carnet pèse 5 Ko, la lecture est sans conséquence.
    const [seances, targets] = await Promise.all([
      this.database.seances.toArray(),
      this.getTargets(),
    ])
    return describeImport(candidate, { seances, targets })
  }

  /**
   * Remplace intégralement l'historique et les cibles.
   *
   * Refusé tant qu'une séance est en cours : écraser l'historique sous les pieds d'une
   * saisie laisserait un brouillon dont les cibles de référence ne correspondraient
   * plus à rien.
   *
   * La validation du fichier a lieu **avant** la transaction — elle ne lit pas la base,
   * et un fichier invalide n'a donc aucune raison d'ouvrir quoi que ce soit. Le contrôle
   * du brouillon, lui, est **dans** la transaction et avant la première écriture
   * destructive : le vérifier dehors laisserait une fenêtre pendant laquelle une autre
   * fenêtre du navigateur, ou l'app installée qui partage la même base, peut ouvrir un
   * brouillon. L'import passerait le contrôle puis effacerait une séance qu'Ugo est en
   * train de saisir — précisément ce que ce refus existe pour empêcher.
   */
  async importReplace(
    input: unknown,
    identite: IdentiteComparaison,
  ): Promise<{ seanceCount: number; targets: Targets }> {
    const candidate = validateImport(input)

    // Le fichier confirmé n'est pas forcément celui qui a été comparé : rien n'empêche
    // de coller un autre export entre l'aperçu et le bouton. Ce contrôle-ci ne lit pas
    // la base, il reste donc dehors.
    if (empreinteCarnet(candidate) !== identite.candidat) {
      throw new StoreError(
        'stale-preview',
        'Le fichier a changé depuis la comparaison. Refais un aperçu avant de remplacer.',
      )
    }

    return this.database.transaction(
      'rw',
      this.database.seances,
      this.database.targets,
      this.database.drafts,
      this.database.meta,
      async () => {
        if ((await this.database.drafts.count()) > 0) {
          throw new StoreError(
            'draft-in-progress',
            'Une séance est en cours. Termine-la ou abandonne-la avant de remplacer tes données.',
          )
        }

        // **Dans** la transaction, et avant la première écriture destructive. Le vérifier
        // dehors laisserait la même fenêtre que pour le brouillon : une autre fenêtre du
        // navigateur, ou l'app installée qui partage la base, peut avoir écrit depuis
        // l'aperçu. Ugo confirmerait alors un remplacement de ce qu'il a vu, et
        // détruirait ce qu'il n'a pas vu.
        const [seances, targets] = await Promise.all([
          this.database.seances.toArray(),
          this.getTargets(),
        ])
        if (empreinteCarnet({ seances, targets }) !== identite.local) {
          throw new StoreError(
            'stale-preview',
            'Tes données ont changé depuis la comparaison. Refais un aperçu avant de remplacer.',
          )
        }

        await this.database.seances.clear()
        await this.database.drafts.clear()
        await this.database.seances.bulkPut(candidate.seances)
        await this.database.targets.put({ key: TARGETS_KEY, ...candidate.targets })
        // Le marqueur d'amorçage reste posé : après un import, on ne veut surtout pas
        // que le seed d'origine revienne se superposer au prochain lancement.
        await this.database.meta.put({
          key: SEEDED_KEY,
          value: { at: new Date().toISOString(), seanceCount: candidate.seances.length },
        })
        // Un import remplace tout le carnet : c'est la plus grosse mutation qui soit.
        await this.noterMutationCarnet()
        return { seanceCount: candidate.seances.length, targets: candidate.targets }
      },
    )
  }
}

/** L'instance utilisée par l'app. */
export const store = new DexieStore()
