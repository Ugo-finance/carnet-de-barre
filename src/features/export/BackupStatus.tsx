import { useState, useSyncExternalStore } from 'react'
import type { EtatMoteur, MoteurSauvegarde } from '../../sync/moteur'

type StatusMotor = Pick<MoteurSauvegarde, 'etat' | 'abonner' | 'demander' | 'oublierReconstitution'>

function description(state: EtatMoteur): string {
  switch (state.etat) {
    case 'deconnecte':
      return 'Connecte-toi pour sauvegarder ce carnet. Aucune sauvegarde confirmée dans cette session.'
    case 'en-cours':
      return 'Vérification ou envoi de la sauvegarde en cours… Continue à utiliser le carnet.'
    case 'en-attente':
      return 'Enregistré sur ce téléphone. Sauvegarde en attente : ' + state.erreur
    case 'a-jour':
      return state.revision === null
        ? 'Aucune sauvegarde distante confirmée.'
        : 'Carnet sauvegardé. Révision distante confirmée : ' + state.revision + '.'
    case 'decision':
      switch (state.action.type) {
        case 'proposer-restauration':
          return 'Une sauvegarde différente est disponible. Aucune donnée n’a été remplacée.'
        case 'conflit':
          return 'Les deux carnets ont changé. Sauvegarde suspendue tant que le conflit n’est pas résolu. Tes données locales restent utilisables.'
        case 'sauvegarde-reculee':
          return 'La sauvegarde distante est revenue à une version antérieure. Envoi suspendu ; tes données locales restent sur ce téléphone.'
        case 'sauvegarde-disparue':
          return 'La sauvegarde distante a disparu. Aucune sauvegarde actuelle n’est confirmée.'
        default:
          return 'La sauvegarde attend une vérification. Aucune nouvelle réussite confirmée.'
      }
  }
}

/** Affiche exclusivement l'état publié par le moteur, jamais une réussite supposée. */
export function BackupStatus({ moteur }: { moteur: StatusMotor }) {
  const state = useSyncExternalStore(moteur.abonner, moteur.etat, moteur.etat)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const acknowledge = async () => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await moteur.oublierReconstitution()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confirmation impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Le formulaire sert déjà de message et d’action dans l’état déconnecté.
  // Un second encart repousserait sa commande hors de la petite vue Safari.
  if (state.etat === 'deconnecte') return null

  return (
    <div
      className="mt-2 rounded-xl border border-line bg-bg p-2"
      aria-label="État de la sauvegarde"
    >
      <h3 className="font-semibold">État distant</h3>
      <p className="mt-1 text-sm leading-5" role="status" aria-live="polite">
        {description(state)}
      </p>
      {state.etat === 'a-jour' && state.reconstitution ? (
        <div className="mt-3 rounded-xl border border-warn/60 p-3">
          <p className="text-sm">
            La sauvegarde distante avait disparu après la révision{' '}
            {state.reconstitution.revisionDisparue}. Elle a été reconstituée par un nouvel envoi.
          </p>
          <button
            type="button"
            className="mt-3 min-h-11 w-full rounded-xl border border-line px-3 font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void acknowledge()}
          >
            J’ai compris
          </button>
        </div>
      ) : null}
      {state.etat === 'en-attente' ? (
        <button
          type="button"
          className="mt-3 min-h-11 w-full rounded-xl border border-line px-3 font-semibold"
          onClick={() => moteur.demander()}
        >
          Réessayer la sauvegarde
        </button>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
