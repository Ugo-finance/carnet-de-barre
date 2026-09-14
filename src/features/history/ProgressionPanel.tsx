/**
 * Progression — CB-66. Remplace l'écran « Cibles » de CB-33.
 *
 * Le changement de nom n'est pas cosmétique. L'écran de CB-33 répondait à « qu'est-ce
 * que l'app va me proposer ? » ; il lui manquait la moitié de la question qu'Ugo se
 * pose réellement devant une charge qui lui paraît fausse : « et par rapport à quoi ? ».
 *
 * CB-13 a livré cette moitié. Un record de charge et un maximum estimé existent
 * désormais comme faits calculés, avec leur date, et non comme illustrations de
 * maquette. L'écran les montre à côté de la cible parce que c'est leur seul usage : une
 * cible de 75 kg ne veut rien dire seule, elle veut dire quelque chose à côté d'un
 * record de 80 posé il y a trois semaines.
 *
 * Ce que l'écran refuse toujours de montrer vit dans `metriquesDifferees`, nommé avec
 * son motif. Un blanc que personne ne sait interpréter est pire qu'un « pas encore »
 * assumé — c'est l'arbitrage § 2 du contrat.
 */

import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet.tsx'
import { formatDate, formatKg, formatLoad } from '../../domain/format.ts'
import { LIFTS } from '../../domain/program.ts'
import { resumeProgression, type LigneProgression } from '../../db/selectors.ts'
import type { TargetPatch } from '../../db/targets.ts'
import type { Draft, LiftKey, Seance, Targets } from '../../domain/types.ts'

export interface ProgressionPort {
  adjustTarget(lift: LiftKey, patch: TargetPatch): Promise<Targets>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Ajustement refusé.'
}

/**
 * Analyse la saisie **en entier**, au lieu de s'arrêter au premier caractère invalide.
 *
 * `Number.parseFloat('77,5abc')` rend `77.5` sans rien signaler : l'écran annonce
 * refuser les fautes de frappe et enregistrerait une valeur différente de celle lue.
 */
function lireCharge(saisie: string): number | null {
  const normalisee = saisie.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalisee)) return null
  const valeur = Number(normalisee)
  return Number.isFinite(valeur) ? valeur : null
}

/** Un record et sa date, ou le motif de son absence. */
function Record({
  titre,
  record,
  rendu,
  absence,
}: {
  titre: string
  record: LigneProgression['recordCharge']
  rendu: (valeur: number) => string
  absence: string
}) {
  return (
    <div className="rounded-xl bg-bg p-2">
      <dt className="text-xs text-muted">
        {titre}
        {record === null ? '' : ` · ${formatDate(record.date)}`}
      </dt>
      <dd className={`num mt-0.5 font-bold ${record === null ? 'text-xs text-muted' : ''}`}>
        {record === null ? absence : rendu(record.valeur)}
      </dd>
    </div>
  )
}

