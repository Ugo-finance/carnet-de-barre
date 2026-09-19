import { defineConfig } from '@playwright/test'
import { PORT_APERCU } from './scripts/ports.mjs'

/**
 * Le port de l'aperçu se **dérive du chemin de cette copie** — CB-81.
 *
 * `4173` est le défaut de `vite preview`, donc le port que prend *toute* copie du
 * projet. Le worktree de Codex est le même projet avec la même configuration : deux
 * suites lancées en même temps se battaient pour le même port, et le réflexe « libérer
 * le port » de l'un tuait le serveur de l'autre en pleine exécution. L'échec ressemblait
 * alors à un test instable.
 */
const port = process.env.PLAYWRIGHT_PORT ?? String(PORT_APERCU)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    timezoneId: 'Europe/Zurich',
    permissions: ['clipboard-read', 'clipboard-write'],
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
