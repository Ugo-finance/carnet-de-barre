/**
 * Cibles courantes et ajustement manuel — CB-33.
 *
 * Écran volontairement sobre : il sert à voir d'un coup d'œil ce que l'app proposera
 * la prochaine fois, et à corriger quand le moteur se trompe. Ugo l'ouvrira rarement,
 * mais quand il l'ouvrira ce sera parce qu'une charge lui paraît fausse — l'écran doit
 * donc montrer **pourquoi** elle est là avant de proposer de la changer.
 *
 * D'où l'affichage de l'échec en attente : sans lui, une cible qui ne bouge pas après
 * une séance ratée paraît être un bug alors que c'est la règle.
 */

import { useState } from 'react'
import { LIFTS } from '../../domain/program.ts'
import { formatDate, formatLoad } from '../../domain/format.ts'
import { LIFT_ORDER } from '../../domain/schema.ts'
import type { LiftKey, Targets } from '../../domain/types.ts'
import type { TargetPatch } from '../../db/targets.ts'

export interface TargetsPort {
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
 * Rendre `null` plutôt que `NaN` distingue « pas un nombre » de « nombre refusé »,
 * qui ne méritent pas le même message.
 */
function lireCharge(saisie: string): number | null {
  const normalisee = saisie.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalisee)) return null
  const valeur = Number(normalisee)
  return Number.isFinite(valeur) ? valeur : null
}

function LigneCible({
  lift,
  targets,
  onAdjust,
  onRefus,
}: {
  lift: LiftKey
  targets: Targets
  onAdjust: (lift: LiftKey, patch: TargetPatch) => Promise<boolean>
  onRefus: (message: string) => void
}) {
  const definition = LIFTS[lift]
  const cible = targets[lift]
  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')

  const valider = async () => {
    const valeur = lireCharge(saisie)
    if (valeur === null) {
      onRefus('Entre une charge en chiffres, par exemple 77,5.')
      return
    }
    // Ne refermer le champ qu'en cas de succès : sur un refus, Ugo doit pouvoir
    // corriger ce qu'il vient de taper plutôt que de le ressaisir en entier.
    if (await onAdjust(lift, { w: valeur })) {
      setOuvert(false)
      setSaisie('')
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{definition.label}</p>
          <p className="text-sm text-muted">
            {cible.sets ? `${cible.sets}×${cible.reps}` : `1×${cible.reps} @RPE 8`}
          </p>
        </div>
        <p className="num shrink-0 text-2xl font-bold">
          {formatLoad(cible.w, definition.loadKind)}
        </p>
      </div>

      {cible.fail === null ? null : (
        <p className="mt-1 text-sm text-warn">
          Deuxième essai à {formatLoad(cible.fail, definition.loadKind)}. Un nouvel échec à cette
          charge la fera redescendre de 7,5 %.
        </p>
      )}

      {ouvert ? (
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-sm font-medium text-muted">
            Nouvelle cible (kg)
            <input
              className="num mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
              type="text"
              inputMode="decimal"
              value={saisie}
              autoFocus
              onChange={(event) => setSaisie(event.target.value)}
              aria-label={`Nouvelle cible ${definition.label}`}
            />
          </label>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
            onClick={() => void valider()}
          >
            Poser
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-medium text-muted"
            onClick={() => setOuvert(false)}
          >
            Annuler
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-fg"
            onClick={() => {
              setSaisie(String(cible.w).replace('.', ','))
              setOuvert(true)
            }}
          >
            Ajuster
          </button>
          {cible.fail === null ? null : (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted"
              onClick={() => void onAdjust(lift, { fail: null })}
            >
              Repartir à zéro
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function TargetsPanel({ targets, store }: { targets: Targets; store: TargetsPort }) {
  const [etat, setEtat] = useState<Targets>(targets)
  const [erreur, setErreur] = useState<string | null>(null)

  const ajuster = async (lift: LiftKey, patch: TargetPatch): Promise<boolean> => {
    setErreur(null)
    try {
      setEtat(await store.adjustTarget(lift, patch))
      return true
    } catch (error) {
      setErreur(messageOf(error))
      return false
    }
  }

  return (
    <section className="mx-auto w-full max-w-md py-4">
      <header>
        <h1 className="text-xl font-bold">Cibles</h1>
        <p className="mt-1 text-sm text-muted">
          Ce que l’app proposera la prochaine fois. Mises à jour le {formatDate(etat.updatedAt)}.
        </p>
      </header>

      <ul className="mt-4">
        {LIFT_ORDER.map((lift) => (
          <LigneCible
            key={lift}
            lift={lift}
            targets={etat}
            onAdjust={ajuster}
            onRefus={setErreur}
          />
        ))}
      </ul>

      <p className="min-h-6 text-sm text-bad" role="status" aria-live="polite">
        {erreur ?? ''}
      </p>

      <p className="mt-2 text-sm text-muted">
        Un ajustement remplace la valeur calculée : le moteur repart de là. Corriger une séance
        passée, en revanche, ne touche jamais les cibles.
      </p>
    </section>
  )
}
