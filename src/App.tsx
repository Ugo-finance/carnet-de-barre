/**
 * Navigation de l'app — CB-24.
 *
 * Trois écrans, et c'est tout ce qu'il en faut. La séance est l'écran par défaut
 * parce que c'est le seul qu'Ugo ouvre les mains sur une barre ; les deux autres se
 * consultent posément, une fois de temps en temps.
 *
 * La navigation vit en haut et **défile avec la page** au lieu d'être fixée : une
 * barre fixe mangerait de la hauteur sur chaque série, et la série est ce qu'il
 * regarde. Elle reste à un pouce de distance en remontant.
 */

import { useEffect, useState } from 'react'
import { store } from './db/store'
import { SessionHome } from './features/session/SessionHome'
import { ExportPanel } from './features/export/ExportPanel'
import { TargetsPanel } from './features/history/TargetsPanel'
import { HistoryPanel } from './features/history/HistoryPanel'
import { isBlankDraft } from './db/draft'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import type { Seance, Targets } from './domain/types'

type Onglet = 'seance' | 'historique' | 'cibles' | 'export'

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'seance', label: 'Séance' },
  { id: 'historique', label: 'Historique' },
  { id: 'cibles', label: 'Cibles' },
  { id: 'export', label: 'Export' },
]

/**
 * Les cibles sont chargées à la demande, pas au démarrage.
 *
 * `TargetsPanel` les reçoit en valeur initiale et suit ensuite ses propres
 * ajustements. Les recharger à chaque ouverture de l'onglet évite d'afficher une
 * valeur périmée après une finalisation de séance.
 */
function CiblesTab({ onAdjusted }: { onAdjusted: () => void }) {
  const [targets, setTargets] = useState<Targets>()
  const [verrouille, setVerrouille] = useState(true)
  const [erreur, setErreur] = useState<string>()

  useEffect(() => {
    let actif = true
    Promise.all([store.getTargets(), store.loadDraft()]).then(
      ([valeur, brouillon]) => {
        if (!actif) return
        setTargets(valeur)
        // Une séance **commencée** interdit l'ajustement : `finalizeSeance` refuserait
        // ensuite d'écrire, et aucun écran ne sait rebaser un brouillon. Ugo devrait
        // abandonner toute sa saisie pour sortir de l'impasse.
        //
        // Un brouillon **vierge** n'est pas une séance : l'écran d'accueil en ouvre un
        // dès l'affichage, y compris juste après une finalisation. Le magasin sait le
        // reconstruire sur les nouvelles cibles ; verrouiller ici l'en empêcherait.
        setVerrouille(brouillon !== undefined && !isBlankDraft(brouillon))
      },
      (cause: unknown) =>
        actif && setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.'),
    )
    return () => {
      actif = false
    }
  }, [])

  if (erreur) {
    return (
      <p className="mx-auto max-w-md py-6 text-sm text-bad" role="alert">
        Cibles indisponibles : {erreur}
      </p>
    )
  }
  if (!targets) {
    return (
      <p className="mx-auto max-w-md py-6 text-sm text-muted" role="status">
        Lecture des cibles…
      </p>
    )
  }
  return (
    <TargetsPanel
      targets={targets}
      store={{
        adjustTarget: async (lift, patch) => {
          const suivantes = await store.adjustTarget(lift, patch)
          // Le magasin a pu reconstruire le brouillon vierge. `SessionHome` reste
          // monté et tient encore l'ancien en mémoire : sans remontage, sa prochaine
          // sauvegarde réécrirait les anciennes `baseTargets` par-dessus, et la
          // finalisation lèverait `stale-targets`. Le remonter ne coûte rien —
          // l'ajustement n'était possible que parce que le brouillon était vierge.
          onAdjusted()
          return suivantes
        },
      }}
      verrouille={verrouille}
    />
  )
}

/**
 * L'historique se relit à chaque ouverture de l'onglet : c'est là qu'Ugo vient
 * vérifier qu'une séance vient d'être enregistrée, donc afficher une liste d'avant
 * la finalisation serait répondre le contraire de la vérité.
 */
function HistoriqueTab() {
  const [seances, setSeances] = useState<Seance[]>()
  const [erreur, setErreur] = useState<string>()

  useEffect(() => {
    let actif = true
    store.listSeances().then(
      (valeur) => actif && setSeances(valeur),
      (cause: unknown) =>
        actif && setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.'),
    )
    return () => {
      actif = false
    }
  }, [])

  if (erreur) {
    return (
      <p className="mx-auto max-w-md py-6 text-sm text-bad" role="alert">
        Historique indisponible : {erreur}
      </p>
    )
  }
  if (!seances) {
    return (
      <p className="mx-auto max-w-md py-6 text-sm text-muted" role="status">
        Lecture de l’historique…
      </p>
    )
  }
  return <HistoryPanel seances={seances} store={store} />
}

export default function App() {
  const [onglet, setOnglet] = useState<Onglet>('seance')
  const [generationSeance, setGenerationSeance] = useState(0)

  return (
    <div className="min-h-dvh">
      <nav
        className="mx-auto flex w-full max-w-md gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
        aria-label="Sections"
      >
        {ONGLETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={onglet === id ? 'page' : undefined}
            className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold ${
              onglet === id
                ? 'bg-accent text-bg'
                : 'border border-line text-muted hover:text-fg focus:text-fg'
            }`}
            onClick={() => setOnglet(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3">
        <UpdatePrompt store={store} />
      </div>

      <div className="px-3">
        {/*
          La séance reste **montée** quand on la quitte, seulement masquée. Elle porte
          la saisie en cours ; la démonter en plein entraînement pour aller regarder une
          cible reviendrait à parier sur le fait qu'aucune sauvegarde n'est en vol. Le
          pari serait presque toujours gagné, et le jour où il ne l'est pas c'est une
          série perdue au milieu d'une séance.
        */}
        <div hidden={onglet !== 'seance'}>
          <SessionHome key={generationSeance} store={store} />
        </div>
        {/*
          Les deux autres se remontent à chaque ouverture, et c'est voulu : leurs
          données changent quand une séance se termine. Réafficher l'état d'avant
          montrerait des cibles périmées juste après le récapitulatif qui les annonce.
        */}
        {onglet === 'historique' ? <HistoriqueTab /> : null}
        {onglet === 'cibles' ? (
          <CiblesTab onAdjusted={() => setGenerationSeance((n) => n + 1)} />
        ) : null}
        {onglet === 'export' ? <ExportPanel store={store} /> : null}
      </div>
    </div>
  )
}
