import { useEffect, useRef, useState } from 'react'
import { SessionScreen } from '../../components/SessionScreen'
import type { CarnetStore, FinalizeResult } from '../../db/contracts'
import {
  currentSession,
  describeWhen,
  type SeanceFaite,
  todayInZurich,
  type UpcomingSession,
} from '../../domain/schedule'
import type { Draft, SeanceType } from '../../domain/types'
import { useDraftEditor } from './useDraftEditor'
import { unlockTimerAudio, useWakeLock } from './timer'
import { SessionSummary } from './SessionSummary'

export type SessionStore = Pick<
  CarnetStore,
  'listSeances' | 'loadDraft' | 'openDraft' | 'saveDraft' | 'clearDraft' | 'finalizeSeance'
> & { ready(): Promise<void> }

type ReadyState = {
  draft: Draft
  suggestion: UpcomingSession
  today: string
  /**
   * L'historique réduit à ce dont la rotation a besoin. Il est chargé une fois au
   * démarrage et sert aux deux endroits qui décident de la séance suivante : l'ouverture
   * de l'écran et le récapitulatif de fin. Les faire diverger donnerait deux réponses
   * différentes à la même question dans la même minute.
   */
  seances: SeanceFaite[]
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "L'accès au carnet a échoué."
}

function whenLabel(draft: Draft, suggestion: UpcomingSession, today: string): string {
  if (draft.type === suggestion.type && draft.date === suggestion.scheduledDate)
    return describeWhen(suggestion)
  if (draft.date !== today) return 'Séance à reprendre'
  // Depuis CB-44, l'app propose le créneau suivant dès que celui du jour est servi :
  // faire mardi un dimanche est devenu le parcours normal, pas une sortie de route.
  // Le confondre avec « hors rotation » — un type choisi à la main — mentirait sur
  // ce qu'Ugo est en train de faire.
  if (draft.type === suggestion.type) return "Aujourd'hui · en avance"
  return "Aujourd'hui · hors rotation"
}

