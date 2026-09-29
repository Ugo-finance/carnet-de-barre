/**
 * L'écran de connexion dans la taille qui a déjà cassé une action en salle — CB-85.
 *
 * La configuration de Playwright contient une clé factice et ce fichier bloque toute
 * requête au domaine Supabase. Le parcours ne peut donc ni envoyer un e-mail ni créer un
 * compte distant : il éprouve uniquement le vrai assemblage et la place sous le pouce.
 */

import { expect, test } from '@playwright/test'

const SAFARI = { width: 393, height: 659 }
test.use({ viewport: SAFARI })

test.beforeEach(async ({ page }) => {
  await page.route('https://rtxdtiysrdgzsomatwon.supabase.co/**', (route) => route.abort())
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' })
  await navigation.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('button', { name: 'Suivant : Matériel' }).click()
  await page.getByRole('button', { name: 'Suivant : Sauvegarde' }).click()
  await expect(page.getByRole('heading', { name: 'Sauvegarde' })).toBeVisible()
})

test('le formulaire et sa commande tiennent dans la vue Safari', async ({ page }) => {
  await expect(page.getByText(/dates, exercices, charges, répétitions, RPE/)).toBeVisible()
  await expect(page.getByText(/pas le brouillon actif/)).toBeVisible()

  const email = page.getByLabel('Adresse e-mail')
  const envoyer = page.getByRole('button', { name: 'Recevoir un code par e-mail' })
  await expect(email).toBeVisible()
  await expect(envoyer).toBeVisible()
  await expect(envoyer).toBeDisabled()

  await email.fill('ugo@example.ch')
  await expect(envoyer).toBeEnabled()

  const boite = await envoyer.boundingBox()
  expect(boite, 'la commande d’envoi n’a aucune boîte').not.toBeNull()
  expect(Math.round(boite!.y), 'la commande sort par le haut').toBeGreaterThanOrEqual(0)
  expect(
    Math.round(boite!.y + boite!.height),
    'la commande est sous le bas de la vue Safari',
  ).toBeLessThanOrEqual(SAFARI.height)
})

test('le clavier peut faire défiler ensemble le champ et sa commande', async ({ page }) => {
  const email = page.getByLabel('Adresse e-mail')
  const envoyer = page.getByRole('button', { name: 'Recevoir un code par e-mail' })
  await email.fill('ugo@example.ch')
  await email.focus()

  // Hauteur visible approximative au-dessus du clavier numérique iOS. Pour cet écran
  // hors séance, la page doit rester défilable : on ne simule pas la vue fixe du focus.
  await page.setViewportSize({ width: SAFARI.width, height: 400 })
  await envoyer.scrollIntoViewIfNeeded()

  const boite = await envoyer.boundingBox()
  expect(boite, 'la commande ne peut pas être amenée au-dessus du clavier').not.toBeNull()
  expect(Math.round(boite!.y + boite!.height)).toBeLessThanOrEqual(400)
  await expect(email).toHaveValue('ugo@example.ch')
})
