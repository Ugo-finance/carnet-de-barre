/**
 * Lisibilité des chiffres sur un vrai écran de téléphone — CB-43.
 *
 * Ces vérifications ne peuvent pas vivre dans la suite unitaire : jsdom ne calcule
 * aucune mise en page, donc `clientWidth` y vaut toujours 0 et un champ tronqué y
 * passerait au vert. C'est exactement ce qui s'est produit — la troncature a traversé
 * toute la suite et a été trouvée par Ugo, en salle, sur sa première séance.
 */

import { expect, test, type Page } from '@playwright/test'

const DIMANCHE = '2026-09-20T14:00:00.000Z'

async function openSession(page: Page): Promise<void> {
  await page.clock.setFixedTime(DIMANCHE)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Séance C' })).toBeVisible()
  await page.getByRole('button', { name: 'Démarrer la séance C' }).click()
  await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 1' })).toBeVisible()
}

async function advanceToDeadliftTop(page: Page): Promise<void> {
  for (const index of [1, 2, 3]) {
    const warmup = page.getByRole('article', { name: `Soulevé de terre · palier ${index}` })
    if (await warmup.isVisible()) {
      await warmup.getByRole('button', { name: 'Valider' }).click()
      await expect(warmup).toHaveCount(0)
    }
  }
  await expect(
    page.getByRole('article', { name: 'Soulevé de terre · série de travail' }),
  ).toBeVisible()
}

test('aucune charge n’est tronquée dans son champ', async ({ page }) => {
  await openSession(page)

  const { total, tronques } = await page.evaluate(() => {
    const champs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'),
    )
    return {
      total: champs.length,
      tronques: champs
        .filter((input) => input.scrollWidth > input.clientWidth)
        .map((input) => ({
          champ: document.querySelector(`label[for="${input.id}"]`)?.textContent ?? '?',
          valeur: input.value,
          disponible: input.clientWidth,
          necessaire: input.scrollWidth,
        })),
    }
  })

  // Le message porte la mesure : un échec doit dire de combien ça déborde, sinon la
  // prochaine personne qui le voit repart de zéro.
  expect(total, 'aucun champ de charge sur la page : le test ne vérifie rien').toBeGreaterThan(0)
  expect(tronques, `champs tronqués : ${JSON.stringify(tronques)}`).toEqual([])
})

test('le top set reste lisible avec une charge à quatre caractères', async ({ page }) => {
  // « 92,5 » est le cas réel du 12.09 : quatre caractères, une décimale. C'est la
  // charge qui a révélé le défaut.
  await openSession(page)
  await advanceToDeadliftTop(page)
  const top = page.getByRole('article', { name: 'Soulevé de terre · série de travail' })
  const poids = top.getByRole('textbox', { name: 'Poids' })

  await expect(poids).toHaveValue('92,5')
  const { visible, necessaire, taille } = await poids.evaluate((el) => {
    const input = el as HTMLInputElement
    return {
      visible: input.clientWidth,
      necessaire: input.scrollWidth,
      taille: Number.parseFloat(getComputedStyle(input).fontSize),
    }
  })

  expect(necessaire).toBeLessThanOrEqual(visible)
  // Ugo a demandé plus grand, pas seulement non tronqué : un seuil verrouille le
  // gain, sinon une refonte ultérieure pourrait rétrécir le chiffre sans rien casser.
  expect(taille).toBeGreaterThanOrEqual(20)
})
