import { useEffect, useRef, useState } from 'react'
import { SessionScreen } from '../../components/SessionScreen'
import type { CarnetStore, FinalizeResult } from '../../db/contracts'
import { apercuSeance, resumeAccueil, type ResumeAccueil } from '../../db/selectors'
import { formatDate } from '../../domain/format'
import type { Preferences } from '../../domain/preferences'
import {
  currentSession,
  describeWhen,
  type SeanceFaite,
  todayInZurich,
  type UpcomingSession,
} from '../../domain/schedule'
import type { Draft, Seance, SeanceType, Targets } from '../../domain/types'
import { useDraftEditor } from './useDraftEditor'
import { unlockTimerAudio, useWakeLock } from './timer'
import { SessionEntryStatus } from './SessionEntryStatus'
import { SessionLanding } from './SessionLanding'
import { SessionResume } from './SessionResume'
import { SessionSummary } from './SessionSummary'

export type SessionStore = Pick<
  CarnetStore,
  | 'getTargets'
  | 'listSeances'
  | 'loadDraft'
  | 'startSession'
  | 'saveDraft'
  | 'clearDraft'
  | 'finalizeSeance'
  | 'getPreferences'
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

type EntryData = {
  draft: Draft | undefined
  seances: Seance[]
  targets: Targets
  preferences: Preferences
  resume: ResumeAccueil
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "L'accès au carnet a échoué."
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
}: {
  state: ReadyState
  store: SessionStore
  now: Date
}) {
  const editor = useDraftEditor(store, state.draft)
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

function editorState(entry: EntryData, draft: Draft, now: Date): ReadyState {
  const seances = entry.seances.map(({ date, type }) => ({ date, type }))
  return {
    draft,
    suggestion: currentSession(now, seances),
    today: todayInZurich(now),
    seances,
  }
}

function updatedLabel(timestamp: number): string {
  const instant = new Date(timestamp)
  const heure = new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant)
  return `${formatDate(todayInZurich(instant))} à ${heure}`
}

function SessionHomeAttempt({
  store,
  now,
  onRetry,
}: {
  store: SessionStore
  now: Date
  onRetry: () => void
}) {
  const [entry, setEntry] = useState<EntryData>()
  const [selectedType, setSelectedType] = useState<SeanceType>()
  const [rushed, setRushed] = useState(false)
  const [focusedDraft, setFocusedDraft] = useState<Draft>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [starting, setStarting] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const operation = useRef(false)
  const storeValue = useRef(store)
  const nowValue = useRef(now)

  useEffect(() => {
    let active = true

    const boot = (async (): Promise<EntryData> => {
      await storeValue.current.ready()
      const [draft, seances, targets, preferences] = await Promise.all([
        storeValue.current.loadDraft(),
        storeValue.current.listSeances(),
        storeValue.current.getTargets(),
        storeValue.current.getPreferences(),
      ])
      return {
        draft,
        seances,
        targets,
        preferences,
        resume: resumeAccueil({ draft, seances, targets, now: nowValue.current }),
      }
    })()

    void boot.then(
      (ready) => {
        if (!active) return
        setEntry(ready)
        setSelectedType(ready.resume.type)
        setRushed(ready.preferences.modePresseParDefaut)
        setFocusedDraft(undefined)
        setLoading(false)
      },
      (reason: unknown) => {
        if (!active) return
        setError(messageFor(reason))
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [])

  if (loading) return <SessionEntryStatus status="loading" />
  if (error || !entry) {
    return (
      <SessionEntryStatus
        status="error"
        message={error ?? "L'accès au carnet a échoué."}
        onRetry={onRetry}
      />
    )
  }

  if (focusedDraft) {
    return (
      <SessionEditor
        key={focusedDraft.id}
        state={editorState(entry, focusedDraft, now)}
        store={store}
        now={now}
      />
    )
  }

  if (entry.resume.etat === 'en-cours' && entry.draft) {
    const resume = entry.resume
    const abandon = async () => {
      if (operation.current) return
      operation.current = true
      setAbandoning(true)
      setActionError(undefined)
      try {
        await store.clearDraft()
        const next = resumeAccueil({
          draft: undefined,
          seances: entry.seances,
          targets: entry.targets,
          now,
        })
        setEntry({ ...entry, draft: undefined, resume: next })
        setSelectedType(next.type)
        setRushed(entry.preferences.modePresseParDefaut)
      } catch (reason) {
        setActionError(`Abandon impossible : ${messageFor(reason)}`)
      } finally {
        operation.current = false
        setAbandoning(false)
      }
    }

    return (
      <SessionResume
        type={resume.type}
        date={resume.date}
        dateLabel={formatDate(resume.date)}
        completedSets={resume.traitees}
        totalSets={resume.total}
        updatedLabel={updatedLabel(resume.misAJourA)}
        abandoning={abandoning}
        errorMessage={actionError}
        onResume={() => setFocusedDraft(entry.draft)}
        onAbandon={() => void abandon()}
      />
    )
  }

  const resume = entry.resume
  if (resume.etat !== 'aucune') return <SessionEntryStatus status="loading" />
  const type = selectedType ?? resume.type
  const preview = apercuSeance(type, entry.targets, entry.seances, rushed)
  const start = async () => {
    if (operation.current) return
    operation.current = true
    setStarting(true)
    setActionError(undefined)
    try {
      const draft = await store.startSession(type, resume.date, { rushed })
      setEntry({
        ...entry,
        draft,
        resume: resumeAccueil({ draft, seances: entry.seances, targets: entry.targets, now }),
      })
      setFocusedDraft(draft)
    } catch (reason) {
      setActionError(`Démarrage impossible : ${messageFor(reason)}`)
    } finally {
      operation.current = false
      setStarting(false)
    }
  }

  return (
    <SessionLanding
      suggestedType={resume.type}
      selectedType={type}
      date={resume.date}
      dateLabel={formatDate(resume.date)}
      scheduleLabel={type === resume.type ? resume.quand : "Aujourd'hui · hors rotation"}
      exercises={preview.exercices.map((exercise) => ({
        id: exercise.id,
        name: exercise.label,
        prescription: exercise.scheme,
      }))}
      warmupCount={preview.paliers}
      rushed={rushed}
      starting={starting}
      errorMessage={actionError}
      onSelectType={setSelectedType}
      onRushedChange={setRushed}
      onStart={() => void start()}
    />
  )
}

export function SessionHome({ store, now = new Date() }: { store: SessionStore; now?: Date }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <SessionHomeAttempt
      key={attempt}
      store={store}
      now={now}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}
