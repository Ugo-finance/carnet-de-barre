/**
 * La séance C, jouée en entier — CB-80.
 *
 * Elle existe parce qu'Ugo en fait une le 20.09 et que **personne ne l'avait jamais
 * jouée jusqu'au bout**. Ses deux vraies séances sur l'app étaient une A et une B, et les
 * seules séries qui auraient exercé les chemins propres à la C y étaient sautées. Le
 * parcours e2e existant ouvre bien une séance C, mais valide le soulevé de terre puis
 * termine : tout ce qui suit n'était exercé nulle part.
 *
 * Deux chemins ne sont pas des variantes cosmétiques :
 *
 * - **`machine`** a un pas de 5 kg, contre 2,5 partout ailleurs. C'est le saut réel des
 *   disques de la presse 45°, confirmé par le coach le 13.09. Proposer un pas que la
 *   machine ne permet pas obligerait à corriger chaque charge à la main, en salle.
 * - **`bodyweight`** retire le champ de poids et fait passer la carte sur une colonne.
 *   Cette mise en page n'était rendue nulle part ailleurs, donc son bouton « Valider »
 *   non plus — et perdre ce bouton hors de l'écran a déjà coûté une séance (CB-72).
 *
 * Écrit avant la séance, et il n'a **rien trouvé de cassé**. C'est le résultat attendu
 * d'un garde : il ne prouve pas qu'un défaut existait, il interdit qu'il apparaisse.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'

const DIMANCHE = '2026-09-20T14:00:00.000Z'
/** L'écran d'Ugo dans un onglet Safari : 393 × 659 utiles. */
const SAFARI = { width: 393, height: 659 }

async function ouvrirSeanceC(page: Page): Promise<void> {
  await page.setViewportSize(SAFARI)
  await page.clock.setFixedTime(DIMANCHE)
  await page.goto('/')
  await page.getByRole('button', { name: 'Voir les cibles de la séance C' }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect(page.getByRole('article', { name: 'Soulevé de terre · palier 1' })).toBeVisible()
}

/**
 * Referme le mode récup s'il est ouvert.
 *
 * À appeler **avant** de viser un bouton, jamais après : le plein écran recouvre la
 * carte, et le clic part alors dans le vide sans autre symptôme qu'une expiration.
 */
async function quitterRecup(page: Page): Promise<void> {
  const retour = page.getByRole('button', { name: 'Revenir à la saisie' })
  if (await retour.isVisible().catch(() => false)) await retour.click()
}

/**
 * Le nom de la carte courante, ou `null` quand la file est vide.
 *
 * Le comptage vient **avant** la lecture de l'étiquette, et ce n'est pas un détail :
 * lire un attribut sur une carte qui n'existe pas attend jusqu'à l'expiration du test.
 * Une file terminée se lisait alors comme un test trop lent.
 */
async function carteCourante(page: Page): Promise<{ carte: Locator; nom: string } | null> {
  await quitterRecup(page)
  if ((await page.getByRole('article').count()) === 0) return null
  const carte = page.getByRole('article').first()
  return { carte, nom: (await carte.getAttribute('aria-label')) ?? '' }
}

/** Valide la carte courante et attend qu'elle quitte la file. */
async function validerCourante(page: Page): Promise<string | null> {
  const courante = await carteCourante(page)
  if (!courante) return null
  await courante.carte.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByRole('article', { name: courante.nom })).toHaveCount(0)
  return courante.nom
}

/** Avance dans la file jusqu'à la première carte de cet exercice. */
async function atteindre(page: Page, exercice: string): Promise<Locator> {
  // Bornée : une séance C compte seize séries. Une file qui ne se vide pas doit faire
  // échouer le test avec un message, pas le faire pendre jusqu'à l'expiration.
  for (let index = 0; index < 30; index += 1) {
    const courante = await carteCourante(page)
    if (!courante) break
    if (courante.nom.startsWith(exercice)) return courante.carte
    await validerCourante(page)
  }
  throw new Error(`Jamais atteint dans la file de la séance C : ${exercice}`)
}

test('se joue jusqu’au bout, tous exercices traversés', async ({ page }) => {
  // Seize séries, chacune avec son écriture et sa récupération : la limite par défaut
  // de 30 s est trop courte, et l'expiration se lit alors comme une page fermée plutôt
  // que comme un test trop lent.
  test.setTimeout(120_000)
  await ouvrirSeanceC(page)

  const vus: string[] = []
  for (let index = 0; index < 30; index += 1) {
    const nom = await validerCourante(page)
    if (nom === null) break
    vus.push(nom)
  }

  // Les cinq exercices de la séance, et non le premier seulement.
  for (const exercice of [
    'Soulevé de terre',
    'Développé incliné haltères',
    'Presse 45°',
    'Tractions poids de corps',
    'Élévations latérales',
  ]) {
    expect(vus.filter((nom) => nom.startsWith(exercice)).length, exercice).toBeGreaterThan(0)
  }

  // Le superset alterne : la presse et les tractions ne se jouent pas en bloc.
  const superset = vus.filter(
    (nom) => nom.startsWith('Presse 45°') || nom.startsWith('Tractions poids de corps'),
  )
  expect(superset[0]?.startsWith('Presse 45°')).toBe(true)
  expect(superset[1]?.startsWith('Tractions poids de corps')).toBe(true)

  // La file vidée mène directement à la clôture, sans passer par le menu d'actions.
  await expect(page.getByRole('heading', { name: 'Toutes les séries sont traitées' })).toBeVisible()
})

