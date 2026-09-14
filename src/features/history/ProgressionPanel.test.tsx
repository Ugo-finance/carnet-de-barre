import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressionPanel } from './ProgressionPanel'
import { MemoryStore } from '../../db/memory'
import { recordCharge } from '../../domain/e1rm'
import { topsPasses } from '../../db/selectors'
import { formatDate, formatLoad } from '../../domain/format'
import type { Draft, Seance } from '../../domain/types'

async function magasinPret(): Promise<MemoryStore> {
  const store = new MemoryStore()
  await store.ready()
  return store
}

/**
 * Le panneau tel que l'onglet le monte : cibles, historique et brouillon éventuel.
 * Passer par le vrai magasin plutôt que par des cibles écrites à la main garantit que
 * les records affichés viennent des douze séances du dossier de départ.
 */
async function monter(
  store: MemoryStore,
  options: { draft?: Draft; seances?: Seance[] } = {},
): Promise<void> {
  render(
    <ProgressionPanel
      targets={await store.getTargets()}
      seances={options.seances ?? (await store.listSeances())}
      draft={options.draft}
      store={store}
    />,
  )
}

function carte(nom: string): HTMLElement {
  const titre = screen.getByRole('heading', { name: nom, level: 2 })
  const item = titre.closest('li')
  if (!item) throw new Error(`Aucune carte pour ${nom}`)
  return item
}

describe('affichage de la progression', () => {
  it('montre les cinq cibles courantes', async () => {
    const store = await magasinPret()
    await monter(store)

    expect(within(carte('Squat')).getByText('75 kg')).toBeInTheDocument()
    expect(within(carte('Soulevé de terre')).getByText('92,5 kg')).toBeInTheDocument()
    // Le lest des tractions s'écrit avec son signe : ce n'est pas une charge de barre.
    expect(within(carte('Tractions lestées')).getByText('+15 kg')).toBeInTheDocument()
  })

  it('explique pourquoi une cible ne bouge pas après un échec', async () => {
    // Sans cette ligne, une cible figée passe pour un bug alors que c'est la règle.
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    await monter(store)

    expect(screen.getByText(/Deuxième essai à 70 kg/)).toBeInTheDocument()
  })

  it('ne propose « Repartir à zéro » que s’il y a un échec en attente', async () => {
    const store = await magasinPret()
    await monter(store)

    expect(screen.queryByRole('button', { name: 'Repartir à zéro' })).not.toBeInTheDocument()
  })
})

describe('records — CB-13', () => {
  it('montre le record de charge avec sa propre date, pas celle du jour', async () => {
    // L'écran doit afficher ce que le domaine calcule, pas une valeur recalculée à sa
    // façon. Comparer au domaine plutôt qu'à une date écrite en dur fait que le test
    // reste vrai si le dossier de départ change, et faux si l'écran se met à choisir
    // lui-même son record.
    const store = await magasinPret()
    const seances = await store.listSeances()
    const attendu = recordCharge(topsPasses(seances), 'squat')
    expect(attendu).not.toBeNull()
    await monter(store, { seances })

    const squat = carte('Squat')
    expect(within(squat).getByText(`Record · ${formatDate(attendu!.date)}`)).toBeInTheDocument()
    expect(within(squat).getByText(formatLoad(attendu!.valeur, 'barTotal'))).toBeInTheDocument()
  })

  it('refuse d’estimer un maximum sur les tractions, et dit pourquoi', async () => {
    // Le lest n'estime rien sans le poids de corps. Afficher « — » ferait croire à Ugo
    // qu'il suffit de noter un RPE, alors qu'aucun RPE ne rendra la formule applicable.
    const store = await magasinPret()
    await monter(store)

    expect(
      within(carte('Tractions lestées')).getByText('Non estimable sans ton poids de corps.'),
    ).toBeInTheDocument()
  })

  it('demande un RPE quand le maximum est calculable mais qu’aucun top set n’en porte', async () => {
    const store = await magasinPret()
    const sansRpe = (await store.listSeances()).map((seance) => ({
      ...seance,
      tops: Object.fromEntries(
        Object.entries(seance.tops).map(([lift, top]) => [lift, { ...top, rpe: null }]),
      ),
    }))
    await monter(store, { seances: sansRpe })

    expect(within(carte('Squat')).getByText('Note un RPE sur un top set.')).toBeInTheDocument()
  })

  it('nomme ce qui manque encore, avec son motif, au lieu d’afficher un blanc', async () => {
    const store = await magasinPret()
    await monter(store)

    expect(screen.getByText('Tonnage · pas encore')).toBeInTheDocument()
    expect(screen.getByText(/chariot de la presse/)).toBeInTheDocument()
  })
})

