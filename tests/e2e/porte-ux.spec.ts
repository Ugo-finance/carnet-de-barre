import { expect, test, type Page } from '@playwright/test'

const SUNDAY = '2026-09-20T14:00:00.000Z'

async function openSunday(page: Page): Promise<void> {
  await page.clock.setFixedTime(SUNDAY)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()
}

async function startSunday(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Voir les cibles de la séance C' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    undersizedTargets: Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [role="button"], a[href], input, select, textarea',
      ),
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width < 44 || rect.height < 44
      })
      .map((element) => ({
        label:
          element.getAttribute('aria-label') ??
          (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
            ? Array.from(element.labels ?? [])
                .map((label) => label.textContent?.trim())
                .filter(Boolean)
                .join(' · ')
            : undefined) ??
          element.getAttribute('placeholder') ??
          element.textContent?.trim() ??
          '?',
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
  }))

  expect(
    layout.content,
    `contenu ${layout.content}px pour ${layout.viewport}px`,
  ).toBeLessThanOrEqual(layout.viewport)
  expect(layout.undersizedTargets, JSON.stringify(layout.undersizedTargets)).toEqual([])
}

for (const width of [390, 400]) {
  test(`accueil et focus tiennent dans ${width} px avec des cibles tactiles de 44 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await openSunday(page)
    await expectNoHorizontalOverflow(page)

    await startSunday(page)
    await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 1' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Poids', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Répétitions', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test('le mode mouvement réduit neutralise l’animation de la carte', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSunday(page)
  await startSunday(page)
  const card = page.getByRole('article', { name: 'Soulevé de terre · palier 1' })

  const duration = await card.evaluate((element) => getComputedStyle(element).animationDuration)
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001)
})

test('les notes restent visibles dans un viewport réduit comme par le clavier', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await openSunday(page)
  await startSunday(page)
  await page.getByRole('button', { name: 'Actions' }).click()
  const notes = page.getByLabel('Notes de séance (facultatif)')
  await notes.focus()

  await expect(notes).toBeFocused()
  const box = await notes.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(500)
  await expectNoHorizontalOverflow(page)
})
