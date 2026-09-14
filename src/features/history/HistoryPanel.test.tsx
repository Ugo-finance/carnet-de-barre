import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistoryPanel, type HistoryPort } from './HistoryPanel'
import type { Seance } from '../../domain/types'
import { buildDraft, setId } from '../../db/draft'
import { draftToSeance } from '../../db/derive'

const CIBLES = {
  updatedAt: '2026-09-12',
  squat: { w: 75, inc: 2.5, reps: 4, fail: null },
  bench: { w: 70, inc: 2.5, reps: 4, fail: null },
  deadlift: { w: 92.5, inc: 5, reps: 3, fail: null },
  tractions: { w: 15, inc: 2.5, reps: 4, fail: null },
  benchVol: { w: 60, inc: 2.5, reps: 8, sets: 3, fail: null },
}

const TOP_SQUAT = setId('a-squat', 'top', 0)

/** Une séance A avec son top set validé à 95 — la faute de frappe à corriger. */
function seanceAvecSeries(): Seance {
  const draft = buildDraft('A', '2026-09-15', CIBLES, { id: 'avec-series', now: 1 })
  return draftToSeance(
    {
      ...draft,
      sets: draft.sets.map((set) =>
        set.id === TOP_SQUAT
          ? { ...set, status: 'validated' as const, weight: 95, reps: 4, rpe: 8 }
          : set,
      ),
    },
    1000,
  )
}

/** Un magasin en mémoire minimal, qui applique vraiment les corrections. */
function faux(seances: Seance[]): HistoryPort {
  let liste = [...seances]
  return {
    updateSeance: vi.fn(async (id, patch) => {
      const suivante = { ...liste.find((s) => s.id === id)!, ...patch, id }
      liste = liste.map((s) => (s.id === id ? suivante : s))
      return suivante
    }),
    deleteSeance: vi.fn(async (id) => {
      liste = liste.filter((s) => s.id !== id)
    }),
  }
}

function seance(over: Partial<Seance> & Pick<Seance, 'id' | 'date' | 'type'>): Seance {
  return { lines: [], tops: {}, notes: '', ...over }
}

const JUILLET = seance({
  id: 's-juillet',
  date: '2026-07-22',
  type: 'B',
  lines: ['Développé couché : 70×4 @8'],
  approx: true,
})

const CE_SOIR = seance({
  id: 's-ce-soir',
  date: '2026-09-12',
  type: 'C',
  lines: ['Soulevé de terre : 92,5×3 @8', 'Développé incliné haltères : 20 kg/haltère×9'],
  notes: 'Bonne énergie',
})