describe('ajustement en feuille basse', () => {
  const ouvrirSquat = () => {
    fireEvent.click(within(carte('Squat')).getByRole('button', { name: 'Ajuster' }))
  }

  it('sort l’ajustement en feuille, et non replié dans la ligne', async () => {
    // CB-66 l'exige sorti : la ligne du squat est hors d'atteinte du pouce.
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    const feuille = screen.getByRole('dialog')
    expect(feuille).toHaveAccessibleName('Ajuster Squat')
    expect(within(feuille).getByLabelText('Nouvelle cible Squat')).toBeInTheDocument()
  })

  it('pose une nouvelle cible et la réaffiche', async () => {
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '77,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))

    await waitFor(() => expect(within(carte('Squat')).getByText('77,5 kg')).toBeInTheDocument())
    expect((await store.getTargets()).squat.w).toBe(77.5)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('accepte la virgule décimale', async () => {
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '82,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))

    await waitFor(() => expect(within(carte('Squat')).getByText('82,5 kg')).toBeInTheDocument())
  })

  it('pré-remplit avec la cible actuelle', async () => {
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    expect(screen.getByLabelText('Nouvelle cible Squat')).toHaveValue('75')
  })

  it('renonce sans rien changer', async () => {
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(carte('Squat')).getByText('75 kg')).toBeInTheDocument()
    expect((await store.getTargets()).squat.w).toBe(75)
  })

  it('refuse une valeur absurde et le dit, sans rien écrire', async () => {
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '750' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/500 kg/)
    expect((await store.getTargets()).squat.w).toBe(75)
  })

  it('refuse un nombre suivi de n’importe quoi, au lieu de garder le début', async () => {
    // Number.parseFloat('77,5abc') rend 77.5 sans rien signaler : l'écran annonce
    // refuser les fautes de frappe et enregistrerait une valeur jamais relue.
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), {
      target: { value: '77,5abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/en chiffres/)
    expect((await store.getTargets()).squat.w).toBe(75)
    expect(within(carte('Squat')).getByText('75 kg')).toBeInTheDocument()
  })

  it('garde la feuille et la saisie quand la valeur est refusée', async () => {
    // Refermer obligerait à tout retaper pour corriger un chiffre.
    const store = await magasinPret()
    await monter(store)
    ouvrirSquat()

    fireEvent.change(screen.getByLabelText('Nouvelle cible Squat'), { target: { value: '750' } })
    fireEvent.click(screen.getByRole('button', { name: 'Poser la cible' }))

    await screen.findByRole('status')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Nouvelle cible Squat')).toHaveValue('750')
  })

  it('efface un échec en attente à la demande', async () => {
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    await monter(store)

    fireEvent.click(screen.getByRole('button', { name: 'Repartir à zéro' }))

    await waitFor(() => expect(screen.queryByText(/Deuxième essai/)).not.toBeInTheDocument())
    expect((await store.getTargets()).bench.fail).toBeNull()
  })
})

describe('lecture seule pendant une séance', () => {
  async function avecSeanceEnCours(): Promise<MemoryStore> {
    const store = await magasinPret()
    await store.startSession('A', '2026-09-15')
    return store
  }

  it('cache les actions et explique pourquoi', async () => {
    const store = await avecSeanceEnCours()
    await monter(store, { draft: await store.loadDraft() })

    expect(screen.queryByRole('button', { name: 'Ajuster' })).not.toBeInTheDocument()
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument()
    expect(screen.getByText(/empêcherait d’enregistrer ta séance/)).toBeInTheDocument()
  })

  it('cache aussi « Repartir à zéro », qui modifie tout autant', async () => {
    // Effacer un échec en attente change la cible : ça diverge comme le reste.
    const store = await magasinPret()
    await store.adjustTarget('bench', { fail: 70 })
    await store.startSession('A', '2026-09-15')
    await monter(store, { draft: await store.loadDraft() })

    expect(screen.queryByRole('button', { name: 'Repartir à zéro' })).not.toBeInTheDocument()
    // L'information, elle, reste visible : c'est ce qu'il est venu chercher.
    expect(screen.getByText(/Deuxième essai à 70 kg/)).toBeInTheDocument()
  })

  it('laisse tout faire quand aucune séance n’est en cours', async () => {
    const store = await magasinPret()
    await monter(store)

    expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })

  it('laisse tout faire quand le brouillon existe mais n’a jamais été commencé', async () => {
    // Un brouillon vierge n'est pas une séance. La distinction vit dans
    // `isDraftActive`, et l'écran ne la recopie pas : il passe le brouillon tel quel.
    const store = await magasinPret()
    const vierge = await store.openDraft('A', '2026-09-15')
    await monter(store, { draft: vierge })

    expect(screen.getAllByRole('button', { name: 'Ajuster' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
  })
})
