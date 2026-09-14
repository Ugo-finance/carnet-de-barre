import { expect, test } from '@playwright/test'

/**
 * Les deux écrans de consultation — CB-66, sous l'arbitrage § 1.7 du contrat.
 *
 * « Aucun écran ne scrolle » vaut pour les étapes d'un parcours. L'historique et la
 * progression en sont exclus : leur longueur dépend des données, pas du parcours, et
 * les découper en pages ferait tourner les pages pour lire une liste.
 *
 * L'exception porte sur la **liste**, jamais sur le repère. Ces tests vérifient donc
 * l'inverse de ce qu'on vérifie ailleurs : le contenu défile bien, et l'en-tête reste
 * malgré tout à l'écran. Sans le second, Ugo scrolle trois semaines et ne sait plus
 * dans quel écran il se trouve.
 */

const DIMANCHE = '2026-09-20T14:00:00.000Z'

// Le téléphone d'Ugo, hauteur utile comprise : iPhone 15 Pro en PWA installée.
test.use({ viewport: { width: 393, height: 759 } })

test.describe('écrans de consultation', () => {
  test('l’historique défile en gardant son en-tête à l’écran', async ({ page }) => {
    await page.clock.setFixedTime(DIMANCHE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Historique' }).click()

    const titre = page.getByRole('heading', { name: 'Historique', level: 1 })
    await expect(titre).toBeVisible()

    // Le dossier de départ tient douze séances : la page doit bel et bien dépasser,
    // sinon le test ne prouverait rien sur le collage de l'en-tête.
    const aFaireDefiler = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    )
    expect(
      aFaireDefiler,
      'la page tient déjà dans la vue : le défilement n’est pas exercé',
    ).toBeGreaterThan(0)

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(titre).toBeInViewport()
  })

  test('la progression défile en gardant son en-tête à l’écran', async ({ page }) => {
    await page.clock.setFixedTime(DIMANCHE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Progression' }).click()

    const titre = page.getByRole('heading', { name: 'Progression', level: 1 })
    await expect(titre).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(titre).toBeInViewport()
  })

  test('l’historique groupe les séances du dossier de départ par semaine', async ({ page }) => {
    await page.clock.setFixedTime(DIMANCHE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Historique' }).click()

    const semaines = page.getByRole('region')
    await expect(semaines.first()).toBeVisible()
    const nombre = await semaines.count()
    expect(nombre).toBeGreaterThan(1)

    // Chaque en-tête de semaine nomme ses deux bornes : sans elles, Ugo devrait
    // compter pour savoir si sa séance du dimanche est dans la semaine affichée.
    await expect(semaines.first()).toHaveAccessibleName(
      /^Semaine du \d{2}\.\d{2}(\.\d{4})? au \d{2}\.\d{2}\.\d{4}$/,
    )
  })

  test('la progression sort l’ajustement en feuille basse, atteignable au pouce', async ({
    page,
  }) => {
    await page.clock.setFixedTime(DIMANCHE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Progression' }).click()

    await page.getByRole('button', { name: 'Ajuster' }).first().click()
    const feuille = page.getByRole('dialog')
    await expect(feuille).toHaveAccessibleName('Ajuster Squat')

    // « En feuille basse » est une promesse de position, pas seulement de balisage :
    // le panneau doit occuper le bas de la vue, là où le pouce arrive. On mesure le
    // panneau et non le `<dialog>` lui-même, qui porte le fond et couvre tout l'écran.
    const panneau = feuille.locator('section').first()
    const boite = await panneau.boundingBox()
    expect(boite).not.toBeNull()
    expect(boite!.y + boite!.height).toBeLessThanOrEqual(759)
    expect(boite!.y).toBeGreaterThan(759 / 2)

    // Et une vraie modale : Échap la ferme, ce qu'un `div role="dialog"` ne fait pas.
    await page.keyboard.press('Escape')
    await expect(feuille).toBeHidden()
  })
})
