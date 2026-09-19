import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { PORT_APERCU, PORT_DEV } from './scripts/ports.mjs'

// https://vite.dev/config/
export default defineConfig({
  // Ports dérivés du chemin de cette copie — CB-81. Les défauts de Vite (5173 et 4173)
  // sont ceux de *toutes* les copies du projet, worktree de Codex compris, et deux
  // serveurs qui se disputent un port produisent un échec qui ne ressemble pas à un
  // conflit. `strictPort` fait échouer bruyamment plutôt que glisser sur le port voisin,
  // qui pourrait appartenir à quelqu'un d'autre.
  server: { port: PORT_DEV, strictPort: true },
  preview: { port: PORT_APERCU, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Pas de rechargement automatique : une séance active ne doit jamais être interrompue (D10).
      registerType: 'prompt',
      includeAssets: ['icons/*.{svg,png}'],
      manifest: {
        name: 'Carnet de barre',
        short_name: 'Carnet',
        description: 'Carnet de musculation personnel, hors ligne.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
