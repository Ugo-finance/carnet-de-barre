/**
 * Le clavier ne doit jamais recouvrir « Valider » — CB-82.
 *
 * Signalé par Ugo le 25.09, en salle : « je ne peux plus continuer quand je modifie ».
 * Taper une charge ouvre le clavier numérique, la carte ne se réorganise pas, et le
 * bouton reste là où il était — sous le clavier. Il tape où le bouton devrait être, et
 * rien ne se passe.
 *
 * ## Pourquoi ce test simule `visualViewport`, et pas une fenêtre plus petite
 *
 * Sur iOS, ouvrir le clavier **ne change pas** la hauteur de mise en page : `innerHeight`
 * et `dvh` restent à 659. Seul `visualViewport` rétrécit. Réduire la fenêtre Playwright
 * simulerait donc un autre téléphone que celui d'Ugo — la mise en page se recalculerait
 * d'elle-même, et le test passerait sur un défaut bien réel.
 *
 * Ici la fenêtre reste à 659 et on ne fait rétrécir **que** `visualViewport`, comme le
 * fait Safari. Aucune émulation ne remplace pour autant le vrai clavier : la recette sur
 * l'iPhone d'Ugo reste un critère d'acceptation distinct.
 */

import { expect, test, type Page } from '@playwright/test'

const SAFARI = { width: 393, height: 659 }
/** Ce qui reste visible au-dessus du clavier numérique d'un iPhone 15 Pro. */
const AU_DESSUS_DU_CLAVIER = 400

/**
 * Remplace `visualViewport` par une copie pilotable, **avant** que l'app ne se charge.
 * `window.__clavier(h)` ouvre le clavier ; `window.__clavier(null)` le ferme.
 */
async function installerClavier(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const cible = new EventTarget() as EventTarget & Record<string, number>
    let hauteur: number | null = null
    Object.defineProperties(cible, {
      height: { get: () => hauteur ?? window.innerHeight },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => window.scrollY },
      scale: { get: () => 1 },
    })
    Object.defineProperty(window, 'visualViewport', { value: cible, configurable: true })
    ;(window as unknown as { __clavier: (h: number | null) => void }).__clavier = (h) => {
      hauteur = h
      cible.dispatchEvent(new Event('resize'))
    }
  })
}

async function ouvrirClavier(page: Page, hauteur: number | null): Promise<void> {
  await page.evaluate((h) => {
    ;(window as unknown as { __clavier: (h: number | null) => void }).__clavier(h)
  }, hauteur)
  // Laisser la mise en page et le défilement se faire.
  await page.waitForTimeout(400)
}

