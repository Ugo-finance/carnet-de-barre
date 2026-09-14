import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const SUNDAY = '2026-09-20T14:00:00.000Z'

async function openSunday(page: Page, start = true): Promise<void> {
  await page.clock.setFixedTime(SUNDAY)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()
  if (!start) return
  await page.getByRole('button', { name: 'Démarrer la séance C' }).click()
  await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 1' })).toBeVisible()
}

async function resumeActiveSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reprendre la séance' }).click()
  await expect(page.getByRole('heading', { name: 'Soulevé de terre' })).toBeVisible()
}

async function storedDraft(page: Page): Promise<{
  notes: string
  sets: { id: string; role: string; status: string; rpe: number | null }[]
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

async function removeWarmupsFromStoredDraft(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('carnet')
        open.addEventListener(
          'success',
          () => {
            const database = open.result
            const transaction = database.transaction('drafts', 'readwrite')
            const drafts = transaction.objectStore('drafts')
            const request = drafts.getAll()
            request.addEventListener(
              'success',
              () => {
                const draft = request.result[0]
                if (!draft) {
                  transaction.abort()
                  reject(new Error('Brouillon introuvable'))
                  return
                }
                drafts.put({
                  ...draft,
                  sets: draft.sets.filter((set: { role: string }) => set.role !== 'warmup'),
                })
              },
              { once: true },
            )
            request.addEventListener('error', () => reject(request.error), { once: true })
            transaction.addEventListener(
              'complete',
              () => {
                database.close()
                resolve()
              },
              { once: true },
            )
            transaction.addEventListener('error', () => reject(transaction.error), { once: true })
          },
          { once: true },
        )
        open.addEventListener('error', () => reject(open.error), { once: true })
      }),
  )
}

async function copiedExport(
  page: Page,
  expectedCount = 13,
): Promise<{
  schemaVersion: number
  targets: { deadlift: { w: number } }
  seances: {
    date: string
    type: string
    lines: string[]
    sets?: { id: string; role: string; status: string }[]
  }[]
}> {
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Copier mes séances' }).click()
  await expect(page.getByText(new RegExp(`${expectedCount} séances copiées`))).toBeVisible()
  return JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
}

