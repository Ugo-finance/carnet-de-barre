/**
 * Les sélecteurs d'écran — CB-62.
 *
 * Leur raison d'être est qu'aucun écran ne recalcule ce qu'un autre calcule déjà. Les
 * tests visent donc **l'accord avec la source**, et pas des valeurs écrites à la main :
 * un compte de paliers attendu en dur resterait vrai si le sélecteur et le brouillon se
 * trompaient ensemble, ce qui est précisément le défaut qu'on cherche à empêcher.
 */

import { describe, expect, it } from 'vitest'
import { buildDraft } from './draft.ts'
import {
  apercuSeance,
  dureeDe,
  metriquesDifferees,
  resumeAccueil,
  resumeFinSeance,
  resumeProgression,
} from './selectors.ts'
import { draftToSeance } from './derive.ts'
import type { Draft, Seance, SeanceType, Targets } from '../domain/types.ts'

const CIBLES: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

/** Dimanche 20.09.2026, jour de séance C. */
const DIMANCHE = new Date('2026-09-20T08:00:00+02:00')

function brouillon(type: SeanceType = 'A'): Draft {
  return buildDraft(type, '2026-09-15', CIBLES, { id: 'd', now: 1000 })
}

describe('l’aperçu d’une sélection', () => {
  it.each(['A', 'B', 'C'] as const)(
    'compte pour %s exactement ce que le brouillon proposera',
    (type) => {
      // L'accord avec la source, et non un nombre écrit à la main : c'est la seule
      // forme qui reste vraie quand la politique d'échauffement change.
      const apercu = apercuSeance(type, CIBLES, [])
      const draft = buildDraft(type, '2026-09-15', CIBLES, { id: 'x', now: 1 })

      expect(apercu.paliers).toBe(draft.sets.filter((set) => set.role === 'warmup').length)
      expect(apercu.seriesDeTravail).toBe(draft.sets.filter((set) => set.role !== 'warmup').length)
    },
  )

  it('annonce les exercices dans l’ordre du programme, optionnels marqués', () => {
    const apercu = apercuSeance('A', CIBLES, [])
    expect(apercu.exercices.map((exercice) => exercice.id)).toEqual([
      'a-squat',
      'a-bench-vol',
      'a-tractions-lestees',
      'a-dips',
      'a-curls',
      'a-elevations',
    ])
    expect(
      apercu.exercices.filter((exercice) => exercice.optional).map((exercice) => exercice.id),
    ).toEqual(['a-curls', 'a-elevations'])
  })

  it('suit la charge réelle d’un accessoire jusque dans le compte de paliers', () => {
    // Le cas limite, et le seul où la charge d'un accessoire change le **compte** et
    // pas seulement la valeur du palier : sous le premier cran, la rampe de l'incliné
    // disparaît. Un aperçu qui ignorerait l'historique annoncerait 4 paliers devant une
    // séance qui en proposera 3 — et c'est exactement ce que le brouillon fera.
    const historique: Seance[] = [
      {
        id: 's1',
        date: '2026-09-10',
        type: 'C',
        lines: [],
        tops: {},
        notes: '',
        ts: 1,
        sets: [0, 1, 2].map((index) => ({
          id: `c-di:accessory:${index}`,
          exerciseId: 'c-di',
          role: 'accessory' as const,
          index,
          status: 'validated' as const,
          loadKind: 'perDumbbell' as const,
          weight: 2,
          reps: 9,
          rpe: null,
          targetWeight: 2,
          targetReps: 9,
        })),
      },
    ]

    const sansHistorique = apercuSeance('C', CIBLES, [])
    const avecHistorique = apercuSeance('C', CIBLES, historique)
    const draft = buildDraft('C', '2026-09-15', CIBLES, {
      id: 'x',
      now: 1,
      seances: historique,
    })

    expect(sansHistorique.paliers).toBe(4)
    expect(avecHistorique.paliers).toBe(3)
    // Et l'accord avec la source, qui est la vraie garantie : l'aperçu annonce ce que
    // le brouillon proposera, quel que soit le nombre.
    expect(avecHistorique.paliers).toBe(draft.sets.filter((set) => set.role === 'warmup').length)
  })
})

