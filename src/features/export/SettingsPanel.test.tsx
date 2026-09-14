import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PREFERENCES_PAR_DEFAUT, type Preferences } from '../../domain/preferences'
import type { SettingsPort } from './SettingsPanel'
import { SettingsPanel } from './SettingsPanel'

function settingsStore(initial: Preferences = PREFERENCES_PAR_DEFAUT): SettingsPort {
  let preferences = initial
  return {
    getPreferences: vi.fn(async () => preferences),
    savePreferences: vi.fn(async (patch) => {
      preferences = { ...preferences, ...patch }
      return preferences
    }),
    exportAll: vi.fn(),
    previewImport: vi.fn(),
    importReplace: vi.fn(),
  }
}

describe('réglages', () => {
  it('affiche les quatre préférences avec un état textuel et persiste un changement', async () => {
    const store = settingsStore()
    const onPreferencesChange = vi.fn()
    render(<SettingsPanel store={store} onPreferencesChange={onPreferencesChange} />)

    const vibration = await screen.findByRole('switch', { name: 'Vibration' })
    expect(vibration).toHaveAttribute('aria-checked', 'true')
    expect(vibration).toHaveTextContent('Activé')

    fireEvent.click(vibration)

    await waitFor(() => expect(store.savePreferences).toHaveBeenCalledWith({ vibration: false }))
    expect(vibration).toHaveAttribute('aria-checked', 'false')
    expect(vibration).toHaveTextContent('Coupé')
    expect(onPreferencesChange).toHaveBeenCalledOnce()
    expect(screen.getAllByRole('switch')).toHaveLength(4)
  })

  it('conserve la valeur affichée et explique un refus d’écriture', async () => {
    const store = settingsStore()
    vi.mocked(store.savePreferences).mockRejectedValueOnce(new Error('quota dépassé'))
    render(<SettingsPanel store={store} />)
    const sound = await screen.findByRole('switch', { name: 'Son du chrono' })

    fireEvent.click(sound)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Réglage non enregistré : quota dépassé',
    )
    expect(sound).toHaveAttribute('aria-checked', 'true')
  })

  it('présente le matériel en lecture seule et garde l’échange de données atteignable', async () => {
    render(<SettingsPanel store={settingsStore()} />)
    await screen.findByRole('switch', { name: 'Vibration' })
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Matériel' }))

    const hardware = screen.getByRole('heading', { name: 'Matériel connu' }).closest('section')!
    expect(within(hardware).getByText('20 kg')).toBeInTheDocument()
    expect(within(hardware).getByText('75,7 kg · hors saisie')).toBeInTheDocument()
    expect(within(hardware).getByText('2 kg')).toBeInTheDocument()
    expect(within(hardware).getByText('2,5 kg')).toBeInTheDocument()
    expect(within(hardware).getByText(/la charge de presse saisie exclut le chariot/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Export' }))
    expect(screen.getByRole('button', { name: 'Copier mes séances' })).toBeInTheDocument()
    expect(screen.queryByText(/Dernière sauvegarde/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Import' }))
    expect(screen.getByRole('button', { name: 'Vérifier ce contenu' })).toBeInTheDocument()
  })

  it('avance page par page et permet de revenir aux préférences', async () => {
    render(<SettingsPanel store={settingsStore()} />)
    await screen.findByRole('switch', { name: 'Vibration' })

    expect(screen.getByLabelText('Page 1 sur 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Matériel' }))
    expect(screen.getByLabelText('Page 2 sur 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Export' }))
    expect(screen.getByLabelText('Page 3 sur 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : Import' }))
    expect(screen.getByLabelText('Page 4 sur 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(await screen.findByRole('switch', { name: 'Vibration' })).toBeInTheDocument()
  })
})
