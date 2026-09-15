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

import { useCallback, useEffect, useState } from 'react'
import { store } from './db/store'
import { SessionHome } from './features/session/SessionHome'
import { ExportPanel } from './features/export/ExportPanel'
import { ProgressionPanel } from './features/history/ProgressionPanel'
import { HistoryPanel } from './features/history/HistoryPanel'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import type { Draft, Seance, Targets } from './domain/types'

type Onglet = 'seance' | 'historique' | 'progression' | 'export'

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'seance', label: 'Séance' },
  { id: 'historique', label: 'Historique' },
  { id: 'progression', label: 'Progression' },
  { id: 'export', label: 'Export' },
]

/**
 * La progression est chargée à la demande, pas au démarrage.
 *
 * `ProgressionPanel` reçoit les cibles en valeur initiale et suit ensuite ses propres
 * ajustements. Les recharger à chaque ouverture de l'onglet évite d'afficher une
 * valeur périmée après une finalisation de séance — et l'historique voyage avec, car
 * c'est lui qui porte les records de CB-13.
 *
 * Le brouillon est passé **tel quel** plutôt qu'un booléen « verrouillé » : c'est
 * `resumeProgression` qui décide si l'ajustement est possible, via `isDraftActive`.
 * Recopier la règle ici en ferait deux, et c'est la copie qui dériverait — le motif
 * exact des trois P1 de la journée.
 */
function ProgressionTab({ onAdjusted }: { onAdjusted: () => void }) {
  const [donnees, setDonnees] = useState<{
    targets: Targets
    seances: Seance[]
    draft: Draft | undefined
  }>()
  const [erreur, setErreur] = useState<string>()

  useEffect(() => {
    let actif = true
    Promise.all([store.getTargets(), store.listSeances(), store.loadDraft()]).then(
      ([targets, seances, draft]) => {
        if (actif) setDonnees({ targets, seances, draft })
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
        Progression indisponible : {erreur}
      </p>
    )
  }
  if (!donnees) {
    return (
      <p className="mx-auto max-w-md py-6 text-sm text-muted" role="status">
        Lecture de ta progression…
      </p>
    )
  }
  return (
    <ProgressionPanel
      targets={donnees.targets}
      seances={donnees.seances}
      draft={donnees.draft}
      store={{
        adjustTarget: async (lift, patch) => {
          const suivantes = await store.adjustTarget(lift, patch)
          // `SessionHome` garde l'aperçu chargé au montage. Le remonter après un
          // ajustement garantit que le démarrage atomique reçoit les cibles à jour.
          onAdjusted()
          return suivantes
        },
      }}
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
  const [sessionActive, setSessionActive] = useState(false)
  const handleSessionActiveChange = useCallback((active: boolean) => {
    setSessionActive(active)
    if (active) setOnglet('seance')
  }, [])

  return (
    /*
     * Pendant une séance, l'enveloppe tient la hauteur de la vue — c'est ce qui fait
     * que l'écran ne défile pas, conformément à l'arbitrage § 1.7 du contrat.
     *
     * Elle la tient avec `overflow-y-auto`, et non `overflow-hidden`. La nuance est
     * celle qui a coûté une séance à Ugo le 15.09 : `hidden` n'empêche pas le contenu
     * de dépasser, il empêche de le voir. Sur son iPhone 15 Pro dans un onglet Safari —
     * 393 × 659, et non les 759 px de la PWA installée — la carte de série mesurait
     * 734 px : « Valider » occupait y = 655 à 701, hors de la vue, et
     * `window.scrollTo(0, 9999)` ne bougeait rien. Le bouton principal de l'app était
     * inatteignable, sans aucun signe qu'il existait.
     *
     * `auto` ne rend pas la barre de défilement quand tout tient : la règle « aucun
     * écran ne scrolle » reste tenue dans le cas nominal. Elle cesse seulement d'être
     * tenue par la disparition de ce qui dépasse. Un écran trop court, un texte iOS
     * agrandi ou un exercice plus bavard rendent le contenu accessible au lieu de le
     * faire disparaître.
     */
    <div className={sessionActive ? 'h-dvh overflow-y-auto' : 'min-h-dvh'}>
      {sessionActive ? null : (
        <>
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
        </>
      )}

      <div className="px-3">
        {/*
          La séance reste **montée** quand on la quitte, seulement masquée. Elle porte
          la saisie en cours ; la démonter en plein entraînement pour aller regarder une
          cible reviendrait à parier sur le fait qu'aucune sauvegarde n'est en vol. Le
          pari serait presque toujours gagné, et le jour où il ne l'est pas c'est une
          série perdue au milieu d'une séance.
        */}
        <div hidden={onglet !== 'seance'}>
          <SessionHome
            key={generationSeance}
            store={store}
            onSessionActiveChange={handleSessionActiveChange}
            onViewHistory={() => setOnglet('historique')}
          />
        </div>
        {/*
          Les deux autres se remontent à chaque ouverture, et c'est voulu : leurs
          données changent quand une séance se termine. Réafficher l'état d'avant
          montrerait des cibles périmées juste après le récapitulatif qui les annonce.
        */}
        {onglet === 'historique' ? <HistoriqueTab /> : null}
        {onglet === 'progression' ? (
          <ProgressionTab onAdjusted={() => setGenerationSeance((n) => n + 1)} />
        ) : null}
        {onglet === 'export' ? <ExportPanel store={store} /> : null}
      </div>
    </div>
  )
}
