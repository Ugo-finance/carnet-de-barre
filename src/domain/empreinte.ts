/**
 * Une empreinte de contenu, pour qu'une confirmation ne porte jamais sur autre chose que
 * ce qui a été montré — CB-79a.
 *
 * ## Pourquoi sur le contenu, et pas sur des compteurs
 *
 * Le réflexe serait de résumer le carnet par son nombre de séances, sa dernière date et
 * la date de mise à jour des cibles. Ce résumé **ne bouge pas** quand Ugo corrige une
 * séance passée (D6) : ni le nombre, ni la date, ni l'instant technique `ts` ne
 * changent. Une confirmation prise sur l'aperçu d'avant la correction passerait donc le
 * contrôle et écraserait la correction sans rien dire.
 *
 * L'empreinte porte donc sur **tout** ce qui serait remplacé. Le carnet entier pèse
 * 5 Ko ; en relire le contenu coûte moins qu'un aperçu faux.
 *
 * ## Ce que ce n'est pas
 *
 * **Pas une fonction de hachage cryptographique**, et rien ici n'en dépend. C'est un
 * détecteur de changement entre deux lectures de la même base, à quelques secondes
 * d'intervalle. Il n'y a pas d'adversaire qui fabrique une collision : il y a Ugo qui
 * valide une série dans un autre onglet. FNV-1a suffit, ne coûte aucune dépendance, et
 * donne le même résultat sur tous les navigateurs — ce que `crypto.subtle`, asynchrone
 * et absent de certains contextes de test, ne donnerait pas aussi simplement.
 */

/**
 * Sérialisation **canonique** : les clés sont triées, à toute profondeur.
 *
 * `JSON.stringify` respecte l'ordre d'insertion. Deux objets égaux mais construits
 * différemment produiraient deux textes différents, donc deux empreintes différentes,
 * donc un refus de confirmation que rien ne justifie. Trier supprime la question plutôt
 * que de parier sur le fait que les deux chemins de lecture construisent pareil.
 */
function canonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur) ?? 'null'
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(',')}]`
  const entrees = Object.entries(valeur as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entrees.map(([cle, v]) => `${JSON.stringify(cle)}:${canonique(v)}`).join(',')}}`
}

/** FNV-1a 32 bits, rendu en hexadécimal. */
export function empreinte(valeur: unknown): string {
  const texte = canonique(valeur)
  let hash = 0x811c9dc5
  for (let i = 0; i < texte.length; i += 1) {
    hash ^= texte.charCodeAt(i)
    // Multiplication par le nombre premier FNV, en restant dans les 32 bits non signés.
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  // La longueur entre dans l'empreinte : deux textes de tailles très différentes ne
  // peuvent plus se confondre sur une collision de 32 bits seule.
  return `${hash.toString(16).padStart(8, '0')}-${texte.length.toString(16)}`
}
