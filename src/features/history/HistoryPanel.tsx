/**
 * Historique des séances — CB-32.
 *
 * Le récapitulatif de fin de séance ne s'affiche qu'une fois : quitter l'app le fait
 * disparaître. Sans cet écran, Ugo n'a **aucun moyen de vérifier** que sa séance a
 * bien été enregistrée — et c'est la question qu'on se pose précisément le premier
 * soir, quand on ne fait pas encore confiance à l'outil.
 *
 * L'écran est donc construit pour répondre à « est-ce que c'est bien là ? » avant de
 * répondre à « qu'est-ce que j'ai fait en juillet ? ». La séance la plus récente est
 * en haut, dépliée ; les autres sont repliées.
 */

import { useState } from 'react'
import { formatDate } from '../../domain/format.ts'
import type { Seance } from '../../domain/types.ts'

export interface HistoryPort {
  updateSeance(id: string, patch: Partial<Omit<Seance, 'id'>>): Promise<Seance>
  deleteSeance(id: string): Promise<void>
}

/**
 * Les séances du plus récent au plus ancien, à date égale la dernière enregistrée
 * d'abord.
 *
 * Deux séances le même jour sont permises (D5). Rendre `0` à date égale laissait
 * l'ordre des clés IndexedDB décider, qui n'a aucun rapport avec l'heure : c'est
 * alors la mauvaise des deux qui pouvait s'afficher dépliée en haut, juste au moment
 * où Ugo vient vérifier que sa séance du soir est bien là.
 *
 * `ts` est l'instant de finalisation. Il manque aux séances du dossier de départ, qui
 * n'ont qu'une date : elles passent donc après celles qui en ont, ce qui est le bon
 * ordre puisqu'elles sont toutes anciennes.
 */
function parOrdreAntichronologique(seances: Seance[]): Seance[] {
  return seances.toSorted((a, b) =>
    a.date === b.date ? (b.ts ?? 0) - (a.ts ?? 0) : a.date < b.date ? 1 : -1,
  )
}

