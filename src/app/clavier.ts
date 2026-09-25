import { useEffect } from 'react'

/**
 * Garder « Valider » au-dessus du clavier — CB-82.
 *
 * Signalé par Ugo le 25.09, en salle : taper une charge ouvrait le clavier numérique, la
 * carte ne se réorganisait pas, et le bouton restait dessous. Il tapait là où le bouton
 * devait être, et rien ne se passait.
 *
 * ## Pourquoi `visualViewport`, et pas `dvh`
 *
 * Sur iOS, ouvrir le clavier **ne change pas** la hauteur de mise en page : `dvh` et
 * `innerHeight` restent à la hauteur de l'écran. Seul `visualViewport` rétrécit. Un
 * conteneur dimensionné en `dvh` croit donc avoir toute la place, n'a rien à faire
 * défiler, et laisse le bas de la carte sous le clavier.
 *
 * On pose donc la hauteur réellement visible dans `--hauteur-visible`, et le conteneur de
 * séance s'y ajuste. Clavier ouvert, il devient plus court que la carte, donc défilable —
 * et on fait défiler juste ce qu'il faut pour que l'action de la carte reparaisse.
 */

/** Un écart sous lequel un rétrécissement n'est pas un clavier (barre d'adresse, etc.). */
const SEUIL_CLAVIER = 120

export function useHauteurVisible(actif: boolean): void {
  useEffect(() => {
    if (!actif) return
    const vue = window.visualViewport
    if (!vue) return
    const racine = document.documentElement

    const appliquer = () => {
      racine.style.setProperty('--hauteur-visible', `${Math.round(vue.height)}px`)
      if (window.innerHeight - vue.height > SEUIL_CLAVIER) {
        // Après la mise en page : le conteneur doit d'abord avoir pris sa nouvelle hauteur.
        requestAnimationFrame(remonterActionDeLaCarte)
      }
    }

    // Passer d'un champ à l'autre, clavier déjà ouvert, ne redimensionne rien : il faut
    // aussi réagir au focus, sinon la seconde carte retomberait sous le clavier.
    const surFocus = () => requestAnimationFrame(appliquer)

    vue.addEventListener('resize', appliquer)
    document.addEventListener('focusin', surFocus)
    appliquer()
    return () => {
      vue.removeEventListener('resize', appliquer)
      document.removeEventListener('focusin', surFocus)
      racine.style.removeProperty('--hauteur-visible')
    }
  }, [actif])
}

/**
 * Fait reparaître l'action de la carte où se trouve le champ en cours de saisie.
 *
 * L'action est le **dernier bouton** de la carte : c'est l'ordre que rend
 * `FocusSetCard` (« Passer », puis l'action principale). Se fier au libellé serait plus
 * fragile — il change selon la série — et ajouter un repère dans la carte toucherait un
 * fichier qui n'est pas réservé à ce lot.
 *
 * `block: 'nearest'` ne fait défiler que ce qui est nécessaire : le bouton vient se poser
 * juste au-dessus du clavier, et le champ tapé reste en vue au-dessus de lui.
 */
function remonterActionDeLaCarte(): void {
  const focalise = document.activeElement
  if (!(focalise instanceof HTMLElement)) return
  const carte = focalise.closest('article')
  if (!carte) return
  const boutons = carte.querySelectorAll('button')
  boutons[boutons.length - 1]?.scrollIntoView({ block: 'nearest' })
}
