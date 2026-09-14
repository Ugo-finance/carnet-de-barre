import { fireEvent, render, screen, within } from '@testing-library/react'

import { buildDraft } from '../db/draft'
import type { Draft, SeanceType, Targets } from '../domain/types'
import { SessionScreen } from './SessionScreen'

const TARGETS: Targets = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

/**
 * Le brouillon **tel que l'app le construit**, et non une fixture écrite à la main.
 *
 * L'ancienne version réimplémentait `buildDraft` ici : elle n'a donc pas vu arriver les
 * paliers d'échauffement de CB-56, et l'écran a pu se mettre à lire un palier là où il
 * croyait lire la série de travail sans qu'aucun test ne bronche. Une fixture qui
 * reproduit la production finit toujours par en diverger, et c'est précisément quand elle
 * diverge que les tests cessent de valoir quelque chose.
 */
function draftFor(type: SeanceType): Draft {
  return buildDraft(type, type === 'C' ? '2026-09-20' : '2026-09-22', TARGETS, {
    id: `draft-${type}`,
    now: 1,
  })
}

function renderSession(
  type: SeanceType,
  overrides: Partial<Parameters<typeof SessionScreen>[0]> = {},
) {
  const props = {
    draft: draftFor(type),
    whenLabel: "Aujourd'hui",
    onSelectType: vi.fn(),
    onSetChange: vi.fn(),
    onSetValidate: vi.fn(),
    onAccessoryChange: vi.fn(),
    onNotesChange: vi.fn(),
    onTimerAdjust: vi.fn(),
    keepAwake: false,
    onKeepAwakeChange: vi.fn(),
    onTimerStop: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  }
  render(<SessionScreen {...props} />)
  return props
}