async function atteindreTopSet(page: Page): Promise<void> {
  await page.setViewportSize(SAFARI)
  await page.clock.setFixedTime('2026-09-20T14:00:00.000Z')
  await page.goto('/')
  await page.getByRole('button', { name: 'Voir les cibles de la séance C' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 1' })).toBeVisible()
  for (let index = 0; index < 6; index += 1) {
    const retour = page.getByRole('button', { name: 'Revenir à la saisie' })
    if (await retour.isVisible().catch(() => false)) await retour.click()
    const carte = page.getByRole('article').first()
    const nom = (await carte.getAttribute('aria-label')) ?? ''
    if (nom.includes('série de travail')) return
    await carte.getByRole('button', { name: 'Valider' }).click()
    // Attendre que la carte validée soit partie : sans cela on focalisait parfois le
    // champ d'une carte en train de sortir, et la mesure portait sur la mauvaise.
    await expect(page.getByRole('article', { name: nom })).toHaveCount(0)
  }
  throw new Error('Top set jamais atteint')
}

/**
 * Où est « Valider », et que toucherait un doigt posé en son centre ?
 *
 * Mesuré **dans la page**, pas par Playwright. Playwright décide lui-même si un élément
 * est visible — et il lit pour cela le même `visualViewport` que nous remplaçons. Ses
 * propres mesures et ses clics devenaient donc des artefacts du faux clavier : un clic
 * expirait même une fois le défaut corrigé. `elementFromPoint` répond, lui, à la seule
 * question qui compte pour Ugo : qu'est-ce qui se trouve sous son doigt ?
 */
async function sousLeDoigt(page: Page): Promise<{ haut: number; bas: number; touche: boolean }> {
  return page.evaluate(() => {
    const carte = document.querySelector('article')
    const boutons = carte?.querySelectorAll('button') ?? []
    const valider = [...boutons].find((b) => b.textContent?.trim() === 'Valider')
    if (!valider) return { haut: -1, bas: -1, touche: false }
    const boite = valider.getBoundingClientRect()
    const x = boite.left + boite.width / 2
    const y = boite.top + boite.height / 2
    const visible = window.visualViewport?.height ?? window.innerHeight
    const recu = y <= visible ? document.elementFromPoint(x, y) : null
    return {
      haut: Math.round(boite.top),
      bas: Math.round(boite.bottom),
      touche: recu !== null && valider.contains(recu),
    }
  })
}

test('taper une charge au top set laisse « Valider » au-dessus du clavier', async ({ page }) => {
  await installerClavier(page)
  await atteindreTopSet(page)

  const champ = page.getByRole('article').first().getByRole('textbox').first()
  await champ.focus()
  await ouvrirClavier(page, AU_DESSUS_DU_CLAVIER)

  const { haut, bas, touche } = await sousLeDoigt(page)
  expect(haut, 'Valider sort par le haut').toBeGreaterThanOrEqual(0)
  expect(
    bas,
    `Valider (bas à ${bas} px) est sous le clavier, qui commence à ${AU_DESSUS_DU_CLAVIER} px`,
  ).toBeLessThanOrEqual(AU_DESSUS_DU_CLAVIER)
  expect(touche, 'un doigt posé sur Valider ne le touche pas').toBe(true)
})

test('et Ugo peut réellement valider la charge qu’il vient de taper', async ({ page }) => {
  // Le parcours complet du 25.09 : taper, puis valider sans fermer le clavier.
  await installerClavier(page)
  await atteindreTopSet(page)

  const carte = page.getByRole('article').first()
  const champ = carte.getByRole('textbox').first()
  await champ.focus()
  await ouvrirClavier(page, AU_DESSUS_DU_CLAVIER)
  await champ.fill('87,5')

  // Le tap d'Ugo : là où le bouton apparaît, au-dessus du clavier.
  const { touche } = await sousLeDoigt(page)
  expect(touche, 'le tap ne tombe pas sur Valider').toBe(true)
  await page.evaluate(() => {
    const valider = [...document.querySelectorAll('article button')].find(
      (b) => b.textContent?.trim() === 'Valider',
    ) as HTMLButtonElement | undefined
    const boite = valider!.getBoundingClientRect()
    const cible = document.elementFromPoint(
      boite.left + boite.width / 2,
      boite.top + boite.height / 2,
    )
    ;(cible as HTMLElement).click()
  })
  await ouvrirClavier(page, null)

  await expect(
    page.getByRole('article', { name: 'Soulevé de terre · série de travail' }),
  ).toHaveCount(0)
})

test('fermer le clavier rend la carte à sa place', async ({ page }) => {
  // La réparation ne doit pas laisser la séance coincée dans une hauteur réduite.
  await installerClavier(page)
  await atteindreTopSet(page)

  await page.getByRole('article').first().getByRole('textbox').first().focus()
  await ouvrirClavier(page, AU_DESSUS_DU_CLAVIER)
  await page.getByRole('article').first().getByRole('textbox').first().blur()
  await ouvrirClavier(page, null)

  const { bas } = await sousLeDoigt(page)
  expect(bas).toBeLessThanOrEqual(SAFARI.height)
})
