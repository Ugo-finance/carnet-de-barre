/**
 * Navigation de l'app — CB-24.
 *
 * La séance est l'écran par défaut. Hors brouillon actif, une barre basse fixe garde
 * les quatre destinations accessibles même au bas des listes de consultation. Elle
 * disparaît pendant tout le parcours de séance, récapitulatif compris.
 */

import { useCallback, useEffect, useState } from 'react'
import { store } from './db/store'
import { BottomNav, type AppTab } from './components/BottomNav'
import { SessionHome } from './features/session/SessionHome'
import { SettingsPanel } from './features/export/SettingsPanel'
import { ProgressionPanel } from './features/history/ProgressionPanel'
import { HistoryPanel } from './features/history/HistoryPanel'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import type { Draft, Seance, Targets } from './domain/types'

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
  const [onglet, setOnglet] = useState<AppTab>('session')
  const [generationSeance, setGenerationSeance] = useState(0)
  const [sessionActive, setSessionActive] = useState(false)
  const handleSessionActiveChange = useCallback((active: boolean) => {
    setSessionActive(active)
    if (active) setOnglet('session')
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
        <div className="px-3">
          <UpdatePrompt store={store} />
        </div>
      )}

      <div className={sessionActive ? 'px-3' : 'px-3 pb-20'}>
        {/*
          La séance reste **montée** quand on la quitte, seulement masquée. Elle porte
          la saisie en cours ; la démonter en plein entraînement pour aller regarder une
          cible reviendrait à parier sur le fait qu'aucune sauvegarde n'est en vol. Le
          pari serait presque toujours gagné, et le jour où il ne l'est pas c'est une
          série perdue au milieu d'une séance.
        */}
        <div hidden={onglet !== 'session'}>
          <SessionHome
            key={generationSeance}
            store={store}
            onSessionActiveChange={handleSessionActiveChange}
            onViewHistory={() => {
              setSessionActive(false)
              setOnglet('history')
            }}
          />
        </div>
        {/*
          Les deux autres se remontent à chaque ouverture, et c'est voulu : leurs
          données changent quand une séance se termine. Réafficher l'état d'avant
          montrerait des cibles périmées juste après le récapitulatif qui les annonce.
        */}
        {onglet === 'history' ? <HistoriqueTab /> : null}
        {onglet === 'progress' ? (
          <ProgressionTab onAdjusted={() => setGenerationSeance((n) => n + 1)} />
        ) : null}
        {onglet === 'settings' ? (
          <SettingsPanel
            store={store}
            onPreferencesChange={() => setGenerationSeance((n) => n + 1)}
          />
        ) : null}
      </div>
      {sessionActive ? null : <BottomNav active={onglet} onSelect={setOnglet} />}
    </div>
  )
}
