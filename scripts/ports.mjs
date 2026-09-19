/**
 * Des ports qui n'appartiennent qu'à cette copie du dépôt — CB-81.
 *
 * ## Le problème, tel qu'il s'est présenté
 *
 * Trois choses tournent sur cette machine et se disputaient les mêmes ports :
 *
 * 1. **ce dépôt** ;
 * 2. **le worktree de Codex**, `carnet-de-barre-codex`, qui est le *même projet* et donc
 *    la *même configuration* — c'est la collision la plus probable et la moins visible ;
 * 3. **Portail Paie**, l'autre projet d'Ugo, sur le port 3000 et sa propre pile Supabase.
 *
 * Le port 4173 est le défaut de `vite preview`. Deux copies du carnet le prennent donc
 * toutes les deux, et la seconde échoue — ou pire, la première se fait tuer par le
 * réflexe « libérer le port » de l'autre agent, en plein milieu de sa suite de tests.
 * L'échec ressemble alors à un test instable, pas à un conflit.
 *
 * ## La règle
 *
 * Le port se **dérive du chemin absolu de la copie**. Deux worktrees du même dépôt sont
 * à des chemins différents, donc sur des ports différents, sans que personne ait à y
 * penser ni à coordonner quoi que ce soit. Et il reste stable pour une copie donnée,
 * donc on peut le noter dans un signet.
 *
 * On ne choisit pas un port « probablement libre » : on choisit un port **qui n'est celui
 * de personne d'autre**, ce qui n'est pas la même chose.
 */

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/** La racine de *cette* copie du dépôt. */
export const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Un décalage de 0 à 99, stable pour un chemin donné.
 *
 * Volontairement petit : les plages restent lisibles, et une collision entre deux
 * worktrees supposerait le même reste sur cent, ce que le contrôle d'occupation attrape
 * de toute façon avant de lancer quoi que ce soit.
 */
function decalage(chemin = racine) {
  const empreinte = createHash('sha256').update(chemin).digest()
  return empreinte.readUInt16BE(0) % 100
}

/**
 * Les plages sont choisies **loin des défauts** : 4173 pour `vite preview`, 5173 pour
 * `vite dev`, 3000 pour Next. Une copie de ce dépôt ne peut donc pas prendre par hasard
 * le port qu'attend un autre outil.
 */
export const PORT_APERCU = 4400 + decalage()
export const PORT_DEV = 5400 + decalage()

/** Ce que les scripts affichent, pour qu'un port surprenant ne soit jamais un mystère. */
export function expliquer() {
  return `carnet-de-barre · ${racine}\n  aperçu (e2e) : ${PORT_APERCU}\n  dev          : ${PORT_DEV}`
}