function SessionEditor({
  state,
  store,
  now,
  onReplace,
}: {
  state: ReadyState
  store: SessionStore
  now: Date
  onReplace: (type: SeanceType) => Promise<void>
}) {
  const editor = useDraftEditor(store, state.draft)
  const [pendingType, setPendingType] = useState<SeanceType>()
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string>()
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string>()
  const [result, setResult] = useState<FinalizeResult>()
  const [confirmFinish, setConfirmFinish] = useState(false)
  const finalizingRef = useRef(false)
  const keepAwake = editor.draft?.keepAwake ?? false
  useWakeLock(keepAwake, Boolean(editor.draft) && !result)

  if (editor.loadError) {
    return <StatusScreen message={`Brouillon indisponible : ${editor.loadError.message}`} error />
  }
  if (editor.loading || !editor.draft) return <StatusScreen message="Chargement de la séance…" />

  const draft = editor.draft

  if (result) {
    // La séance qu'on vient d'enregistrer compte, sans attendre un rechargement.
    // `currentSession` reçoit l'historique entier : c'est lui qui décide quel créneau
    // est servi, y compris un jour creux où aucune séance n'est prévue.
    const apres = [...state.seances, { date: result.seance.date, type: result.seance.type }]
    return <SessionSummary result={result} next={currentSession(now, apres)} />
  }

  const replace = async () => {
    if (!pendingType) return
    setSwitching(true)
    setSwitchError(undefined)
    try {
      await editor.flush()
      await onReplace(pendingType)
    } catch (error) {
      setSwitchError(messageFor(error))
      setSwitching(false)
    }
  }

  const finish = async () => {
    if (finalizingRef.current) return
    finalizingRef.current = true
    setFinalizing(true)
    setFinalizeError(undefined)
    try {
      await editor.flush()
      setResult(await store.finalizeSeance(draft.id))
    } catch (error) {
      setFinalizeError(messageFor(error))
    } finally {
      finalizingRef.current = false
      setFinalizing(false)
    }
  }

  const unfinishedCount = draft.sets.filter(
    (set) => set.status !== 'validated' && set.status !== 'skipped',
  ).length
  const requestFinish = () => {
    if (unfinishedCount > 0) setConfirmFinish(true)
    else void finish()
  }

  return (
    <>
      <SessionScreen
        draft={draft}
        whenLabel={whenLabel(draft, state.suggestion, state.today)}
        onSelectType={(type) => setPendingType(type === draft.type ? undefined : type)}
        onSetChange={editor.updateSet}
        onSetValidate={(setId, value, timer) => {
          unlockTimerAudio()
          editor.validateSet(setId, value, timer)
        }}
        onAccessoryChange={editor.updateAccessory}
        onNotesChange={editor.updateNotes}
        onTimerAdjust={editor.adjustTimer}
        keepAwake={keepAwake}
        onKeepAwakeChange={editor.updateKeepAwake}
        onTimerStop={editor.stopTimer}
        onFinish={requestFinish}
        finishing={finalizing}
        finishErrorMessage={
          finalizeError ? `Enregistrement impossible : ${finalizeError}` : undefined
        }
        errorMessage={
          editor.saveError ? `Sauvegarde impossible : ${editor.saveError.message}` : undefined
        }
      />

      {pendingType ? (
        <div
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-title"
        >
          <h2 className="font-bold" id="switch-title">
            Séance {draft.type} en cours
          </h2>
          <p className="mt-1 text-sm text-muted">
            Reprends-la, ou abandonne-la explicitement avant d’ouvrir la séance {pendingType}.
          </p>
          {switchError ? (
            <p className="mt-2 text-sm text-bad" role="alert">
              {switchError}
            </p>
          ) : null}
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
              onClick={() => setPendingType(undefined)}
            >
              Continuer la séance {draft.type}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-4 font-semibold text-fg"
              onClick={() => void replace()}
              disabled={switching}
            >
              {switching ? 'Ouverture…' : `Abandonner et ouvrir ${pendingType}`}
            </button>
          </div>
        </div>
      ) : null}

      {confirmFinish ? (
        <div
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-sm rounded-2xl border border-warn/60 bg-surface p-4 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-title"
        >
          <h2 className="font-bold" id="finish-title">
            Séance incomplète
          </h2>
          <p className="mt-1 text-sm text-muted">
            {unfinishedCount}{' '}
            {unfinishedCount === 1 ? 'série n’est pas validée' : 'séries ne sont pas validées'}.
            Leurs charges et répétitions ne seront pas enregistrées. Termine-les ou marque-les comme
            sautées avant de continuer.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-bg"
              onClick={() => setConfirmFinish(false)}
            >
              Revenir à la séance
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line px-4 font-semibold text-fg"
              onClick={() => {
                setConfirmFinish(false)
                void finish()
              }}
            >
              Terminer quand même
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function StatusScreen({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center py-6">
      <div
        className="w-full rounded-2xl border border-line bg-surface p-5"
        role={error ? 'alert' : 'status'}
      >
        <h1 className="text-xl font-bold">Carnet de barre</h1>
        <p className={`mt-2 text-sm ${error ? 'text-bad' : 'text-muted'}`}>{message}</p>
      </div>
    </main>
  )
}

export function SessionHome({ store, now = new Date() }: { store: SessionStore; now?: Date }) {
  const [state, setState] = useState<ReadyState>()
  const [error, setError] = useState<string>()
  const boot = useRef<Promise<ReadyState> | undefined>(undefined)
  const storeValue = useRef(store)
  const nowValue = useRef(now)

  useEffect(() => {
    let active = true
    boot.current ??= (async () => {
      await storeValue.current.ready()
      const [existing, seances] = await Promise.all([
        storeValue.current.loadDraft(),
        storeValue.current.listSeances(),
      ])
      const today = todayInZurich(nowValue.current)
      const faites: SeanceFaite[] = seances.map((seance) => ({
        date: seance.date,
        type: seance.type,
      }))
      const suggestion = currentSession(nowValue.current, faites)
      const draft = existing ?? (await storeValue.current.openDraft(suggestion.type, today))
      return { draft, suggestion, today, seances: faites }
    })()

    void boot.current.then(
      (ready) => {
        if (active) setState(ready)
      },
      (reason: unknown) => {
        if (active) setError(messageFor(reason))
      },
    )
    return () => {
      active = false
    }
  }, [])

  if (error) return <StatusScreen message={`Carnet indisponible : ${error}`} error />
  if (!state) return <StatusScreen message="Préparation de ta séance…" />

  const replace = async (type: SeanceType) => {
    await store.clearDraft()
    const draft = await store.openDraft(type, state.today)
    setState((current) => (current ? { ...current, draft } : current))
  }

  return (
    <SessionEditor key={state.draft.id} state={state} store={store} now={now} onReplace={replace} />
  )
}