function LigneSeance({
  seance,
  ouvertParDefaut,
  store,
  onChange,
  onDelete,
}: {
  seance: Seance
  ouvertParDefaut: boolean
  store: HistoryPort
  onChange: (seance: Seance) => void
  onDelete: (id: string) => void
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  const [noteEnCours, setNoteEnCours] = useState<string>()
  const [confirmeSuppression, setConfirmeSuppression] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string>()

  const echec = (cause: unknown) =>
    setErreur(cause instanceof Error ? cause.message : 'Opération refusée.')

  const enregistrerNote = async () => {
    if (noteEnCours === undefined) return
    setOccupe(true)
    setErreur(undefined)
    try {
      onChange(await store.updateSeance(seance.id, { notes: noteEnCours }))
      setNoteEnCours(undefined)
    } catch (cause) {
      echec(cause)
    } finally {
      setOccupe(false)
    }
  }

  const supprimer = async () => {
    setOccupe(true)
    setErreur(undefined)
    try {
      await store.deleteSeance(seance.id)
      onDelete(seance.id)
    } catch (cause) {
      echec(cause)
      setOccupe(false)
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={ouvert}
        onClick={() => setOuvert((actuel) => !actuel)}
      >
        <span className="min-w-0">
          <span className="font-semibold">Séance {seance.type}</span>
          <span className="num ml-2 text-sm text-muted">
            {formatDate(seance.date)}
            {seance.approx ? ' (environ)' : ''}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          {ouvert ? '−' : '+'}
        </span>
      </button>

      {ouvert ? (
        <div className="border-t border-line px-4 py-3">
          {seance.lines.length > 0 ? (
            <ul className="grid gap-1">
              {seance.lines.map((ligne) => (
                <li key={ligne} className="num text-sm">
                  {ligne}
                </li>
              ))}
            </ul>
          ) : (
            /*
             * Le cas qui doit alerter : une séance finalisée sans aucune série validée.
             * Le dire franchement vaut mieux qu'un bloc vide qu'on prend pour un bug
             * d'affichage — c'est la trace d'une saisie perdue, et Ugo doit le savoir.
             */
            <p className="text-sm text-warn">
              Aucune série enregistrée. Les séries saisies mais non validées ne sont pas conservées.
            </p>
          )}

          {noteEnCours === undefined ? (
            seance.notes ? (
              <p className="mt-3 text-sm text-muted">{seance.notes}</p>
            ) : null
          ) : (
            <div className="mt-3">
              <label className="text-sm font-medium text-muted">
                Note de séance
                <textarea
                  className="mt-1 min-h-20 w-full resize-y rounded-xl border border-line bg-bg p-3 text-base text-fg outline-none focus:border-accent"
                  value={noteEnCours}
                  autoFocus
                  aria-label={`Note de la séance ${seance.type} du ${formatDate(seance.date)}`}
                  onChange={(event) => setNoteEnCours(event.target.value)}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg disabled:opacity-50"
                  disabled={occupe}
                  onClick={() => void enregistrerNote()}
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-line px-3 font-medium text-muted"
                  onClick={() => setNoteEnCours(undefined)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {erreur ? (
            <p className="mt-2 text-sm text-bad" role="alert">
              {erreur}
            </p>
          ) : null}

          {confirmeSuppression ? (
            <div className="mt-3 rounded-xl border border-bad/60 p-3" role="alert">
              <p className="text-sm font-semibold text-bad">Supprimer cette séance ?</p>
              {/*
               * Le point qui surprend, et qu'il faut dire avant le geste : supprimer
               * une séance ne fait pas redescendre les cibles (D6). Ugo a réellement
               * soulevé ces charges ; la cible reflète ce qu'il sait faire, pas le
               * contenu de la liste. Sans cette phrase, il supprimerait en croyant
               * annuler une progression, et ne comprendrait pas le résultat.
               */}
              <p className="mt-1 text-sm text-muted">
                Elle disparaîtra de l’historique et des exports. Tes cibles ne changeront pas — pour
                les corriger, passe par l’onglet Cibles.
              </p>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
                  onClick={() => setConfirmeSuppression(false)}
                >
                  Garder la séance
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-line px-4 font-semibold text-bad disabled:opacity-50"
                  disabled={occupe}
                  onClick={() => void supprimer()}
                >
                  {occupe ? 'Suppression…' : 'Supprimer définitivement'}
                </button>
              </div>
            </div>
          ) : noteEnCours === undefined ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-fg"
                onClick={() => setNoteEnCours(seance.notes)}
              >
                {seance.notes ? 'Modifier la note' : 'Ajouter une note'}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted"
                onClick={() => setConfirmeSuppression(true)}
              >
                Supprimer
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function HistoryPanel({ seances, store }: { seances: Seance[]; store: HistoryPort }) {
  // L'écran tient sa propre copie : corriger ou supprimer doit se voir tout de suite,
  // sans relire la base ni remonter l'onglet — et la liste reçue appartient à l'appelant.
  const [etat, setEtat] = useState<Seance[]>(seances)
  const ordonnees = parOrdreAntichronologique(etat)

  return (
    <section className="mx-auto w-full max-w-md py-4">
      <header>
        <h1 className="text-xl font-bold">Historique</h1>
        <p className="mt-1 text-sm text-muted">
          {ordonnees.length === 0
            ? 'Aucune séance enregistrée pour le moment.'
            : `${ordonnees.length} séance${ordonnees.length > 1 ? 's' : ''} enregistrée${
                ordonnees.length > 1 ? 's' : ''
              }.`}
        </p>
      </header>

      <ul className="mt-4 grid gap-2">
        {ordonnees.map((seance, index) => (
          <LigneSeance
            key={seance.id}
            seance={seance}
            ouvertParDefaut={index === 0}
            store={store}
            onChange={(suivante) =>
              setEtat((liste) => liste.map((s) => (s.id === suivante.id ? suivante : s)))
            }
            onDelete={(id) => setEtat((liste) => liste.filter((s) => s.id !== id))}
          />
        ))}
      </ul>
    </section>
  )
}
