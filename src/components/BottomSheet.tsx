import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

type BottomSheetProps = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}

/**
 * Feuille basse modale. `showModal` fournit le piégeage de focus natif ; le fallback
 * garde le composant testable sous jsdom.
 */
export function BottomSheet({ open, title, children, onClose }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-40 m-0 h-full max-h-none w-full max-w-none bg-black/65 p-0 text-fg backdrop:bg-black/65"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="motion-enter fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-faint" aria-hidden="true" />
        <header className="flex min-h-11 items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <Button variant="ghost" className="shrink-0 px-3" aria-label="Fermer" onClick={onClose}>
            Fermer
          </Button>
        </header>
        <div className="mt-3">{children}</div>
      </section>
    </dialog>
  )
}
