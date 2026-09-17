import { expect, test, type Locator, type Page } from '@playwright/test'

const SUNDAY = '2026-09-20T14:00:00.000Z'

async function expectPageToFit(page: Page, primaryAction: Locator): Promise<void> {
  await expect(primaryAction).toBeVisible()
  const viewport = page.viewportSize()
  const box = await primaryAction.boundingBox()

  expect(viewport).not.toBeNull()
  expect(box).not.toBeNull()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      ),
    )
    .toBe(0)
}

async function markRemainingSetsSkipped(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('carnet')
        open.addEventListener('error', () => reject(open.error), { once: true })
        open.addEventListener(
          'success',
          () => {
            const database = open.result
            const transaction = database.transaction('drafts', 'readwrite')
            const drafts = transaction.objectStore('drafts')
            const request = drafts.getAll()
            request.addEventListener('error', () => reject(request.error), { once: true })
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
                  notes: 'Grip stable '.repeat(50).trim(),
                  sets: draft.sets.map((set: { status: string }) =>
                    set.status === 'planned' || set.status === 'entered'
                      ? { ...set, status: 'skipped' }
                      : set,
                  ),
                })
              },
              { once: true },
            )
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
      }),
  )
}

test.use({ viewport: { width: 393, height: 759 } })

test('les quatre pages de réglages tiennent au-dessus de la navigation', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' })
  await navigation.getByRole('button', { name: 'Réglages' }).click()

  const toHardware = page.getByRole('button', { name: 'Suivant : Matériel' })
  await expectPageToFit(page, toHardware)
  await toHardware.click()

  const toExport = page.getByRole('button', { name: 'Suivant : Export' })
  await expectPageToFit(page, toExport)
  await toExport.click()

  const toImport = page.getByRole('button', { name: 'Suivant : Import' })
  await expectPageToFit(page, toImport)
  await toImport.click()

  await expectPageToFit(page, page.getByRole('button', { name: 'Vérifier ce contenu' }))
  await expect(navigation).toBeInViewport()
})

test('la navigation reste visible au bas des écrans de consultation', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' })

  for (const tab of ['Historique', 'Progression']) {
    await navigation.getByRole('button', { name: tab }).click()
    await expect(page.getByRole('heading', { name: tab })).toBeVisible()
    await expect(navigation).toBeInViewport()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(navigation).toBeInViewport()
    await expect(page.getByRole('heading', { name: tab })).toBeInViewport()
  }

  await page.getByRole('button', { name: 'Ajuster' }).first().click()
  const adjustment = page.getByRole('dialog', { name: 'Ajuster Squat' })
  const input = adjustment.getByLabel('Nouvelle cible Squat')
  await input.fill('750')
  await adjustment.getByRole('button', { name: 'Poser la cible' }).click()
  const refusal = adjustment.getByRole('alert')
  await expect(refusal).toContainText('500 kg')
  await expect(refusal).toBeInViewport()
  await expect(input).toHaveValue('750')
})

test('les cibles des trois séances tiennent chacune dans leur page', async ({ page }) => {
  await page.clock.setFixedTime(SUNDAY)
  await page.goto('/')

  for (const type of ['A', 'B', 'C']) {
    await page.getByRole('button', { name: `Séance ${type}` }).click()
    const showTargets = page.getByRole('button', { name: `Voir les cibles de la séance ${type}` })
    await expectPageToFit(page, showTargets)
    await showTargets.click()
    await expectPageToFit(page, page.getByRole('button', { name: 'C’est parti' }))
    await page.getByRole('button', { name: 'Retour' }).click()
  }
})

test('l’accueil, les cibles et la série courante tiennent chacun dans une page', async ({
  page,
}) => {
  await page.clock.setFixedTime(SUNDAY)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()
  const start = page.getByRole('button', { name: 'Voir les cibles de la séance C' })
  await expectPageToFit(page, start)
  await start.click()

  const confirmTargets = page.getByRole('button', { name: 'C’est parti' })
  await expect(page.getByRole('heading', { name: 'Cibles du jour' })).toBeVisible()
  await expectPageToFit(page, confirmTargets)
  await confirmTargets.click()

  const currentSet = page.getByRole('article', { name: 'Soulevé de terre · palier 1' })
  await expect(currentSet).toBeVisible()
  await expectPageToFit(page, currentSet.getByRole('button', { name: 'Valider' }))

  for (const index of [1, 2, 3]) {
    const warmup = page.getByRole('article', { name: `Soulevé de terre · palier ${index}` })
    await expectPageToFit(page, warmup.getByRole('button', { name: 'Valider' }))
    await warmup.getByRole('button', { name: 'Valider' }).click()
    await expect(warmup).toHaveCount(0)
  }

  const top = page.getByRole('article', { name: 'Soulevé de terre · série de travail' })
  await top.getByRole('button', { name: 'RPE 8 — effort cible' }).click()
  await expectPageToFit(page, top.getByRole('button', { name: 'Valider' }))
  await top.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  const retourRecup = page.getByRole('button', { name: 'Revenir à la saisie' })
  if (await retourRecup.isVisible()) await retourRecup.click()

  const timedSet = page.getByRole('article').first()
  await expectPageToFit(page, timedSet.getByRole('button', { name: 'Valider' }))

  await page.getByRole('button', { name: 'Actions' }).click()
  const actions = page.getByRole('dialog', { name: 'Actions de séance' })
  const finishEarly = actions.getByRole('button', { name: 'Terminer la séance' })
  await expectPageToFit(page, finishEarly)
  await finishEarly.click()

  const incomplete = page.getByRole('dialog', { name: 'Séance incomplète' })
  const finishAnyway = incomplete.getByRole('button', { name: 'Terminer quand même' })
  await expectPageToFit(page, finishAnyway)
  await incomplete.getByRole('button', { name: 'Revenir à la séance' }).click()

  await markRemainingSetsSkipped(page)
  await page.reload()
  const resume = page.getByRole('button', { name: 'Reprendre la séance' })
  await expectPageToFit(page, resume)
  await resume.click()

  const finish = page.getByRole('button', { name: 'Terminer la séance' })
  await expect(page.getByRole('heading', { name: 'Toutes les séries sont traitées' })).toBeVisible()
  await expectPageToFit(page, finish)
  await finish.click()

  await expect(page.getByText('Séance enregistrée')).toBeVisible()
  for (;;) {
    const next = page.getByRole('button', { name: 'Suivant' })
    if (!(await next.isVisible().catch(() => false))) break
    await expectPageToFit(page, next)
    await next.click()
  }
  await expectPageToFit(page, page.getByRole('button', { name: 'Retour à l’accueil' }))
})
