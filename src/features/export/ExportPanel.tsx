/**
 * Écran d'échange — CB-40.
 *
 * Deux gestes très différents dans la même page, et c'est voulu : ils se répondent.
 * Exporter est anodin et se fait souvent ; importer écrase tout et se fait une fois
 * tous les six mois. L'écran doit donc rendre le premier immédiat et le second lent.
 *
 * Le chemin nominal, celui qu'Ugo fera après chaque séance : un tap sur « Exporter »,
 * le JSON est dans le presse-papiers, il le colle à Claude.
 */

import { useCallback, useState } from 'react'
import { exportFilename, serializeExport } from '../../db/exchange.ts'
import type { ImportPreview } from '../../db/contracts.ts'
import type { ExportFile } from '../../domain/schema.ts'
import { formatDate } from '../../domain/format.ts'

export interface ExchangePort {
  exportAll(): Promise<ExportFile>
  previewImport(input: unknown): Promise<ImportPreview>
  importReplace(input: unknown): Promise<{ seanceCount: number }>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
}

/**
 * Déclenche le téléchargement du fichier.
 *
 * Reste disponible même si la copie presse-papiers échoue : sur iOS, l'accès au
 * presse-papiers est refusé hors geste utilisateur direct, et perdre l'export parce
 * qu'une permission manque serait absurde.
 */
function download(contenu: string, nom: string): void {
  const blob = new Blob([contenu], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.append(lien)
  lien.click()
  lien.remove()
  URL.revokeObjectURL(url)
}

export function ExportPanel({ store }: { store: ExchangePort }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [texte, setTexte] = useState('')
  const [apercu, setApercu] = useState<ImportPreview | null>(null)

  const exporter = useCallback(
    async (avecCopie: boolean) => {
      setStatus({ kind: 'busy' })
      try {
        const fichier = await store.exportAll()
        const contenu = serializeExport(fichier)
        const nom = exportFilename()

        if (avecCopie) {
          try {
            await navigator.clipboard.writeText(contenu)
            setStatus({
              kind: 'ok',
              message: `${fichier.seances.length} séances copiées. Colle-les dans ta conversation Claude.`,
            })
            return
          } catch {
            // La copie a été refusée : on bascule sur le téléchargement plutôt que
            // de laisser Ugo sans rien.
            download(contenu, nom)
            setStatus({
              kind: 'ok',
              message: `Copie refusée par le navigateur. Fichier téléchargé : ${nom}`,
            })
            return
          }
        }

        download(contenu, nom)
        setStatus({ kind: 'ok', message: `Fichier téléchargé : ${nom}` })
      } catch (error) {
        setStatus({ kind: 'error', message: messageOf(error) })
      }
    },
    [store],
  )

  const preparer = useCallback(async () => {
    setApercu(null)
    setStatus({ kind: 'busy' })
    try {
      const preview = await store.previewImport(JSON.parse(texte))
      setApercu(preview)
      setStatus({ kind: 'idle' })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: texte.trim() === '' ? 'Colle d’abord un export.' : messageOf(error),
      })
    }
  }, [store, texte])

  const remplacer = useCallback(async () => {
    setStatus({ kind: 'busy' })
    try {
      const { seanceCount } = await store.importReplace(JSON.parse(texte))
      setApercu(null)
      setTexte('')
      setStatus({
        kind: 'ok',
        message: `${seanceCount} séances importées. Tes données remplacées.`,
      })
    } catch (error) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }, [store, texte])

  const occupe = status.kind === 'busy'

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 py-4 pb-8">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold">Exporter</h1>
          <p className="mt-1 text-sm text-muted">
            Après chaque séance, copie tes données et colle-les dans ta conversation Claude. C’est
            aussi ta seule sauvegarde : l’app ne stocke rien ailleurs que sur ce téléphone.
          </p>
        </div>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-bg disabled:opacity-50"
          onClick={() => void exporter(true)}
          disabled={occupe}
        >
          Copier mes séances
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-4 font-medium text-fg disabled:opacity-50"
          onClick={() => void exporter(false)}
          disabled={occupe}
        >
          Télécharger le fichier
        </button>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <div>
          <h2 className="text-lg font-bold">Importer</h2>
          <p className="mt-1 text-sm text-muted">
            Remplace <strong>tout</strong> ton historique et tes cibles par le contenu collé.
            Exporte d’abord si tu veux pouvoir revenir en arrière.
          </p>
        </div>
        <label className="text-sm font-medium text-muted">
          Contenu de l’export
          <textarea
            className="mt-1 h-32 w-full rounded-xl border border-line bg-bg p-3 font-mono text-xs text-fg outline-none focus:border-accent"
            value={texte}
            onChange={(event) => {
              setTexte(event.target.value)
              setApercu(null)
            }}
            placeholder="Colle ici un export JSON"
            spellCheck={false}
          />
        </label>

        {apercu ? (
          <div className="rounded-xl border border-warn/60 bg-surface p-3 text-sm">
            <p className="font-semibold text-warn">À confirmer</p>
            <p className="mt-1 text-muted">
              {apercu.seanceCount} séances
              {apercu.firstDate
                ? ` (${formatDate(apercu.firstDate)} → ${formatDate(apercu.lastDate ?? apercu.firstDate)})`
                : ''}{' '}
              vont remplacer tes {apercu.replacing.seanceCount} séances actuelles et tes cibles du{' '}
              {formatDate(apercu.replacing.targetsUpdatedAt)}.
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 w-full rounded-xl bg-bad px-4 font-semibold text-fg disabled:opacity-50"
              onClick={() => void remplacer()}
              disabled={occupe}
            >
              Remplacer définitivement
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-4 font-medium text-fg disabled:opacity-50"
            onClick={() => void preparer()}
            disabled={occupe}
          >
            Vérifier ce contenu
          </button>
        )}
      </section>

      <p
        className={`min-h-6 text-sm ${status.kind === 'error' ? 'text-bad' : 'text-ok'}`}
        aria-live="polite"
        role="status"
      >
        {status.kind === 'ok' || status.kind === 'error' ? status.message : ''}
      </p>
    </main>
  )
}
