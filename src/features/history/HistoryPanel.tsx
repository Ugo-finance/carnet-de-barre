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

/** Les séances du plus récent au plus ancien, à date égale la dernière enregistrée d'abord. */
function parOrdreAntichronologique(seances: Seance[]): Seance[] {
  return seances.toSorted((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
}

function LigneSeance({ seance, ouvertParDefaut }: { seance: Seance; ouvertParDefaut: boolean }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)

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

          {seance.notes ? <p className="mt-3 text-sm text-muted">{seance.notes}</p> : null}
        </div>
      ) : null}
    </li>
  )
}

export function HistoryPanel({ seances }: { seances: Seance[] }) {
  const ordonnees = parOrdreAntichronologique(seances)

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
          <LigneSeance key={seance.id} seance={seance} ouvertParDefaut={index === 0} />
        ))}
      </ul>
    </section>
  )
}