function LigneLift({
  ligne,
  targets,
  ajustable,
  onAjuster,
  onRepartir,
}: {
  ligne: LigneProgression
  targets: Targets
  ajustable: boolean
  onAjuster: () => void
  onRepartir: () => void
}) {
  const definition = LIFTS[ligne.lift]
  const cible = targets[ligne.lift]

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{ligne.label}</h2>
          <p className="text-sm text-muted">
            {cible.sets ? `${cible.sets}×${cible.reps}` : `1×${cible.reps} @RPE 8`}
          </p>
        </div>
        <p className="num shrink-0 text-2xl font-bold">
          {formatLoad(ligne.cible, definition.loadKind)}
        </p>
      </div>

      {ligne.echecEnAttente === null ? null : (
        <p className="mt-2 text-sm text-warn">
          Deuxième essai à {formatLoad(ligne.echecEnAttente, definition.loadKind)}. Un nouvel échec
          à cette charge la fera redescendre de 7,5 %.
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Record
          titre="Record"
          record={ligne.recordCharge}
          rendu={(valeur) => formatLoad(valeur, definition.loadKind)}
          absence="Aucun top set enregistré."
        />
        {/*
         * Le maximum estimé manque pour deux motifs qu'il ne faut pas confondre, et
         * c'est la formule de CB-13 qui les sépare : les tractions n'en ont jamais,
         * leur lest n'estimant rien sans le poids de corps ; les autres n'en ont pas
         * tant qu'aucun top set ne porte de RPE. Dire « — » dans les deux cas ferait
         * croire à Ugo qu'il suffit de noter un RPE sur ses tractions.
         */}
        <Record
          titre="Max estimé"
          record={ligne.recordE1RM}
          rendu={formatKg}
          absence={
            definition.loadKind === 'barTotal'
              ? 'Note un RPE sur un top set.'
              : 'Non estimable sans ton poids de corps.'
          }
        />
      </dl>

      {!ajustable ? null : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-fg"
            onClick={onAjuster}
          >
            Ajuster
          </button>
          {ligne.echecEnAttente === null ? null : (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted"
              onClick={onRepartir}
            >
              Repartir à zéro
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * L'ajustement en feuille basse, et non replié dans la ligne.
 *
 * CB-66 l'exige sorti, « jamais caché dans un menu ». Le motif est le pouce : la ligne
 * du squat est en haut de l'écran, hors d'atteinte d'une main qui tient le téléphone.
 *
 * Elle s'appuie sur `BottomSheet`, qui est la vraie modale du projet — `<dialog>`,
 * `showModal()`, fond, Échap, fermeture au clic extérieur. Une première version
 * déclarait `role="dialog" aria-modal="true"` sur un `div` sans rien appliquer de tout
 * cela : elle annonçait une modalité qu'elle n'avait pas, et laissait la navigation
 * cliquable derrière elle. P2 de Codex, fondé.
 *
 * **Le refus du magasin s'affiche dans la feuille**, pas en dessous. Le message vivait
 * sous les cinq cartes, à y = 1347 px pendant que la feuille tenait le bas de l'écran :
 * une charge refusée ne produisait donc aucune réponse visible. Ugo tapait « Poser la
 * cible » et rien ne bougeait. Second P2 de Codex, et le plus coûteux des deux.
 */
function FeuilleAjustement({
  ligne,
  depart,
  refusMagasin,
  onPoser,
  onFermer,
}: {
  ligne: LigneProgression
  depart: number
  /** Le refus venu du magasin, à montrer là où Ugo regarde : dans la feuille. */
  refusMagasin: string | undefined
  onPoser: (valeur: number) => void
  onFermer: () => void
}) {
  const [saisie, setSaisie] = useState(String(depart).replace('.', ','))
  const [refusSaisie, setRefusSaisie] = useState<string>()

  const poser = () => {
    const valeur = lireCharge(saisie)
    if (valeur === null) {
      setRefusSaisie('Entre une charge en chiffres, par exemple 77,5.')
      return
    }
    setRefusSaisie(undefined)
    onPoser(valeur)
  }

  const refus = refusSaisie ?? refusMagasin

  return (
    <BottomSheet open title={`Ajuster ${ligne.label}`} onClose={onFermer}>
      <p className="text-sm text-muted">Le moteur repartira de cette valeur au prochain passage.</p>

      <label className="mt-3 block text-sm font-medium text-muted">
        Nouvelle cible (kg)
        <input
          className="num mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
          type="text"
          inputMode="decimal"
          value={saisie}
          autoFocus
          aria-label={`Nouvelle cible ${ligne.label}`}
          onChange={(event) => setSaisie(event.target.value)}
        />
      </label>

      {refus ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {refus}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 pb-2">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
          onClick={poser}
        >
          Poser la cible
        </button>
      </div>
    </BottomSheet>
  )
}

export function ProgressionPanel({
  targets,
  seances,
  draft,
  store,
}: {
  targets: Targets
  seances: readonly Seance[]
  /** Le brouillon en cours, s'il y en a un : il verrouille l'ajustement. */
  draft?: Draft
  store: ProgressionPort
}) {
  const [etat, setEtat] = useState<Targets>(targets)
  const [erreur, setErreur] = useState<string>()
  const [ajustement, setAjustement] = useState<LiftKey>()

  const resume = resumeProgression({ targets: etat, draft, seances })

  const ajuster = async (lift: LiftKey, patch: TargetPatch): Promise<boolean> => {
    setErreur(undefined)
    try {
      setEtat(await store.adjustTarget(lift, patch))
      return true
    } catch (error) {
      setErreur(messageOf(error))
      return false
    }
  }

  const ligneOuverte = resume.lignes.find((ligne) => ligne.lift === ajustement)

  return (
    <section className="mx-auto w-full max-w-md py-4">
      {/*
       * Même exception que l'historique au contrat § 1.7 : la liste peut défiler, le
       * repère non. Cinq lifts tiennent presque, six ne tiendraient plus.
       */}
      <header className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-3">
        <h1 className="text-xl font-bold">Progression</h1>
        <p className="mt-1 text-sm text-muted">
          Ce que l’app proposera la prochaine fois, et ce que tu as déjà fait. Cibles mises à jour
          le {formatDate(etat.updatedAt)}.
        </p>
      </header>

      {resume.ajustable ? null : (
        <p className="mt-3 rounded-xl border border-warn/60 bg-warn/10 p-3 text-sm text-fg">
          Séance en cours : les cibles sont en lecture seule. Les changer maintenant empêcherait
          d’enregistrer ta séance. Termine-la d’abord.
        </p>
      )}

      <ul className="mt-3 grid gap-3">
        {resume.lignes.map((ligne) => (
          <LigneLift
            key={ligne.lift}
            ligne={ligne}
            targets={etat}
            ajustable={resume.ajustable}
            onAjuster={() => {
              // Un refus d'un lift précédent n'a rien à dire sur celui-ci.
              setErreur(undefined)
              setAjustement(ligne.lift)
            }}
            onRepartir={() => void ajuster(ligne.lift, { fail: null })}
          />
        ))}
      </ul>

      {/*
       * Ne porte que les refus survenus **hors** de la feuille — « Repartir à zéro ».
       * Quand la feuille est ouverte, c'est elle qui montre le refus, là où Ugo
       * regarde ; le répéter ici le mettrait à 1347 px, hors de sa vue.
       */}
      <p className="min-h-6 text-sm text-bad" role="status" aria-live="polite">
        {ajustement === undefined ? (erreur ?? '') : ''}
      </p>

      {/*
       * Ce qui manque est nommé avec son motif. Le tonnage est le dernier rescapé de
       * cette liste depuis CB-13 : c'est une donnée qui manque — le poids du chariot et
       * celui d'Ugo — et non une formule.
       */}
      {resume.differees.length === 0 ? null : (
        <dl className="mt-2 grid gap-1 rounded-xl border border-line p-3 text-sm">
          {resume.differees.map((metrique) => (
            <div key={metrique.cle} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-muted">{metrique.label} · pas encore</dt>
              <dd className="text-muted">{metrique.motif}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-2 text-sm text-muted">
        Un ajustement remplace la valeur calculée : le moteur repart de là. Corriger une séance
        passée, en revanche, ne touche jamais les cibles.
      </p>

      {ligneOuverte ? (
        <FeuilleAjustement
          ligne={ligneOuverte}
          depart={ligneOuverte.cible}
          refusMagasin={erreur}
          onFermer={() => setAjustement(undefined)}
          onPoser={(valeur) => {
            void ajuster(ligneOuverte.lift, { w: valeur }).then((ok) => {
              // Ne refermer qu'en cas de succès : sur un refus, Ugo doit pouvoir
              // corriger ce qu'il vient de taper plutôt que de le ressaisir en entier.
              if (ok) setAjustement(undefined)
            })
          }}
        />
      ) : null}
    </section>
  )
}