describe('l’accueil', () => {
  it('propose une séance tant que rien n’est commencé', () => {
    const resume = resumeAccueil({
      draft: brouillon(),
      seances: [],
      targets: CIBLES,
      now: DIMANCHE,
    })
    expect(resume.etat).toBe('aucune')
    if (resume.etat !== 'aucune') throw new Error('état inattendu')
    expect(resume.type).toBe('C')
    expect(resume.quand).toBe("Aujourd'hui")
    expect(resume.date).toBe('2026-09-20')
  })

  it('bascule sur « en cours » dès que la séance est démarrée', () => {
    // Le trou que CB-62 ferme : sans `startedAt`, une séance démarrée mais dont rien
    // n'est validé passait pour « aucune », et l'accueil proposait d'en ouvrir une autre.
    const demarre = { ...brouillon(), startedAt: 5000 }
    const resume = resumeAccueil({
      draft: demarre,
      seances: [],
      targets: CIBLES,
      now: DIMANCHE,
    })
    expect(resume.etat).toBe('en-cours')
  })

  it('compte l’avancement sur la file active, paliers compris', () => {
    // `10-interaction.md` § 1 : « le nombre de séries validated ou skipped sur le nombre
    // de séries de la file active », et les totaux 23 / 22 / 16 en sont la mesure. Une
    // première version comptait les seules séries de travail : Ugo validait ses sept
    // paliers et lisait 0/16, ce qu'il venait de faire n'apparaissant nulle part.
    // P1 de Codex sur #55.
    const draft = brouillon('A')
    const paliersFaits: Draft = {
      ...draft,
      startedAt: 5000,
      sets: draft.sets.map((set) =>
        set.role === 'warmup' ? { ...set, status: 'validated' as const } : set,
      ),
    }

    const resume = resumeAccueil({
      draft: paliersFaits,
      seances: [],
      targets: CIBLES,
      now: DIMANCHE,
    })
    if (resume.etat !== 'en-cours') throw new Error('état inattendu')
    expect(resume.total).toBe(23)
    expect(resume.traitees).toBe(7)
    expect(resume.complet).toBe(false)
  })

  it('rétrécit la file au mode pressé, sans rien retirer du brouillon', () => {
    // Point 4 du contrat : les exercices au-delà du deuxième sont omis de la file
    // active, **sans supprimer leurs séries du brouillon**. Une séance pressée dont les
    // deux premiers exercices sont traités est donc terminée.
    const draft = brouillon('A')
    const presse: Draft = {
      ...draft,
      rushed: true,
      startedAt: 5000,
      sets: draft.sets.map((set) =>
        set.exerciseId === 'a-squat' || set.exerciseId === 'a-bench-vol'
          ? { ...set, status: 'skipped' as const }
          : set,
      ),
    }

    const resume = resumeAccueil({ draft: presse, seances: [], targets: CIBLES, now: DIMANCHE })
    if (resume.etat !== 'en-cours') throw new Error('état inattendu')
    expect(resume.total).toBe(12)
    expect(resume.traitees).toBe(12)
    expect(resume.complet).toBe(true)
    // Et le brouillon porte toujours ses 23 séries : l'interrupteur n'efface rien.
    expect(presse.sets).toHaveLength(23)
  })

  it('compte une série sautée comme traitée', () => {
    // « Traité » n'est pas « réalisé » : une série sautée ne laisse rien à faire, et
    // l'accueil ne doit pas réclamer indéfiniment une séance qu'Ugo a terminée.
    const draft = brouillon('A')
    const tout: Draft = {
      ...draft,
      startedAt: 5000,
      sets: draft.sets.map((set) => ({ ...set, status: 'skipped' as const })),
    }
    const resume = resumeAccueil({ draft: tout, seances: [], targets: CIBLES, now: DIMANCHE })
    if (resume.etat !== 'en-cours') throw new Error('état inattendu')
    expect(resume.complet).toBe(true)
  })
})

describe('la fin de séance', () => {
  it('rend la durée réelle quand la séance a été démarrée', () => {
    const draft = { ...brouillon(), startedAt: 1_000_000 }
    const seance = draftToSeance(draft, 1_000_000 + 75 * 60 * 1000)
    expect(resumeFinSeance(seance).dureeSecondes).toBe(75 * 60)
  })

  it('ne rend aucune durée pour une séance jamais démarrée', () => {
    const seance = draftToSeance(brouillon(), 8000)
    expect(resumeFinSeance(seance).dureeSecondes).toBeNull()
  })

  it('traite une durée impossible comme inconnue', () => {
    // Une horloge qui recule — changement d'heure, correction NTP. « 0 min » se lirait
    // comme une séance expédiée plutôt que comme une mesure qui n'a pas de sens.
    expect(dureeDe({ startedAt: 5000, completedAt: 5000 })).toBeNull()
    expect(dureeDe({ startedAt: 9000, completedAt: 5000 })).toBeNull()
  })

  it('sépare les séries de travail validées des paliers validés', () => {
    const draft = brouillon('A')
    const faite: Draft = {
      ...draft,
      startedAt: 1000,
      sets: draft.sets.map((set) => ({ ...set, status: 'validated' as const })),
    }
    const resume = resumeFinSeance(draftToSeance(faite, 5000))
    expect(resume.validees).toHaveLength(16)
    expect(resume.paliersValides).toBe(7)
  })
})

