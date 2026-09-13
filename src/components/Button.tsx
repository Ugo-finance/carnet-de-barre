import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-accent text-white',
  secondary: 'border-line bg-surface-2 text-fg',
  ghost: 'border-line bg-transparent text-muted',
  danger: 'border-bad/60 bg-transparent text-bad',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

/** Bouton commun : cible tactile, focus clavier et retour d'appui sont définis une fois. */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`motion-press min-h-11 rounded-xl border px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
}
