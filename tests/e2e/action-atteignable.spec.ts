import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * L'action principale reste atteignable — CB-72, après un défaut trouvé en salle.
 *
 * L'arbitrage § 1.7 dit qu'aucun écran du parcours ne défile. Il a d'abord été tenu
 * par `overflow-hidden` sur l'enveloppe de séance, ce qui ne fait pas rentrer le
 * contenu : ça le coupe. Le 15.09.2026, Ugo n'a pas pu valider une série — « Valider »
 * occupait `y = 655 à 701` pour une vue de 659 px, et la page refusait de défiler.
 *
 * Les tests de non-débordement existants ne pouvaient pas l'attraper, pour deux motifs
 * qui valent d'être écrits :
 *
 * - ils mesurent `scrollHeight - clientHeight`, qui vaut **zéro** quand le dépassement
 *   est masqué. Le symptôme rendait la mesure muette ;
 * - ils tournent à 393 × 759, la hauteur utile en PWA installée. Ugo ouvre l'app dans
 *   un onglet Safari, où les barres ramènent la vue à ~659 px.
 *
 * Ce fichier mesure donc l'autre chose — **la position de l'action** — à la hauteur où
 * le défaut vit. Un bouton qu'on ne peut pas toucher est le seul défaut qui arrête une
 * séance : tout le reste se contourne.
 */

// L'onglet Safari d'un iPhone 15 Pro, barres affichées. Volontairement plus petit que
// les 759 px de la PWA : c'est la hauteur qui a réellement cassé.
const SAFARI = { width: 393, height: 659 }
test.use({ viewport: SAFARI })

/**
 * Entièrement dans la vue, et non « visible » au sens de Playwright.
 *
 * `toBeVisible()` et `click()` acceptent un élément coupé par un ancêtre : c'est ce qui
 * a laissé passer le défaut pendant une recette automatique complète de 23 séries. Un
 * doigt, lui, ne touche que ce qui est à l'écran.
 */
async function enveloppeContrainte(page: Page) {
  return page.evaluate(() => {
    let noeud: HTMLElement | null = document.querySelector('main')
    while (noeud && getComputedStyle(noeud).overflowY === 'visible') {
      noeud = noeud.parentElement
    }
    const e = (noeud ?? document.scrollingElement) as HTMLElement
    return {
      classe: e.className ?? '',
      overflowY: getComputedStyle(e).overflowY,
      contenu: e.scrollHeight,
      visible: e.clientHeight,
    }
  })
}

/**
 * L'action doit être **joignable par un doigt**, et non « visible » au sens de
 * Playwright — `toBeVisible()` et `click()` acceptent un élément coupé par un ancêtre,
 * ce qui a laissé passer le défaut pendant une recette automatique de 23 séries.
 *
 * Deux cas sont acceptables, et un seul ne l'est pas :
 *
 * - l'action est déjà dans la vue : c'est la cible de l'arbitrage § 1.7 ;
 * - elle dépasse, mais l'enveloppe est **réellement défilable par l'utilisateur**.
 *
 * Le cas interdit est celui qui a cassé la séance d'Ugo : elle dépasse et l'enveloppe
 * est en `hidden`. Attention au piège qui a rendu une première version de ce garde
 * creuse — un élément en `overflow: hidden` reste scrollable **par script**, donc
 * `scrollIntoViewIfNeeded` y réussit et ne prouve rien. C'est `overflow-y` qu'il faut
 * interroger, jamais le résultat d'un défilement programmatique.
 */
async function exigerAtteignable(page: Page, cible: Locator, quoi: string): Promise<boolean> {
  const boite = await cible.boundingBox()
  expect(boite, `${quoi} : aucune boîte`).not.toBeNull()
  expect(Math.round(boite!.y), `${quoi} sort par le haut`).toBeGreaterThanOrEqual(0)

  if (Math.round(boite!.y + boite!.height) <= SAFARI.height) return true

  const enveloppe = await enveloppeContrainte(page)
  expect(
    ['auto', 'scroll'],
    `${quoi} dépasse le bas de la vue et l'enveloppe « ${enveloppe.classe} » est en « ${enveloppe.overflowY} » : le bouton est perdu pour le doigt`,
  ).toContain(enveloppe.overflowY)

  await cible.scrollIntoViewIfNeeded()
  const apres = await cible.boundingBox()
  expect(
    Math.round(apres!.y + apres!.height),
    `${quoi} reste hors de la vue même après défilement`,
  ).toBeLessThanOrEqual(SAFARI.height)
  return false
}

