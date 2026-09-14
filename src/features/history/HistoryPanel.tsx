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
import { formatDate, formatNumber } from '../../domain/format.ts'
import { findExercise } from '../../domain/program.ts'
import { removeSet, reviseSet, type SetPatch } from '../../db/edit.ts'
import { grouperParSemaine, type SemaineGroupee } from '../../domain/semaine.ts'
import type { Seance, SetLog } from '../../domain/types.ts'

export interface HistoryPort {
  updateSeance(id: string, patch: Partial<Omit<Seance, 'id'>>): Promise<Seance>
  deleteSeance(id: string): Promise<void>
}

/**
 * L'intitulé d'une semaine, bornes comprises.
 *
 * Une date seule — « Semaine du 14.09 » — obligerait Ugo à compter pour savoir si sa
 * séance de dimanche est dedans. Les deux bornes le disent sans calcul, et l'année ne
 * figure qu'une fois puisque la semaine ne peut en enjamber qu'au plus une.
 */
function libelleSemaine(semaine: SemaineGroupee): string {
  const [jourLundi, moisLundi, anneeLundi] = formatDate(semaine.lundi).split('.')
  const fin = formatDate(semaine.dimanche)
  const debut = fin.endsWith(anneeLundi)
    ? `${jourLundi}.${moisLundi}`
    : `${jourLundi}.${moisLundi}.${anneeLundi}`
  return `Semaine du ${debut} au ${fin}`
}

/** Le libellé qu'Ugo reconnaît : l'exercice, puis le rôle de la série. */
function libelleSerie(set: SetLog): string {
  const exercice = findExercise(set.exerciseId)?.label ?? set.exerciseId
  const role =
    set.role === 'top'
      ? 'top set'
      : set.role === 'backoff'
        ? `backoff ${set.index + 1}`
        : `série ${set.index + 1}`
  return `${exercice} — ${role}`
}

function nombreOuVide(valeur: number | null): string {
  return valeur === null ? '' : formatNumber(valeur)
}

/**
 * `null` pour un champ vide — « non noté », qui n'est pas zéro : un RPE absent n'est
 * pas un RPE de 0. `undefined` pour une saisie illisible, qu'on refuse d'interpréter.
 */
function lireChamp(saisie: string): number | null | undefined {
  const normalisee = saisie.trim().replace(',', '.')
  if (normalisee === '') return null
  if (!/^\d+(?:\.\d+)?$/.test(normalisee)) return undefined
  return Number(normalisee)
}

/**
 * Corrige une série déjà enregistrée.
 *
 * Les champs partent de la valeur en base : la correction la plus fréquente est d'un
 * chiffre, pas d'une ligne entière. Une valeur laissée vide vaut « non noté », ce qui
 * est différent de zéro — un RPE absent n'est pas un RPE de 0.
 */