async function validateDeadliftTop(page: Page): Promise<void> {
  for (const index of [1, 2, 3]) {
    const warmup = page.getByRole('article', { name: `Soulevé de terre · palier ${index}` })
    if (await warmup.isVisible()) {
      await warmup.getByRole('button', { name: 'Valider' }).click()
      await expect(warmup).toHaveCount(0)
    }
  }

  const top = page.getByRole('article', { name: 'Soulevé de terre · série de travail' })
  await expect(top).toBeVisible()
  await top.getByRole('button', { name: 'RPE 8 — effort cible' }).click()
  await top.getByRole('button', { name: 'Valider' }).click()
  await expect(top).toHaveCount(0)
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
  await resumeActiveSession(page)
  await page.getByRole('button', { name: 'Précédente' }).click()
  const top = page.getByRole('article', { name: 'Soulevé de terre · série de travail' })
  await expect(top).toBeVisible()
  await expect(top.getByRole('button', { name: 'RPE 8 — effort cible' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Retour à la série courante' })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByRole('button', { name: 'Retour à la série courante' }).click()

  await finishTwice(page)
  await expect(page.getByText('Soulevé de terre → 97,5 kg')).toBeVisible()
  const summary = page.getByRole('heading', { name: 'Travail validé' }).locator('..')
  await expect(summary.getByText('Séries validées')).toBeVisible()
  await expect(summary.getByText('Soulevé de terre : 92,5×3 @8')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notes' }).locator('..')).toContainText(
    'Aucune note.',
  )

  await page.getByRole('button', { name: 'Voir dans l’historique' }).click()
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

test('les paliers survivent à la reprise sans chrono et restent hors progression', async ({
  page,
}) => {
  await openSunday(page)
  const slot = page.getByRole('region', { name: 'Chronomètre' })
  const initialHeight = await slot.evaluate((element) => element.getBoundingClientRect().height)

  for (const index of [1, 2]) {
    const step = page.getByRole('article', { name: `Soulevé de terre · palier ${index}` })
    await step.getByRole('button', { name: 'Valider' }).click()
    await expect(step).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveCount(0)
    await expect(slot.getByText('Repos libre')).toBeVisible()
    expect(await slot.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      initialHeight,
    )
  }
  await expect
    .poll(async () =>
      (await storedDraft(page))?.sets
        .filter((set) => set.id.startsWith('c-deadlift:warmup:'))
        .map((set) => set.status),
    )
    .toEqual(['validated', 'validated', 'planned'])

  await page.reload()
  await resumeActiveSession(page)
  await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 3' })).toBeVisible()
  await expect
    .poll(async () =>
      (await storedDraft(page))?.sets
        .filter((set) => set.id.startsWith('c-deadlift:warmup:'))
        .map((set) => set.status),
    )
    .toEqual(['validated', 'validated', 'planned'])
  await expect(page.getByRole('timer')).toHaveCount(0)

  await validateDeadliftTop(page)
  expect(await slot.evaluate((element) => element.getBoundingClientRect().height)).toBe(
    initialHeight,
  )
  await finishTwice(page)
  await expect(page.getByText('Soulevé de terre → 97,5 kg')).toBeVisible()

  const exported = await copiedExport(page)
  const current = exported.seances.find((seance) => seance.date === '2026-09-20')
  expect(exported.schemaVersion).toBe(2)
  expect(exported.targets.deadlift.w).toBe(97.5)
  expect(
    current?.sets
      ?.filter((set) => set.id.startsWith('c-deadlift:warmup:'))
      .map((set) => set.status),
  ).toEqual(['validated', 'validated', 'validated'])
  expect(current?.lines.join(' ')).not.toContain('60×5')
  expect(current?.lines.join(' ')).not.toContain('72,5×3')
  expect(current?.lines.join(' ')).not.toContain('82,5×1')
})

test('le même top set produit la même cible dans un brouillon historique sans paliers', async ({
  page,
}) => {
  await openSunday(page)
  await removeWarmupsFromStoredDraft(page)
  await page.reload()
  await resumeActiveSession(page)
  await expect(page.getByRole('article', { name: /palier/ })).toHaveCount(0)
  await expect(
    page.getByRole('article', { name: 'Soulevé de terre · série de travail' }),
  ).toBeVisible()

  await validateDeadliftTop(page)
  await finishTwice(page)

  const exported = await copiedExport(page)
  expect(exported.targets.deadlift.w).toBe(97.5)
})

test('importe le format historique puis le réexporte en version 2', async ({ page }) => {
  await openSunday(page, false)
  const seed = await readFile(new URL('../../src/domain/seed.json', import.meta.url), 'utf8')
  expect(await storedDraft(page)).toBeNull()

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('textbox', { name: 'Contenu de l’export' }).fill(seed)
  await page.getByRole('button', { name: 'Vérifier ce contenu' }).click()
  await expect(page.getByRole('button', { name: 'Remplacer définitivement' })).toBeVisible()
  await page.getByRole('button', { name: 'Remplacer définitivement' }).click()
  await expect(page.getByText('12 séances importées. Tes données remplacées.')).toBeVisible()

  const exported = await copiedExport(page, 12)
  expect(exported.schemaVersion).toBe(2)
  expect(exported.seances).toHaveLength(12)
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
  await resumeActiveSession(page)

  await page.getByText('Notes de séance (facultatif)', { exact: true }).click()
  const notes = page.getByLabel('Notes de séance (facultatif)')
  await notes.fill('Recette hors ligne')
  await expect.poll(async () => (await storedDraft(page))?.notes).toBe('Recette hors ligne')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await resumeActiveSession(page)
  await page.getByText('Notes de séance (facultatif)', { exact: true }).click()
  await expect(page.getByLabel('Notes de séance (facultatif)')).toHaveValue('Recette hors ligne')

  await validateDeadliftTop(page)
  await finishTwice(page)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Copier mes séances' }).click()
  await expect(page.getByText(/13 séances copiées/)).toBeVisible()
})