describe('historique', () => {
  it('met la séance la plus récente en haut et la déplie', () => {
    // C'est la question du premier soir : « est-ce que ma séance est bien là ? ».
    // Elle doit trouver sa réponse sans un seul tap.
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} store={faux([JUILLET, CE_SOIR])} />)

    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Séance C')).toBeInTheDocument()
    expect(screen.getByText('Soulevé de terre : 92,5×3 @8')).toBeInTheDocument()
  })

  it('replie les séances plus anciennes', () => {
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} store={faux([JUILLET, CE_SOIR])} />)

    expect(screen.queryByText('Développé couché : 70×4 @8')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Développé couché : 70×4 @8')).toBeInTheDocument()
  })

  it('groupe les séances par semaine, la plus récente en premier', () => {
    // 12.09 est un samedi, 15.09 un mardi : deux semaines, et non un seul bloc.
    const samedi = seance({ id: 's-samedi', date: '2026-09-12', type: 'C' })
    const mardi = seance({ id: 's-mardi', date: '2026-09-15', type: 'A' })
    const jeudi = seance({ id: 's-jeudi', date: '2026-09-17', type: 'B' })
    const liste = [samedi, mardi, jeudi]
    render(<HistoryPanel seances={liste} store={faux(liste)} />)

    const semaines = screen.getAllByRole('region')
    expect(semaines).toHaveLength(2)
    expect(semaines[0]).toHaveAccessibleName('Semaine du 14.09 au 20.09.2026')
    expect(semaines[1]).toHaveAccessibleName('Semaine du 07.09 au 13.09.2026')
    expect(within(semaines[0]).getAllByRole('listitem')).toHaveLength(2)
    expect(within(semaines[1]).getAllByRole('listitem')).toHaveLength(1)
  })

  it('rattache la séance du dimanche à la semaine qui s’achève', () => {
    // La séance C se fait le dimanche. Une semaine qui commencerait le dimanche la
    // séparerait des séances A et B de la même semaine d'entraînement — exactement ce
    // qu'Ugo vient vérifier quand il ouvre l'écran.
    const mardi = seance({ id: 's-mardi', date: '2026-09-15', type: 'A' })
    const dimanche = seance({ id: 's-dimanche', date: '2026-09-20', type: 'C' })
    const liste = [mardi, dimanche]
    render(<HistoryPanel seances={liste} store={faux(liste)} />)

    const semaines = screen.getAllByRole('region')
    expect(semaines).toHaveLength(1)
    expect(within(semaines[0]).getAllByRole('listitem')).toHaveLength(2)
  })

  it('compte les séances de chaque semaine dans son en-tête', () => {
    const liste = [
      seance({ id: 's-mardi', date: '2026-09-15', type: 'A' }),
      seance({ id: 's-jeudi', date: '2026-09-17', type: 'B' }),
    ]
    render(<HistoryPanel seances={liste} store={faux(liste)} />)

    expect(screen.getByText('2 séances')).toBeInTheDocument()
  })

  it('avertit en permanence qu’une correction ne recalcule aucune cible', () => {
    // L'avertissement se lit **avant** de corriger, pas au moment de confirmer. Replié
    // derrière un geste, il n'arriverait qu'après la décision.
    render(<HistoryPanel seances={[CE_SOIR]} store={faux([CE_SOIR])} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/ne recalcule\s+jamais\s+tes cibles/)
    expect(note).toHaveTextContent(/Progression/)
  })

  it('n’affiche pas l’avertissement quand il n’y a rien à corriger', () => {
    render(<HistoryPanel seances={[]} store={faux([])} />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('compte les séances enregistrées', () => {
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} store={faux([JUILLET, CE_SOIR])} />)
    expect(screen.getByText('2 séances enregistrées, sur 2 semaines.')).toBeInTheDocument()
  })

  it('signale une date reconstituée de mémoire', () => {
    // Les deux séances de juillet du dossier de départ sont datées de mémoire.
    // Les présenter comme exactes serait leur donner une précision qu'elles n'ont pas.
    render(<HistoryPanel seances={[JUILLET]} store={faux([JUILLET])} />)
    expect(screen.getByText(/22\.07\.2026 \(environ\)/)).toBeInTheDocument()
  })

  it('alerte franchement sur une séance sans aucune série', () => {
    // Le pire résultat possible : finaliser sans avoir validé. Un bloc vide passerait
    // pour un défaut d'affichage ; il faut dire ce qui s'est réellement passé.
    const vide = seance({ id: 'vide', date: '2026-09-12', type: 'A' })
    render(<HistoryPanel seances={[vide]} store={faux([vide])} />)

    expect(screen.getByText(/Aucune série enregistrée/)).toBeInTheDocument()
    expect(screen.getByText(/non validées ne sont pas conservées/)).toBeInTheDocument()
  })

  it('affiche les notes quand il y en a, et rien quand il n’y en a pas', () => {
    render(<HistoryPanel seances={[CE_SOIR]} store={faux([CE_SOIR])} />)
    expect(screen.getByText('Bonne énergie')).toBeInTheDocument()
  })

  it('le dit quand l’historique est vide', () => {
    render(<HistoryPanel seances={[]} store={faux([])} />)
    expect(screen.getByText('Aucune séance enregistrée pour le moment.')).toBeInTheDocument()
  })

  it('ne modifie pas le tableau reçu', () => {
    // L'écran trie pour afficher ; la liste appartient à l'appelant.
    const liste = [JUILLET, CE_SOIR]
    render(<HistoryPanel seances={liste} store={faux(liste)} />)
    expect(liste[0]).toBe(JUILLET)
  })

  it('à date égale, met la dernière enregistrée en premier', () => {
    // D5 permet deux séances le même jour. Sans départage sur `ts`, l'ordre venait des
    // clés IndexedDB : la mauvaise des deux pouvait s'afficher dépliée, précisément
    // quand Ugo vient vérifier que celle du soir est là.
    const matin = seance({ id: 'matin', date: '2026-09-12', type: 'A', lines: ['Matin'], ts: 1000 })
    const soir = seance({ id: 'soir', date: '2026-09-12', type: 'C', lines: ['Soir'], ts: 2000 })

    render(<HistoryPanel seances={[matin, soir]} store={faux([matin, soir])} />)

    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Séance C')).toBeInTheDocument()
    expect(screen.getByText('Soir')).toBeInTheDocument()
    expect(screen.queryByText('Matin')).not.toBeInTheDocument()
  })

  it('place les séances sans horodatage après celles qui en ont', () => {
    // Les séances du dossier de départ n'ont qu'une date.
    const ancienne = seance({ id: 'seed', date: '2026-09-12', type: 'A', lines: ['Seed'] })
    const recente = seance({ id: 'live', date: '2026-09-12', type: 'C', lines: ['Live'], ts: 5 })

    render(<HistoryPanel seances={[ancienne, recente]} store={faux([ancienne, recente])} />)

    expect(within(screen.getAllByRole('listitem')[0]).getByText('Séance C')).toBeInTheDocument()
  })

  it('corrige la note d’une séance et la réaffiche', async () => {
    const store = faux([CE_SOIR])
    render(<HistoryPanel seances={[CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifier la note' }))
    fireEvent.change(screen.getByLabelText(/Note de la séance C/), {
      target: { value: 'Dos tendu' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Dos tendu')).toBeInTheDocument())
    expect(store.updateSeance).toHaveBeenCalledWith('s-ce-soir', { notes: 'Dos tendu' })
  })

  it('renonce à une correction sans rien écrire', async () => {
    const store = faux([CE_SOIR])
    render(<HistoryPanel seances={[CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifier la note' }))
    fireEvent.change(screen.getByLabelText(/Note de la séance C/), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(store.updateSeance).not.toHaveBeenCalled()
    expect(screen.getByText('Bonne énergie')).toBeInTheDocument()
  })

  it('ne supprime jamais sans confirmation, et dit que les cibles ne bougent pas', () => {
    // C'est le point qui surprend : supprimer une séance ne fait pas redescendre les
    // cibles (D6). Sans cette phrase avant le geste, Ugo supprimerait en croyant
    // annuler une progression et ne comprendrait pas le résultat.
    const store = faux([CE_SOIR])
    render(<HistoryPanel seances={[CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(store.deleteSeance).not.toHaveBeenCalled()
    expect(screen.getByText(/cibles ne changeront pas/)).toBeInTheDocument()
  })

  it('laisse garder la séance', () => {
    const store = faux([CE_SOIR])
    render(<HistoryPanel seances={[CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Garder la séance' }))

    expect(store.deleteSeance).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })

  it('supprime après confirmation et retire la séance de la liste', async () => {
    const store = faux([JUILLET, CE_SOIR])
    render(<HistoryPanel seances={[JUILLET, CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    await waitFor(() => expect(screen.queryByText('Séance C')).not.toBeInTheDocument())
    expect(store.deleteSeance).toHaveBeenCalledWith('s-ce-soir')
    expect(screen.getByText('1 séance enregistrée, sur 1 semaine.')).toBeInTheDocument()
  })

  it('dit pourquoi quand le magasin refuse, sans faire disparaître la séance', async () => {
    const store = faux([CE_SOIR])
    vi.mocked(store.deleteSeance).mockRejectedValueOnce(new Error('Stockage indisponible'))
    render(<HistoryPanel seances={[CE_SOIR]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(await screen.findByText('Stockage indisponible')).toBeInTheDocument()
    expect(screen.getByText('Séance C')).toBeInTheDocument()
  })

  it('corrige une charge mal saisie et met le résumé à jour', async () => {
    // Le cas réel : 95 tapé au lieu de 92,5. Sans ça, Ugo ne peut que supprimer toute
    // la séance pour corriger un chiffre.
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    expect(screen.getByText('Squat : 95×4 @8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.change(screen.getByLabelText(/Charge — Squat — top set/), {
      target: { value: '92,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Squat : 92,5×4 @8')).toBeInTheDocument())
    expect(screen.queryByText('Squat : 95×4 @8')).not.toBeInTheDocument()
  })

  it('retire une série validée par erreur', async () => {
    const enregistree = seanceAvecSeries()
    render(<HistoryPanel seances={[enregistree]} store={faux([enregistree])} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    // Depuis la contre-revue de #27, retirer demande un second geste : ces données
    // n'existent nulle part ailleurs, et supprimer une séance entière en demandait
    // déjà un.
    fireEvent.click(screen.getByRole('button', { name: 'Retirer définitivement' }))

    await waitFor(() => expect(screen.queryByText(/Squat :/)).not.toBeInTheDocument())
  })

  it('renonce à une correction sans rien écrire', async () => {
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.change(screen.getByLabelText(/Charge — Squat — top set/), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(store.updateSeance).not.toHaveBeenCalled()
    expect(screen.getByText('Squat : 95×4 @8')).toBeInTheDocument()
  })

  it('ne propose pas de corriger une série sur une séance du carnet papier', () => {
    // Les douze séances de départ n'ont pas de séries : inventer des champs à partir
    // du texte fabriquerait des données jamais saisies.
    render(<HistoryPanel seances={[JUILLET]} store={faux([JUILLET])} />)
    expect(screen.queryByText('Corriger une série')).not.toBeInTheDocument()
  })

  it('ne retire pas une série au premier tap, et dit que les cibles ne bougent pas', () => {
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(store.updateSeance).not.toHaveBeenCalled()
    expect(screen.getByText(/cibles ne changeront pas/)).toBeInTheDocument()
  })

  it('laisse garder la série', () => {
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Garder la série' }))

    expect(store.updateSeance).not.toHaveBeenCalled()
    expect(screen.getByText('Squat : 95×4 @8')).toBeInTheDocument()
  })

  it('dit pourquoi quand la saisie n’est pas un nombre, au lieu de ne rien faire', () => {
    // Le pire retour possible : taper « Enregistrer » et que rien ne se passe.
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.change(screen.getByLabelText(/Charge — Squat — top set/), {
      target: { value: '92,5abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(store.updateSeance).not.toHaveBeenCalled()
    expect(screen.getByText(/Entre des nombres/)).toBeInTheDocument()
  })

  it('accepte un champ laissé vide, qui veut dire « non noté »', async () => {
    const enregistree = seanceAvecSeries()
    const store = faux([enregistree])
    render(<HistoryPanel seances={[enregistree]} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /Squat — top set/ }))
    fireEvent.change(screen.getByLabelText(/RPE — Squat — top set/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(store.updateSeance).toHaveBeenCalled())
    expect(screen.queryByText(/Entre des nombres/)).not.toBeInTheDocument()
  })
})
