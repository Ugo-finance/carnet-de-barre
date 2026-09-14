import { act, renderHook, waitFor } from '@testing-library/react'
import { buildDraft } from '../../db/draft'
import type { Draft } from '../../domain/types'
import { type DraftPort, useDraftEditor } from './useDraftEditor'

function draftFixture(): Draft {
  return {
    id: 'draft-1',
    date: '2026-09-12',
    type: 'A',
    sets: [
      {
        id: 'set-1',
        exerciseId: 'a-squat',
        role: 'top',
        index: 0,
        status: 'planned',
        loadKind: 'barTotal',
        weight: 75,
        reps: 4,
        rpe: null,
        targetWeight: 75,
        targetReps: 4,
      },
    ],
    accessories: [],
    notes: '',
    rushed: false,
    timerEndsAt: null,
    timerLabel: null,
    keepAwake: false,
    startedAt: null,
    baseTargets: {
      updatedAt: '2026-09-12',
      squat: { w: 75, inc: 2.5, reps: 4, fail: null },
      bench: { w: 70, inc: 2.5, reps: 4, fail: null },
      deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
      tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
      benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
    },
    createdAt: 1,
    updatedAt: 1,
  }
}

function createMemoryDraftPort(initial: Draft): DraftPort {
  let stored = structuredClone(initial)
  return {
    async loadDraft() {
      return structuredClone(stored)
    },
    async saveDraft(draft) {
      stored = structuredClone(draft)
    },
  }
}

