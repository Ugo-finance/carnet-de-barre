import { useEffect, useRef, useState } from 'react'
import type { CarnetStore, FinalizeResult } from '../../db/contracts'
import { apercuSeance, resumeAccueil, type ResumeAccueil } from '../../db/selectors'
import { formatDate } from '../../domain/format'
import type { Preferences } from '../../domain/preferences'
import {
  currentSession,
  type SeanceFaite,
  todayInZurich,
  type UpcomingSession,
} from '../../domain/schedule'
import type { Draft, Seance, SeanceType, Targets } from '../../domain/types'
import { useDraftEditor } from './useDraftEditor'
import { unlockTimerAudio, useWakeLock } from './timer'
import { SessionEntryStatus } from './SessionEntryStatus'
import { SessionLanding } from './SessionLanding'
import { SessionFocus } from './SessionFocus'
import { SessionResume } from './SessionResume'
import { SessionSummary } from './SessionSummary'
import { buildSessionQueue } from './sessionQueue'

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

function elapsedLabel(startedAt: number | null, now: number): string {
  if (startedAt === null) return 'Durée inconnue'
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000))
  return `${minutes} min`
}

/** Le temps écoulé reste dérivé de `startedAt` et de l'horloge, jamais stocké. */
function useElapsedLabel(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) return
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  return elapsedLabel(startedAt, now)
}

function SessionEditor({
  state,
  store,
  now,
  onExit,
  onFinished,
}: {
  state: ReadyState
  store: SessionStore
  now: Date
  onExit: (draft: Draft) => void
  onFinished: () => void
}) {
  const editor = useDraftEditor(store, state.draft)
  const [writing, setWriting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string>()
  const [result, setResult] = useState<FinalizeResult>()
  const [confirmFinish, setConfirmFinish] = useState(false)
  const finalizingRef = useRef(false)
  const writingRef = useRef(false)
  const returnToSessionRef = useRef<HTMLButtonElement>(null)
  const keepAwake = editor.draft?.keepAwake ?? false
  useWakeLock(keepAwake, Boolean(editor.draft) && !result)
  const sessionElapsedLabel = useElapsedLabel(editor.draft?.startedAt ?? null)

  useEffect(() => {
    if (!confirmFinish) return
    returnToSessionRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmFinish(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [confirmFinish])

  if (editor.loadError) {
    return <StatusScreen message={`Brouillon indisponible : ${editor.loadError.message}`} error />
  }
  if (editor.loading || !editor.draft) return <StatusScreen message="Chargement de la séance…" />

  const draft = editor.draft
  const queue = buildSessionQueue(draft)

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
      const next = await store.finalizeSeance(draft.id)
      setResult(next)
      onFinished()
    } catch (error) {
      setFinalizeError(messageFor(error))
    } finally {
      finalizingRef.current = false
      setFinalizing(false)
    }
  }

  const unfinishedCount = draft.sets.filter(
    (set) =>
      queue.some(({ set: queued }) => queued.id === set.id) &&
      set.status !== 'validated' &&
      set.status !== 'skipped',
  ).length
  const requestFinish = () => {
    if (unfinishedCount > 0) setConfirmFinish(true)
    else void finish()
  }

  return (
    <>
      <SessionFocus
        type={draft.type}
        queue={queue}
        elapsedLabel={sessionElapsedLabel}
        writing={writing}
        finishing={finalizing}
        notes={draft.notes}
        timer={
          draft.timerEndsAt !== null && draft.timerLabel
            ? {
                endsAt: draft.timerEndsAt,
                label: draft.timerLabel,
                onAdjust: editor.adjustTimer,
                onStop: editor.stopTimer,
              }
            : undefined
        }
        onSetChange={editor.updateSet}
        onValidate={(setId, value) => {
          if (writingRef.current) return
          const item = queue.find(({ set }) => set.id === setId)
          if (!item) return
          unlockTimerAudio()
          writingRef.current = true
          setWriting(true)
          void editor
            .validateSetAfterPersist(
              setId,
              value,
              item.set.role === 'warmup'
                ? null
                : {
                    seconds: item.exercise.restSeconds,
                    label: `Récup ${item.exercise.label}`,
                  },
            )
            .catch(() => undefined)
            .finally(() => {
              writingRef.current = false
              setWriting(false)
            })
        }}
        onSkip={(setId) => {
          if (writingRef.current) return
          writingRef.current = true
          setWriting(true)
          void editor
            .skipSetAfterPersist(setId)
            .catch(() => undefined)
            .finally(() => {
              writingRef.current = false
              setWriting(false)
            })
        }}
        onNotesChange={editor.updateNotes}
        onFinish={requestFinish}
        onExit={() => {
          if (writingRef.current) return
          writingRef.current = true
          setWriting(true)
          void editor
            .flush()
            .then(() => {
              writingRef.current = false
              setWriting(false)
              onExit(draft)
            })
            .catch(() => {
              writingRef.current = false
              setWriting(false)
            })
        }}
        finishErrorMessage={
          finalizeError ? `Enregistrement impossible : ${finalizeError}` : undefined
        }
        errorMessage={
          editor.saveError
            ? `Sauvegarde impossible. Ta série reste à confirmer. Réessayer. (${editor.saveError.message})`
            : undefined
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
              ref={returnToSessionRef}
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
  onSessionActiveChange,
}: {
  store: SessionStore
  now: Date
  onRetry: () => void
  onSessionActiveChange?: (active: boolean) => void
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
        onSessionActiveChange?.(ready.resume.etat === 'en-cours')
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
  }, [onSessionActiveChange])

  useEffect(
    () => () => {
      onSessionActiveChange?.(false)
    },
    [onSessionActiveChange],
  )

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
        onExit={(persistedDraft) => {
          setEntry({
            ...entry,
            draft: persistedDraft,
            resume: resumeAccueil({
              draft: persistedDraft,
              seances: entry.seances,
              targets: entry.targets,
              now,
            }),
          })
          setFocusedDraft(undefined)
        }}
        onFinished={() => onSessionActiveChange?.(false)}
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
        onSessionActiveChange?.(false)
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
      onSessionActiveChange?.(true)
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

export function SessionHome({
  store,
  now = new Date(),
  onSessionActiveChange,
}: {
  store: SessionStore
  now?: Date
  onSessionActiveChange?: (active: boolean) => void
}) {
  const [attempt, setAttempt] = useState(0)
  return (
    <SessionHomeAttempt
      key={attempt}
      store={store}
      now={now}
      onRetry={() => setAttempt((value) => value + 1)}
      onSessionActiveChange={onSessionActiveChange}
    />
  )
}
