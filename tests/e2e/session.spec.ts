import { expect, test, type Page } from '@playwright/test'

const SUNDAY = '2026-09-20T14:00:00.000Z'

async function openSunday(page: Page): Promise<void> {
  await page.clock.setFixedTime(SUNDAY)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()
}

async function storedDraft(page: Page): Promise<{
  notes: string
  sets: { role: string; status: string; rpe: number | null }[]
} | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('carnet')
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('drafts').objectStore('drafts').getAll()
        request.addEventListener('success', () => resolve(request.result[0] ?? null), {
          once: true,
        })
        request.addEventListener('error', () => reject(request.error), { once: true })
      })
    } finally {
      database.close()
    }
  })
}

async function validateDeadliftTop(page: Page): Promise<void> {
  const deadlift = page.getByRole('article', { name: 'Soulevé de terre' })
  const top = deadlift.getByRole('article', { name: 'Top set' })
  await top.getByRole('button', { name: 'RPE 8 — effort cible' }).click()
  await top.getByRole('button', { name: 'Valider' }).click()
  await expect(top.getByText('Validée')).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect
    .poll(async () => (await storedDraft(page))?.sets.find((set) => set.role === 'top')?.status)
    .toBe('validated')
}

async function finishTwice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  const confirm = page.getByRole('button', { name: 'Terminer quand même' })
  await expect(confirm).toBeVisible()
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await expect(page.getByRole('heading', { name: 'Séance C terminée' })).toBeVisible()
}

test('parcours réel, reprise et double finalisation', async ({ page }) => {
  await openSunday(page)
  await validateDeadliftTop(page)

  await page.reload()
  const top = page
    .getByRole('article', { name: 'Soulevé de terre' })
    .getByRole('article', { name: 'Top set' })
  await expect(top.getByText('Validée')).toBeVisible()
  await expect(top.getByRole('button', { name: 'Modifier' })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()

  await finishTwice(page)
  await expect(page.getByText('Soulevé de terre → 97,5 kg')).toBeVisible()

  await page.getByRole('button', { name: 'Historique' }).click()
  await expect(page.getByText('13 séances enregistrées.')).toBeVisible()

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Copier mes séances' }).click()
  await expect(page.getByText(/13 séances copiées/)).toBeVisible()
  const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    schemaVersion: number
    seances: { date: string; type: string }[]
  }
  expect(exported.schemaVersion).toBeGreaterThan(0)
  expect(exported.seances).toHaveLength(13)
  expect(exported.seances).toContainEqual(
    expect.objectContaining({ date: '2026-09-20', type: 'C' }),
  )
})

test('ouverture, saisie et finalisation restent disponibles hors ligne', async ({
  context,
  page,
}) => {
  await openSunday(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Le premier rechargement donne le contrôle de la page au service worker installé.
  await page.reload()
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()

  const notes = page.getByLabel('Notes de séance (facultatif)')
  await notes.fill('Recette hors ligne')
  await expect.poll(async () => (await storedDraft(page))?.notes).toBe('Recette hors ligne')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Notes de séance (facultatif)')).toHaveValue('Recette hors ligne')

  await validateDeadliftTop(page)
  await finishTwice(page)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Copier mes séances' }).click()
  await expect(page.getByText(/13 séances copiées/)).toBeVisible()
})
