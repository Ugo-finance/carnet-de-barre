import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 393, height: 659 }, reducedMotion: 'reduce' })

test('la dernière série de A passe à la clôture sans récupération', async ({ page }) => {
  await page.clock.setFixedTime('2026-09-15T17:00:00.000Z')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance A', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Voir les cibles de la séance A' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  const recovery = page.getByRole('dialog', { name: 'Récupération' })
  let openings = 0
  for (let index = 0; index < 23; index++) {
    const card = page.getByRole('article')
    await expect(card).toHaveCount(1)
    const label = await card.getAttribute('aria-label')
    const last = index === 22
    if (last) expect(label).toBe('Élévations latérales · série 2/2')
    await card.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.getByRole('article', { name: label!, exact: true })).toHaveCount(0)
    if (last) {
      await expect(
        page.getByRole('heading', { name: 'Toutes les séries sont traitées' }),
      ).toBeVisible()
      await expect(recovery).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Terminer la séance', exact: true }),
      ).toBeVisible()
    } else if (!label!.includes('palier')) {
      await expect(recovery).toBeVisible()
      openings += 1
      await recovery.getByRole('button', { name: 'Revenir à la saisie' }).click()
      await expect(recovery).toHaveCount(0)
    } else {
      await expect(recovery).toHaveCount(0)
    }
  }
  expect(openings).toBe(15)
})

test('la récupération reste lisible, joignable et distincte du chrono persisté', async ({
  page,
}) => {
  await page.clock.setFixedTime('2026-09-15T17:00:00.000Z')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance A', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Voir les cibles de la séance A' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  for (let index = 1; index <= 4; index++) {
    const warmup = page.getByRole('article', { name: `Squat · palier ${index}` })
    await warmup.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(warmup).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Récupération' })).toHaveCount(0)
  }
  const top = page.getByRole('article', { name: 'Squat · série de travail' })
  await expect(top).toBeVisible()
  await top.getByRole('button', { name: 'Valider', exact: true }).click()
  const recovery = page.getByRole('dialog', { name: 'Récupération' })
  await expect(recovery).toBeVisible()
  await expect(recovery.getByRole('region', { name: 'Prochaine série' })).toContainText('Squat')
  await expect(recovery.getByRole('region', { name: 'Prochaine série' })).toContainText('série 1/2')
  await expect(recovery.getByRole('timer')).toHaveText('2:30')
  const time = await recovery.getByRole('timer').boundingBox()
  expect(time).not.toBeNull()
  expect(time!.height).toBeGreaterThanOrEqual(72)
  for (const name of ['−30 s', '+30 s', 'Arrêter', 'Revenir à la saisie']) {
    const button = recovery.getByRole('button', { name, exact: true })
    const bounds = await button.boundingBox()
    expect(bounds, `${name} absent`).not.toBeNull()
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(659)
  }
  await recovery.getByRole('button', { name: '+30 s', exact: true }).click()
  await expect(recovery).toBeVisible()
  await expect(recovery.getByRole('timer')).toHaveText('3:00')
  await recovery.getByRole('button', { name: 'Revenir à la saisie' }).click()
  await expect(recovery).toHaveCount(0)
  await expect(page.getByRole('timer')).toHaveText('3:00')
  await page.getByRole('button', { name: 'Agrandir le chrono' }).click()
  await expect(recovery).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Reprendre la séance' }).click()
  await expect(recovery).toHaveCount(0)
  await expect(page.getByRole('timer')).toHaveText('3:00')
})