describe('la progression', () => {
  it('rend les cinq cibles avec les libellés du programme', () => {
    const resume = resumeProgression({ targets: CIBLES, draft: undefined })
    expect(resume.lignes.map((ligne) => [ligne.lift, ligne.label, ligne.cible])).toEqual([
      ['squat', 'Squat', 75],
      ['bench', 'Développé couché', 70],
      ['deadlift', 'Soulevé de terre', 92.5],
      ['tractions', 'Tractions lestées', 15],
      ['benchVol', 'Développé couché volume', 60],
    ])
  })

  it('interdit l’ajustement dès que la séance est démarrée', () => {
    // Aligné sur le magasin, qui lèvera `draft-in-progress`. Un bouton actif qui échoue
    // au clic est pire qu'un bouton désactivé.
    expect(resumeProgression({ targets: CIBLES, draft: brouillon() }).ajustable).toBe(true)
    expect(
      resumeProgression({ targets: CIBLES, draft: { ...brouillon(), startedAt: 1 } }).ajustable,
    ).toBe(false)
  })

  it('ne diffère plus que le tonnage', () => {
    // CB-13 a arrêté la formule du maximum estimé : e1RM et record sortent de la liste.
    // Le tonnage y reste pour une raison d'une autre nature — ce n'est pas une formule
    // qui manque mais une donnée : le chariot de la presse et le poids de corps d'Ugo.
    expect(metriquesDifferees.map((metrique) => metrique.cle)).toEqual(['tonnage'])
  })

  it('porte les records de charge et de maximum estimé', () => {
    const historique: Seance[] = [
      {
        id: 's1',
        date: '2026-09-06',
        type: 'C',
        lines: [],
        tops: { deadlift: { w: 87.5, reps: 3, rpe: 8 } },
        notes: '',
      },
      {
        id: 's2',
        date: '2026-07-29',
        type: 'B',
        lines: [],
        // Avec son RPE, et c'est délibéré : une traction sans RPE serait écartée pour
        // cette raison-là, et le test ne prouverait alors rien sur la nature de charge.
        // C'est le cas réel du 29.07.
        tops: { tractions: { w: 15, reps: 4, rpe: 8 } },
        notes: '',
      },
    ]

    const lignes = resumeProgression({
      targets: CIBLES,
      draft: undefined,
      seances: historique,
    }).lignes
    const souleve = lignes.find((ligne) => ligne.lift === 'deadlift')
    const tractions = lignes.find((ligne) => ligne.lift === 'tractions')

    expect(souleve?.recordCharge).toEqual({ valeur: 87.5, date: '2026-09-06' })
    expect(souleve?.recordE1RM).toEqual({ valeur: 102.1, date: '2026-09-06' })
    // Le lest ajouté n'estime aucun maximum sans le poids de corps — la charge, si.
    // Ce top set porte un RPE : seule sa nature de charge peut l'écarter.
    expect(tractions?.recordCharge).toEqual({ valeur: 15, date: '2026-07-29' })
    expect(tractions?.recordE1RM).toBeNull()
  })

  it('ne fabrique aucun record de force depuis le développé volume', () => {
    // Le chemin complet, jusqu'au sélecteur : une séance historique dont le développé
    // volume porte un RPE ne doit produire aucun maximum estimé — mais bien un record
    // de charge, puisque « ai-je soulevé plus lourd » reste une question valide.
    const historique: Seance[] = [
      {
        id: 's1',
        date: '2026-09-08',
        type: 'A',
        lines: [],
        tops: { benchVol: { w: 60, reps: 8, rpe: 8 } },
        notes: '',
      },
    ]

    const ligne = resumeProgression({
      targets: CIBLES,
      draft: undefined,
      seances: historique,
    }).lignes.find((candidate) => candidate.lift === 'benchVol')

    expect(ligne?.recordE1RM).toBeNull()
    expect(ligne?.recordCharge).toEqual({ valeur: 60, date: '2026-09-08' })
  })

  it('ne rend aucun record sans historique', () => {
    const lignes = resumeProgression({ targets: CIBLES, draft: undefined }).lignes
    expect(lignes.every((ligne) => ligne.recordCharge === null)).toBe(true)
    expect(lignes.every((ligne) => ligne.recordE1RM === null)).toBe(true)
  })
})

describe('l’aperçu suit le mode pressé', () => {
  it('ne projette que les deux premiers exercices, échauffements gardés', () => {
    // La règle des deux exercices est déjà écrite une fois. Un composant qui la
    // réimplémenterait annoncerait un jour une file que le brouillon ne produit pas.
    const complet = apercuSeance('A', CIBLES, [])
    const presse = apercuSeance('A', CIBLES, [], true)

    expect(complet.exercices).toHaveLength(6)
    expect(presse.exercices.map((exercice) => exercice.id)).toEqual(['a-squat', 'a-bench-vol'])
    expect(presse.paliers + presse.seriesDeTravail).toBe(12)
    // Les paliers des deux exercices actifs restent : le mode pressé ampute la file,
    // pas l'échauffement de ce qu'Ugo va réellement faire.
    expect(presse.paliers).toBeGreaterThan(0)
  })
})