function EditeurSerie({
  set,
  onSave,
  onRemove,
  onCancel,
  occupe,
}: {
  set: SetLog
  onSave: (patch: SetPatch) => void
  onRemove: () => void
  onCancel: () => void
  occupe: boolean
}) {
  const [poids, setPoids] = useState(nombreOuVide(set.weight))
  const [reps, setReps] = useState(nombreOuVide(set.reps))
  const [rpe, setRpe] = useState(nombreOuVide(set.rpe))
  const [confirmeRetrait, setConfirmeRetrait] = useState(false)
  const [saisieInvalide, setSaisieInvalide] = useState(false)

  const enregistrer = () => {
    const valeurs = { weight: lireChamp(poids), reps: lireChamp(reps), rpe: lireChamp(rpe) }
    // Sortir en silence serait le pire retour possible : Ugo taperait « Enregistrer »
    // et rien ne se passerait, sans qu'aucun écran ne dise pourquoi.
    if (Object.values(valeurs).includes(undefined)) {
      setSaisieInvalide(true)
      return
    }
    setSaisieInvalide(false)
    onSave(valeurs as SetPatch)
  }

  const champ = (
    label: string,
    valeur: string,
    set2: (v: string) => void,
    mode: 'decimal' | 'numeric',
  ) => (
    <label className="flex-1 text-xs font-medium text-muted">
      {label}
      <input
        className="num mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-2 text-base text-fg outline-none focus:border-accent"
        type="text"
        inputMode={mode}
        value={valeur}
        aria-label={`${label} — ${libelleSerie(set)}`}
        onChange={(event) => set2(event.target.value)}
      />
    </label>
  )

  return (
    <div className="mt-2 rounded-xl border border-line p-3">
      <p className="text-sm font-semibold">{libelleSerie(set)}</p>
      <div className="mt-2 flex gap-2">
        {set.loadKind === 'bodyweight' ? null : champ('Charge', poids, setPoids, 'decimal')}
        {champ('Reps', reps, setReps, 'numeric')}
        {champ('RPE', rpe, setRpe, 'decimal')}
      </div>
      {saisieInvalide ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          Entre des nombres, par exemple 92,5 — ou laisse vide si tu n’as pas noté.
        </p>
      ) : null}

      {confirmeRetrait ? (
        /*
         * Retirer une série est irréversible et ces données n'existent nulle part
         * ailleurs. Supprimer une séance entière demande déjà un second geste ; il
         * n'y a aucune raison qu'en retirer une part en demande moins.
         */
        <div className="mt-3 rounded-xl border border-bad/60 p-3" role="alert">
          <p className="text-sm font-semibold text-bad">Retirer cette série ?</p>
          <p className="mt-1 text-sm text-muted">
            Elle disparaîtra de la séance et du résumé. Tes cibles ne changeront pas — pour les
            corriger, passe par l’onglet Progression.
          </p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-accent px-3 text-sm font-semibold text-bg"
              onClick={() => setConfirmeRetrait(false)}
            >
              Garder la série
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-bad disabled:opacity-50"
              disabled={occupe}
              onClick={onRemove}
            >
              {occupe ? 'Retrait…' : 'Retirer définitivement'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-3 text-sm font-semibold text-bg disabled:opacity-50"
            disabled={occupe}
            onClick={enregistrer}
          >
            Enregistrer
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-muted"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-bad"
            onClick={() => setConfirmeRetrait(true)}
          >
            Retirer
          </button>
        </div>
      )}
    </div>
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
  const [serieEnCours, setSerieEnCours] = useState<string>()
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

  const corrigerSerie = async (calcul: () => Pick<Seance, 'sets' | 'lines' | 'tops'>) => {
    setOccupe(true)
    setErreur(undefined)
    try {
      onChange(await store.updateSeance(seance.id, calcul()))
      setSerieEnCours(undefined)
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

          {seance.sets && seance.sets.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              {serieEnCours === undefined ? (
                <>
                  <p className="text-xs font-medium text-muted">Corriger une série</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {seance.sets.map((set) => (
                      <button
                        key={set.id}
                        type="button"
                        className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-fg"
                        onClick={() => setSerieEnCours(set.id)}
                      >
                        {libelleSerie(set)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <EditeurSerie
                  set={seance.sets.find((set) => set.id === serieEnCours)!}
                  occupe={occupe}
                  onCancel={() => setSerieEnCours(undefined)}
                  onSave={(patch) =>
                    void corrigerSerie(() => reviseSet(seance, serieEnCours, patch))
                  }
                  onRemove={() => void corrigerSerie(() => removeSet(seance, serieEnCours))}
                />
              )}
            </div>
          ) : null}

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
                les corriger, passe par l’onglet Progression.
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
  const semaines = grouperParSemaine(etat)
  const total = etat.length

  return (
    <section className="mx-auto w-full max-w-md py-4">
      {/*
       * L'en-tête reste au-dessus du défilement. L'historique est l'une des deux
       * exceptions à « aucun écran ne scrolle » (contrat § 1.7) : sa longueur dépend
       * des données, pas du parcours. L'exception porte sur la liste, pas sur le
       * repère — sans en-tête collé, Ugo scrolle trois semaines et ne sait plus dans
       * quel écran il est.
       */}
      <header className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-3">
        <h1 className="text-xl font-bold">Historique</h1>
        <p className="mt-1 text-sm text-muted">
          {total === 0
            ? 'Aucune séance enregistrée pour le moment.'
            : `${total} séance${total > 1 ? 's' : ''} enregistrée${total > 1 ? 's' : ''}, sur ${
                semaines.length
              } semaine${semaines.length > 1 ? 's' : ''}.`}
        </p>
      </header>

      {/*
       * L'avertissement est permanent, et non replié derrière un geste : c'est la règle
       * que cet écran viole le plus facilement dans l'esprit d'Ugo. Corriger une séance
       * ressemble à « annuler ce qui s'est passé », alors que D6 dit que les cibles ne
       * bougent pas. Le dire au moment de la suppression ne suffisait pas — il faut
       * l'avoir lu **avant** de commencer à corriger, pas après avoir décidé.
       */}
      {total === 0 ? null : (
        <p
          className="mt-3 rounded-xl border border-warn/60 bg-warn/10 p-3 text-sm text-fg"
          role="note"
        >
          Corriger ou supprimer une séance passée ne recalcule <strong>jamais</strong> tes cibles.
          Elles reflètent ce que tu sais faire, pas le contenu de cette liste. Pour les changer,
          passe par <strong>Progression</strong>.
        </p>
      )}

      <div className="mt-4 grid gap-5">
        {semaines.map((semaine, rangSemaine) => (
          <section key={semaine.lundi} aria-label={libelleSemaine(semaine)}>
            <h2 className="flex items-baseline justify-between gap-2 text-sm font-bold text-muted">
              <span>{libelleSemaine(semaine)}</span>
              <span className="num shrink-0 font-semibold">
                {semaine.seances.length} séance{semaine.seances.length > 1 ? 's' : ''}
              </span>
            </h2>
            <ul className="mt-2 grid gap-2">
              {semaine.seances.map((seance, rang) => (
                <LigneSeance
                  key={seance.id}
                  seance={seance}
                  ouvertParDefaut={rangSemaine === 0 && rang === 0}
                  store={store}
                  onChange={(suivante) =>
                    setEtat((liste) => liste.map((s) => (s.id === suivante.id ? suivante : s)))
                  }
                  onDelete={(id) => setEtat((liste) => liste.filter((s) => s.id !== id))}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
