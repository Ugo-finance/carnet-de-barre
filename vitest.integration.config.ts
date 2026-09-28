/**
 * Les tests d'intégration contre la pile Supabase locale — CB-79d.
 *
 * Séparés de la configuration principale **exprès** : `npm run check`, que la CI lance, ne
 * doit pas les voir, puisqu'ils exigent Docker et une pile démarrée. Les y inclure
 * apprendrait à ignorer un rouge.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // Chaque test inscrit son propre compte : ils peuvent tourner en parallèle, mais la
    // pile locale répond mieux à un seul fil, et l'ordre des échecs reste lisible.
    fileParallelism: false,
  },
})