async function actionCourante(page: Page): Promise<{ cible: Locator; nom: string } | null> {
  for (const nom of ['Valider', 'Passer ce palier', 'Terminer la séance']) {
    const cible = page.getByRole('button', { name: nom, exact: true })
    if (await cible.count()) return { cible: cible.first(), nom }
  }
  const optionnel = page.getByRole('button', { name: /^Sauter/ })
  if (await optionnel.count()) return { cible: optionnel.first(), nom: 'Sauter — optionnel' }
  return null
}

test('chaque série de la séance garde son action sous le pouce', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Voir les cibles/ }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await page.getByRole('article').first().waitFor()

  const vues: string[] = []
  const aDefiler: string[] = []
  for (let i = 0; i < 30; i++) {
    const action = await actionCourante(page)
    expect(action, 'plus aucune action proposée alors que la séance n’est pas finie').not.toBeNull()

    // La dernière étape n'a plus de carte de série : c'est l'écran de clôture.
    const carte = page.getByRole('article').first()
    const etiquette = (await carte.count())
      ? ((await carte.getAttribute('aria-label')) ?? '?')
      : 'écran de clôture'
    const sansDefiler = await exigerAtteignable(
      page,
      action!.cible,
      `« ${action!.nom} » sur ${etiquette}`,
    )
    if (!sansDefiler) aDefiler.push(etiquette)
    vues.push(etiquette)

    if (action!.nom === 'Terminer la séance') break
    await action!.cible.click()
    await page.waitForTimeout(80)
  }

  // Sans cette borne, un parcours qui s'arrêterait à la première série passerait au
  // vert en n'ayant rien éprouvé.
  expect(vues.length, 'la séance A compte 23 séries puis sa clôture').toBeGreaterThanOrEqual(23)

  // Combien de séries obligent encore à défiler : c'est l'écart qui reste entre la
  // règle « aucun écran ne scrolle » et ce que la carte mesure à 659 px. Ce lot rend
  // l'action joignable ; le faire tenir sans défiler est un travail de mise en page.
  console.log(`séries demandant un défilement : ${aDefiler.length} / ${vues.length}`)
  for (const e of aDefiler.slice(0, 5)) console.log(`   ${e}`)
})

test('rien ne dépasse en silence pendant la séance', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Voir les cibles/ }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await page.getByRole('article').first().waitFor()

  // Le contenu peut dépasser la vue — un écran plus court, un texte agrandi. Ce qui est
  // interdit, c'est qu'il dépasse **sans que le doigt puisse l'atteindre**.
  //
  // Le piège, et la raison pour laquelle une première version de ce test passait sur le
  // code cassé : un élément en `overflow: hidden` reste scrollable **par script**.
  // `element.scrollTop = 99999` y déplace bien le contenu. Seul l'utilisateur ne le
  // peut pas. Mesurer le défilement programmatique revenait donc à se faire confirmer
  // par la page qu'elle va bien.
  //
  // On interroge donc la propriété qui décide vraiment : `overflow-y`. `auto` et
  // `scroll` rendent la main à Ugo ; `hidden` et `clip` la lui retirent.
  const verdict = await page.evaluate(() => {
    // On remonte jusqu'au premier ancêtre qui contraint le débordement : c'est lui qui
    // décide si ce qui dépasse est joignable ou perdu. Viser le parent immédiat de
    // `main` laisserait le test passer, l'enveloppe fautive étant deux niveaux plus haut.
    let noeud: HTMLElement | null = document.querySelector('main')
    while (noeud && getComputedStyle(noeud).overflowY === 'visible') {
      noeud = noeud.parentElement
    }
    const enveloppe = (noeud ?? document.scrollingElement) as HTMLElement
    return {
      classe: enveloppe.className ?? '',
      overflowY: getComputedStyle(enveloppe).overflowY,
      contenu: enveloppe.scrollHeight,
      visible: enveloppe.clientHeight,
    }
  })

  console.log(
    `enveloppe « ${verdict.classe} » · overflow-y: ${verdict.overflowY} · ${verdict.contenu} px de contenu pour ${verdict.visible} px`,
  )

  if (verdict.contenu > verdict.visible) {
    expect(
      ['auto', 'scroll'],
      `le contenu dépasse de ${verdict.contenu - verdict.visible} px et l'enveloppe est en « ${verdict.overflowY} » : ce qui dépasse est perdu pour le doigt`,
    ).toContain(verdict.overflowY)
  }
})
