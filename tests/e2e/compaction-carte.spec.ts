import { expect, test, type Locator, type Page } from '@playwright/test'

const SAFARI = { width: 393, height: 659 }
test.use({ viewport: SAFARI })

async function actionPrincipale(page: Page): Promise<Locator | null> {
  const valider = page.getByRole('button', { name: 'Valider', exact: true })
  if (await valider.count()) return valider

  const terminer = page.getByRole('button', { name: 'Terminer la séance', exact: true })
  return (await terminer.count()) ? terminer : null
}

test('les 24 étapes de la séance A tiennent sans défiler dans Safari', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Voir les cibles/ }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await page.getByRole('article').first().waitFor()

  const etapes: string[] = []
  let chargementsVus = 0
  for (let index = 0; index < 30; index++) {
    await page.locator('[class~="h-dvh"][class~="overflow-y-auto"]').evaluate((element) => {
      element.scrollTop = 0
    })
    const carte = page.getByRole('article').first()
    const etiquette = (await carte.count())
      ? ((await carte.getAttribute('aria-label')) ?? '?')
      : 'écran de clôture'
    const action = await actionPrincipale(page)
    expect(action, `${etiquette} : action principale absente`).not.toBeNull()

    const boite = await action!.boundingBox()
    expect(boite, `${etiquette} : action sans boîte`).not.toBeNull()
    expect(Math.round(boite!.y), `${etiquette} : action coupée en haut`).toBeGreaterThanOrEqual(0)
    expect(
      Math.round(boite!.y + boite!.height),
      `${etiquette} : action sous le bas de la vue de ${SAFARI.height} px`,
    ).toBeLessThanOrEqual(SAFARI.height)

    const chargement = page.getByTestId('barbell-description')
    if (await chargement.count()) {
      chargementsVus += 1
      await expect(chargement).toBeVisible()
      const mesure = await chargement.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: element.textContent,
      }))
      expect(mesure.text, `${etiquette} : chargement vide`).toMatch(/^(Par côté :|Barre seule)/)
      expect(
        mesure.scrollWidth,
        `${etiquette} : « ${mesure.text} » est tronqué horizontalement`,
      ).toBeLessThanOrEqual(mesure.clientWidth)
    }

    etapes.push(etiquette)
    if (etiquette === 'écran de clôture') break
    await action!.click()
    await page.waitForTimeout(80)
  }

  expect(etapes).toHaveLength(24)
  expect(etapes.at(-1)).toBe('écran de clôture')
  expect(etapes.filter((etape) => etape !== 'écran de clôture')).toHaveLength(23)
  expect(chargementsVus, 'aucun chargement de barre réellement vérifié').toBeGreaterThan(0)
})