describe('useDraftEditor', () => {
  it('laisse intact un repos en cours quand la série ne demande aucun chrono', async () => {
    // P1 de la contre-revue sur CB-56, et contrat d'interaction § 4 : un palier
    // d'échauffement ne crée, ne remplace et n'efface jamais une échéance.
    //
    // Le cas réel, séance A : la carte qui suit la dernière série de développé volume est
    // un palier de tractions. Ugo la valide **pendant** ses 150 s de récupération, parce
    // que c'est exactement ce qu'on lui demande de faire. Écraser l'échéance à ce
    // moment-là lui retire son repos sans qu'il ait rien demandé.
    const echeance = 1_700_000_000_000
    const initial = { ...draftFixture(), timerEndsAt: echeance, timerLabel: 'Récup Squat' }
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 20, reps: 8, rpe: null, status: 'validated' },
        null,
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: [expect.objectContaining({ status: 'validated' })],
        timerEndsAt: echeance,
        timerLabel: 'Récup Squat',
      }),
    )
  })

  it('n’invente pas de chrono quand il n’y en avait aucun', async () => {
    // L'autre moitié de la même règle : « ne crée jamais ». Sans elle, un palier validé
    // hors de tout repos ferait apparaître un compte à rebours que rien ne justifie.
    const initial = draftFixture()
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 20, reps: 8, rpe: null, status: 'validated' },
        null,
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ timerEndsAt: null, timerLabel: null }),
    )
  })

  it('valide une série préremplie en un tap et appelle saveDraft une fois', async () => {
    const initial = draftFixture()
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: null, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledOnce()
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: [expect.objectContaining({ status: 'validated' })],
        timerEndsAt: expect.any(Number),
        timerLabel: 'Récup Squat',
      }),
    )
  })

  it('restaure après remontage chaque modification déjà sauvegardée', async () => {
    const store = createMemoryDraftPort(draftFixture())
    const first = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    act(() => first.result.current.changeSet('set-1', { weight: 77.5 }))
    await act(() => first.result.current.flush())
    first.unmount()

    const second = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.draft?.sets[0]).toMatchObject({ weight: 77.5, status: 'entered' })
  })

  it('sérialise les sauvegardes pour que la dernière saisie gagne', async () => {
    const persisted: number[] = []
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft: async (draft) => {
        await Promise.resolve()
        persisted.push(draft.sets[0].weight!)
      },
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.changeSet('set-1', { weight: 77.5 })
      result.current.changeSet('set-1', { weight: 80 })
    })
    await act(() => result.current.flush())

    expect(persisted).toEqual([77.5, 80])
  })

  it('persiste les notes au fil de la saisie', async () => {
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const initial = draftFixture()
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() => result.current.updateNotes('Sommeil court, sensations correctes'))
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Sommeil court, sensations correctes' }),
    )
  })

  it('persiste la préférence écran allumé au niveau de la séance', async () => {
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const initial = draftFixture()
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() => result.current.updateKeepAwake(true))
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ keepAwake: true }))
  })

  it('expose une erreur de sauvegarde et empêche une action dépendante de continuer', async () => {
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft: vi.fn().mockRejectedValue(new Error('quota')),
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: null, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await expect(result.current.flush()).rejects.toThrow('quota')

    await waitFor(() => expect(result.current.saveError?.message).toBe('quota'))
  })

  it('ne publie la validation focus qu’après la réussite de l’écriture', async () => {
    let release!: () => void
    const persisted = new Promise<void>((resolve) => {
      release = resolve
    })
    const initial = draftFixture()
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(initial),
      saveDraft: vi.fn().mockReturnValue(persisted),
    }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    let validation!: Promise<void>
    act(() => {
      validation = result.current.validateSetAfterPersist(
        'set-1',
        { weight: 75, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      )
    })

    expect(result.current.draft?.sets[0]?.status).toBe('planned')
    expect(result.current.draft?.timerEndsAt).toBeNull()

    release()
    await act(() => validation)

    expect(result.current.draft?.sets[0]).toMatchObject({ status: 'validated', rpe: 8 })
    expect(result.current.draft?.timerLabel).toBe('Récup Squat')
  })

  it('garde la série focus courante lorsque son écriture échoue', async () => {
    const initial = draftFixture()
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(initial),
      saveDraft: vi.fn().mockRejectedValue(new Error('quota')),
    }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    await expect(
      result.current.validateSetAfterPersist(
        'set-1',
        { weight: 75, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    ).rejects.toThrow('quota')

    expect(result.current.draft?.sets[0]?.status).toBe('planned')
    expect(result.current.draft?.timerEndsAt).toBeNull()
    await waitFor(() => expect(result.current.saveError?.message).toBe('quota'))
  })

  it('écrit la valeur complète renvoyée par une carte de série', async () => {
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = {
      loadDraft: vi.fn().mockResolvedValue(draftFixture()),
      saveDraft,
    }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 77.5,
        reps: 4,
        rpe: 8,
        status: 'validated',
      }),
    )
    await act(() => result.current.flush())

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: [expect.objectContaining({ weight: 77.5, reps: 4, rpe: 8, status: 'validated' })],
      }),
    )
  })

  it('recalcule seulement les backoffs encore vierges quand le top set change', async () => {
    const initial = draftFixture()
    initial.sets.push(
      {
        ...initial.sets[0],
        id: 'backoff-planned',
        role: 'backoff',
        index: 0,
        weight: 67.5,
        reps: 5,
        targetWeight: 67.5,
        targetReps: 5,
      },
      {
        ...initial.sets[0],
        id: 'backoff-entered',
        role: 'backoff',
        index: 1,
        status: 'entered',
        weight: 65,
        reps: 5,
        targetWeight: 67.5,
        targetReps: 5,
      },
    )
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 80,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const saved = saveDraft.mock.calls[0][0]
    expect(saved.sets.find((set) => set.id === 'backoff-planned')).toMatchObject({
      weight: 72.5,
      status: 'planned',
      targetWeight: 67.5,
    })
    expect(saved.sets.find((set) => set.id === 'backoff-entered')).toMatchObject({
      weight: 65,
      status: 'entered',
    })
  })

  it('recalcule le palier vierge sans toucher aux paliers déjà manipulés', async () => {
    const initial = buildDraft('A', '2026-09-22', draftFixture().baseTargets, {
      id: 'draft-warmup',
      now: 1,
    })
    initial.sets = initial.sets.map((set) => {
      if (set.exerciseId !== 'a-squat' || set.role !== 'warmup') return set
      if (set.index === 0) return { ...set, status: 'validated' as const }
      if (set.index === 1) return { ...set, status: 'entered' as const, weight: 32.5 }
      if (set.index === 2) return { ...set, status: 'skipped' as const }
      return set
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('a-squat:top:0', {
        weight: 80,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const warmups = saveDraft.mock.calls[0][0].sets.filter(
      (set) => set.exerciseId === 'a-squat' && set.role === 'warmup',
    )
    expect(warmups.map(({ weight, status }) => ({ weight, status }))).toEqual([
      { weight: 20, status: 'validated' },
      { weight: 32.5, status: 'entered' },
      { weight: 52.5, status: 'skipped' },
      { weight: 70, status: 'planned' },
    ])
    // La proposition d'ouverture reste l'audit de ce qui était prévu avant la saisie.
    expect(warmups[3]?.targetWeight).toBe(65)
  })

  it('suit la charge réelle d’un accessoire et conserve sa proposition initiale', async () => {
    const initial = buildDraft('C', '2026-09-20', draftFixture().baseTargets, {
      id: 'draft-accessory-warmup',
      now: 1,
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('c-di:accessory:0', {
        weight: 30,
        reps: 8,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const warmup = saveDraft.mock.calls[0][0].sets.find((set) => set.id === 'c-di:warmup:0')
    expect(warmup).toMatchObject({
      weight: 18,
      reps: 8,
      status: 'planned',
      targetWeight: 14,
    })
  })

  it('recrée la rampe après avoir effacé puis ressaisi la charge de travail', async () => {
    // P1 de la contre-revue sur CB-57 : effacer 24 retirait correctement le palier de
    // l'incliné, mais son absence était ensuite prise pour la forme d'un brouillon legacy.
    // Ressaisir 24 ne recréait donc jamais les 14 kg d'échauffement.
    const initial = buildDraft('C', '2026-09-20', draftFixture().baseTargets, {
      id: 'draft-cleared-work-weight',
      now: 1,
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('c-di:accessory:0', {
        weight: null,
        reps: 8,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())
    expect(
      saveDraft.mock.calls
        .at(-1)?.[0]
        .sets.filter((set) => set.exerciseId === 'c-di' && set.role === 'warmup'),
    ).toEqual([])

    act(() =>
      result.current.updateSet('c-di:accessory:0', {
        weight: 24,
        reps: 8,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())
    expect(
      saveDraft.mock.calls
        .at(-1)?.[0]
        .sets.filter((set) => set.exerciseId === 'c-di' && set.role === 'warmup')
        .map((set) => [set.id, set.weight, set.reps]),
    ).toEqual([['c-di:warmup:0', 14, 8]])
  })

  it('ne recalcule pas la rampe depuis une série de travail ultérieure', async () => {
    // La rampe prépare la première série de travail. Modifier ensuite une réalisation
    // isolée ne doit pas réécrire rétroactivement ce qui la précédait.
    const initial = buildDraft('C', '2026-09-20', draftFixture().baseTargets, {
      id: 'draft-later-accessory-set',
      now: 1,
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('c-di:accessory:1', {
        weight: 30,
        reps: 8,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    expect(saveDraft.mock.calls[0][0].sets.find((set) => set.id === 'c-di:warmup:0')).toMatchObject(
      {
        weight: 14,
        status: 'planned',
      },
    )
  })

  it('n’injecte jamais de rampe dans un ancien brouillon qui n’en portait pas', async () => {
    // Un brouillon ouvert avant CB-56 n'a aucun palier ni marqueur de version. Une charge
    // modifiée après la mise à jour ne doit pas changer sa forme en pleine séance.
    const initial = draftFixture()
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('set-1', {
        weight: 80,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    expect(saveDraft.mock.calls[0][0].sets.map((set) => set.id)).toEqual(['set-1'])
  })

  it('retire les paliers vierges devenus inutiles quand la charge baisse', async () => {
    const initial = buildDraft('A', '2026-09-22', draftFixture().baseTargets, {
      id: 'draft-shorter-warmup',
      now: 1,
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('a-squat:top:0', {
        weight: 25,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const warmups = saveDraft.mock.calls[0][0].sets.filter(
      (set) => set.exerciseId === 'a-squat' && set.role === 'warmup',
    )
    expect(warmups.map((set) => [set.id, set.weight])).toEqual([
      ['a-squat:warmup:0', 20],
      ['a-squat:warmup:1', 22.5],
    ])
  })

  it('ajoute les nouveaux paliers avant le travail quand la charge monte', async () => {
    const targets = structuredClone(draftFixture().baseTargets)
    targets.squat.w = 25
    const initial = buildDraft('A', '2026-09-22', targets, {
      id: 'draft-longer-warmup',
      now: 1,
    })
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() =>
      result.current.updateSet('a-squat:top:0', {
        weight: 50,
        reps: 4,
        rpe: null,
        status: 'entered',
      }),
    )
    await act(() => result.current.flush())

    const squatSets = saveDraft.mock.calls[0][0].sets.filter((set) => set.exerciseId === 'a-squat')
    expect(squatSets.map((set) => [set.role, set.index, set.weight])).toEqual([
      ['warmup', 0, 20],
      ['warmup', 1, 25],
      ['warmup', 2, 35],
      ['warmup', 3, 42.5],
      ['top', 0, 50],
      ['backoff', 0, 45],
      ['backoff', 1, 45],
    ])
  })

  it('persiste l’échéance, permet ±30 s et arrête le chrono', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T14:00:00Z'))
    const saveDraft = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined)
    const initial = draftFixture()
    const store: DraftPort = { loadDraft: vi.fn().mockResolvedValue(initial), saveDraft }
    const { result } = renderHook(() => useDraftEditor(store, initial))

    act(() =>
      result.current.validateSet(
        'set-1',
        { weight: 75, reps: 4, rpe: 8, status: 'validated' },
        { seconds: 150, label: 'Récup Squat' },
      ),
    )
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      timerEndsAt: Date.now() + 150_000,
      timerLabel: 'Récup Squat',
    })

    act(() => result.current.adjustTimer(30_000))
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0].timerEndsAt).toBe(Date.now() + 180_000)

    act(() => result.current.stopTimer())
    await act(() => result.current.flush())
    expect(saveDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      timerEndsAt: null,
      timerLabel: null,
    })
    vi.useRealTimers()
  })
})