test('la presse se règle par pas de 5 kg, celui de sa pile', async ({ page }) => {
  await ouvrirSeanceC(page)

  const presse = await atteindre(page, 'Presse 45°')

  await expect(presse.getByRole('button', { name: 'Augmenter Poids de 5' })).toBeVisible()
  await expect(presse.getByRole('button', { name: 'Diminuer Poids de 5' })).toBeVisible()
  // Et non le pas de la barre, qui ne tombe pas sur les disques de la machine.
  await expect(presse.getByRole('button', { name: 'Augmenter Poids de 2,5' })).toHaveCount(0)
})

test('les tractions au poids de corps n’ont aucun champ de charge', async ({ page }) => {
  await ouvrirSeanceC(page)

  const tractions = await atteindre(page, 'Tractions poids de corps')

  // Demander un poids ici demanderait une valeur qui n'existe pas.
  await expect(tractions.getByRole('button', { name: /Poids/ })).toHaveCount(0)
  await expect(tractions.getByRole('button', { name: 'Augmenter Répétitions de 1' })).toBeVisible()
})

test('le bouton Valider des tractions au poids de corps tient dans l’écran', async ({ page }) => {
  // La carte passe sur une colonne pour elles : c'est une mise en page que rien d'autre
  // ne rend, donc rien d'autre ne garde. Perdre « Valider » hors de l'écran a déjà coûté
  // une séance (CB-72), et c'était sur une disposition testée.
  await ouvrirSeanceC(page)

  const tractions = await atteindre(page, 'Tractions poids de corps')
  const valider = tractions.getByRole('button', { name: 'Valider' })

  const boite = await valider.boundingBox()
  expect(boite, 'Valider : aucune boîte').not.toBeNull()
  expect(Math.round(boite!.y), 'Valider sort par le haut').toBeGreaterThanOrEqual(0)
  expect(
    Math.round(boite!.y + boite!.height),
    'Valider sort par le bas de l’écran Safari',
  ).toBeLessThanOrEqual(SAFARI.height)

  await valider.click()
  await expect(
    page.getByRole('article', { name: /^Tractions poids de corps · série 1/ }),
  ).toHaveCount(0)
})

test('la séance finit et retient chaque exercice, page suivante comprise', async ({ page }) => {
  test.setTimeout(120_000)
  // Le bout du parcours. Le récapitulatif est **paginé par trois** : une vérification
  // qui s'arrête à la première page croirait que les derniers exercices ont disparu.
  await ouvrirSeanceC(page)

  for (let index = 0; index < 30; index += 1) {
    if ((await validerCourante(page)) === null) break
  }

  await quitterRecup(page)
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  await expect(page.getByRole('heading', { name: 'Séance C terminée' })).toBeVisible()

  const lu: string[] = []
  for (let index = 0; index < 10; index += 1) {
    lu.push((await page.getByRole('main').textContent()) ?? '')
    const suivant = page.getByRole('button', { name: 'Suivant' })
    if (!(await suivant.isVisible().catch(() => false))) break
    await suivant.click()
  }
  const tout = lu.join(' ')

  for (const exercice of [
    'Soulevé de terre',
    'Développé incliné haltères',
    'Presse 45°',
    'Tractions poids de corps',
    'Élévations latérales',
  ]) {
    expect(tout, `${exercice} absent du récapitulatif`).toContain(exercice)
  }
})

test('la charge saisie sur la presse se retrouve dans la séance écrite', async ({ page }) => {
  test.setTimeout(120_000)
  // La presse n'a **pas de charge cible** : son schéma dit « noter la charge ». Si la
  // valeur tapée ne ressortait pas, Ugo la perdrait sans le voir — le récapitulatif
  // affiche « ? » quand rien n'est saisi, ce qui est honnête, mais ne prouve rien du
  // chemin où il la saisit vraiment. C'est celui-là qu'il utilisera demain.
  await ouvrirSeanceC(page)

  const presse = await atteindre(page, 'Presse 45°')
  const plus = presse.getByRole('button', { name: 'Augmenter Poids de 5' })
  for (let index = 0; index < 4; index += 1) await plus.click()

  for (let index = 0; index < 30; index += 1) {
    if ((await validerCourante(page)) === null) break
  }
  await quitterRecup(page)
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  await expect(page.getByRole('heading', { name: 'Séance C terminée' })).toBeVisible()

  const lu: string[] = []
  for (let index = 0; index < 10; index += 1) {
    lu.push((await page.getByRole('main').textContent()) ?? '')
    const suivant = page.getByRole('button', { name: 'Suivant' })
    if (!(await suivant.isVisible().catch(() => false))) break
    await suivant.click()
  }

  // Quatre pas de 5 kg depuis zéro : la charge doit être là, et pas un « ? ».
  expect(lu.join(' ')).toContain('Presse 45° : 20×10')
})