describe('SessionScreen', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  it.each([
    ['A', '75 kg', '60 kg'],
    ['B', '70 kg', '+15 kg'],
    ['C', '92,5 kg', '24 kg/haltère'],
  ] as const)('affiche les cibles principales de la séance %s', (type, first, second) => {
    renderSession(type)

    expect(screen.getByText(first)).toBeInTheDocument()
    expect(screen.getByText(second)).toBeInTheDocument()
  })

  it.each([
    ['A', 'Squat', 'Top set', 'a-squat:top:0', '2,5', 77.5],
    ['C', 'Développé incliné haltères', 'Série 1', 'c-di:accessory:0', '2', 26],
  ] as const)(
    'applique le pas du matériel dans la séance %s',
    (type, exerciseLabel, setLabel, setId, stepLabel, expectedWeight) => {
      const onSetChange = vi.fn()
      renderSession(type, { onSetChange })
      const exercise = screen.getByRole('article', { name: exerciseLabel })
      // La carte est nommée, et non prise au rang : depuis CB-56 la première carte d'un
      // exercice est son palier d'échauffement, et « la première » réglait donc le pas
      // sur une charge que ce test ne visait pas.
      const serie = within(exercise).getByRole('article', { name: setLabel })

      fireEvent.click(
        within(serie).getByRole('button', {
          name: `Augmenter Poids de ${stepLabel}`,
        }),
      )

      expect(onSetChange).toHaveBeenCalledWith(
        setId,
        expect.objectContaining({ weight: expectedWeight }),
      )
    },
  )

  it('respecte l’ordre de la séance C et affiche les plaques de la barre', () => {
    renderSession('C')
    const cards = screen.getAllByRole('article')

    // La séance C telle qu'Ugo la voit réellement. L'ancienne attente décrivait une
    // séance qui n'a jamais existé : ni paliers, ni backoffs, parce que la fixture
    // réimplémentait `buildDraft` et ne construisait qu'une série par top set.
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Soulevé de terre',
      'Palier 1',
      'Palier 2',
      'Palier 3',
      'Top set',
      'Backoff 1',
      'Backoff 2',
      'Développé incliné haltères',
      'Palier 1',
      'Série 1',
      'Série 2',
      'Série 3',
      'Presse 45°',
      'Série 1',
      'Série 2',
      'Tractions poids de corps',
      'Série 1',
      'Série 2',
      'Élévations latérales',
      'Série 1',
      'Série 2',
    ])
    expect(screen.getByText('Par côté : 25 + 10 + 1,25')).toBeInTheDocument()
  })

  it('laisse les trois séances accessibles avec des cibles tactiles de 44 px', () => {
    const onSelectType = vi.fn()
    renderSession('C', { onSelectType })

    const button = screen.getByRole('button', { name: 'Séance A' })
    expect(button).toHaveClass('min-h-11')
    fireEvent.click(button)
    expect(onSelectType).toHaveBeenCalledWith('A')
  })

  it('masque le sélecteur lorsque son action n’est pas fournie', () => {
    renderSession('C', { onSelectType: undefined })

    expect(screen.queryByRole('navigation', { name: 'Choisir une séance' })).not.toBeInTheDocument()
  })

  it('laisse l’interrupteur d’écran allumé accessible entre deux chronos', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn() },
    })
    const onKeepAwakeChange = vi.fn()
    renderSession('C', { keepAwake: true, onKeepAwakeChange })

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Écran allumé ✓' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(onKeepAwakeChange).toHaveBeenCalledWith(false)
  })

  it('valide une série préremplie en un tap avec son identifiant', () => {
    const onSetValidate = vi.fn()
    renderSession('A', { onSetValidate })
    const squat = screen.getByRole('article', { name: 'Squat' })
    const topSet = within(squat).getByRole('article', { name: 'Top set' })

    fireEvent.click(within(topSet).getByRole('button', { name: 'Valider' }))

    expect(onSetValidate).toHaveBeenCalledWith(
      'a-squat:top:0',
      expect.objectContaining({ weight: 75, reps: 4, status: 'validated' }),
      { seconds: 150, label: 'Récup Squat' },
    )
  })

  it('ne demande aucun chrono en validant un palier d’échauffement', () => {
    // P1 de la contre-revue sur CB-56, et contrat d'interaction § 4 : un palier ne crée,
    // ne remplace et n'efface jamais une échéance. Le `null` transmis ici est ce qui
    // permet à `validateSet` de ne pas y toucher.
    //
    // Le cas réel : en séance A, la carte qui suit la dernière série de développé volume
    // est un palier de tractions, et Ugo la valide pendant ses 150 s de récupération.
    const onSetValidate = vi.fn()
    renderSession('A', { onSetValidate })
    const squat = screen.getByRole('article', { name: 'Squat' })
    const palier = within(squat).getByRole('article', { name: 'Palier 1' })

    fireEvent.click(within(palier).getByRole('button', { name: 'Valider' }))

    expect(onSetValidate).toHaveBeenCalledWith(
      'a-squat:warmup:0',
      expect.objectContaining({ status: 'validated' }),
      null,
    )
  })

  it('annonce le nombre de paliers sans inventer de durée', () => {
    renderSession('C')

    expect(screen.getByText('Échauffement · 4 paliers')).toBeInTheDocument()
    expect(screen.queryByText(/Échauffement.+min/)).not.toBeInTheDocument()
  })

  it('conserve les échauffements des deux premiers exercices en mode pressé', () => {
    const draft = draftFor('A')
    draft.rushed = true
    renderSession('A', { draft })

    const squat = screen.getByRole('article', { name: 'Squat' })
    const bench = screen.getByRole('article', { name: 'Développé couché volume' })
    expect(within(squat).getByRole('region', { name: 'Échauffement · Squat' })).toBeInTheDocument()
    expect(
      within(bench).getByRole('region', { name: 'Échauffement · Développé couché volume' }),
    ).toBeInTheDocument()
  })

  it('affiche un état chrono neutre entre deux récupérations', () => {
    renderSession('C')

    const slot = screen.getByRole('region', { name: 'Chronomètre' })
    expect(within(slot).getByText('Repos libre')).toBeInTheDocument()
    expect(within(slot).queryByRole('timer')).not.toBeInTheDocument()
  })

  it('annonce la charge de travail en tête, jamais celle du palier', () => {
    // P1 de la contre-revue : l'en-tête et les plaques lisaient `sets[0]`, devenu le
    // palier. Le soulevé de terre annonçait 60 kg et les plaques de 60 au lieu de 92,5.
    renderSession('C')
    const deadlift = screen.getByRole('article', { name: 'Soulevé de terre' })

    expect(within(deadlift).getByText('92,5 kg')).toBeInTheDocument()
    expect(within(deadlift).getByText('Par côté : 25 + 10 + 1,25')).toBeInTheDocument()

    const incline = screen.getByRole('article', { name: 'Développé incliné haltères' })
    expect(within(incline).getByText('24 kg/haltère')).toBeInTheDocument()
  })

  it('demande 75 secondes de récupération pour un exercice en superset', () => {
    const onSetValidate = vi.fn()
    renderSession('A', { onSetValidate })
    const tractions = screen.getByRole('article', { name: 'Tractions lestées' })
    const premiere = within(tractions).getByRole('article', { name: 'Série 1' })

    fireEvent.click(within(premiere).getByRole('button', { name: 'Valider' }))

    expect(onSetValidate).toHaveBeenCalledWith(
      'a-tractions-lestees:accessory:0',
      expect.objectContaining({ status: 'validated' }),
      { seconds: 75, label: 'Récup Tractions lestées' },
    )
  })

  it('ne propose pas de poids sur les tractions au poids du corps', () => {
    renderSession('C')
    const pdc = screen.getByRole('article', { name: 'Tractions poids de corps' })

    expect(within(pdc).queryByRole('textbox', { name: 'Poids' })).not.toBeInTheDocument()
    expect(within(pdc).getAllByRole('textbox', { name: 'Répétitions' })).toHaveLength(2)
  })

  it('rend un exercice optionnel en séries, comme n’importe quel accessoire', () => {
    // CB-69 : les élévations se notaient en texte libre, sous un genre `optional` à part.
    // Elles sont désormais un accessoire structuré — c'est ce qui fait le compte de la
    // séance, et ce qui permet à la file de ne pas s'arrêter sur un formulaire.
    const onSetValidate = vi.fn()
    renderSession('C', { onSetValidate })
    const elevations = screen.getByRole('article', { name: 'Élévations latérales' })

    expect(within(elevations).queryByRole('textbox', { name: /remarque/i })).not.toBeInTheDocument()
    const premiere = within(elevations).getByRole('article', { name: 'Série 1' })
    expect(within(premiere).getByRole('textbox', { name: 'Poids' })).toHaveValue('8')
    expect(within(premiere).getByRole('textbox', { name: 'Répétitions' })).toHaveValue('12')

    fireEvent.click(within(premiere).getByRole('button', { name: 'Valider' }))

    expect(onSetValidate).toHaveBeenCalledWith(
      'c-elevations:accessory:0',
      expect.objectContaining({ weight: 8, reps: 12, status: 'validated' }),
      { seconds: 75, label: 'Récup Élévations latérales' },
    )
  })

  it('transmet les notes et permet de terminer la séance', () => {
    const onNotesChange = vi.fn()
    const onFinish = vi.fn()
    renderSession('C', { onNotesChange, onFinish })

    fireEvent.change(screen.getByRole('textbox', { name: /Notes de séance/ }), {
      target: { value: 'Bonne énergie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }))

    expect(onNotesChange).toHaveBeenCalledWith('Bonne énergie')
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('désactive la finalisation pendant l’écriture et affiche son erreur près du bouton', () => {
    renderSession('C', {
      finishing: true,
      finishErrorMessage: 'Enregistrement impossible : quota dépassé',
    })

    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('quota dépassé')
  })
})
