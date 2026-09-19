/**
 * Les réglages locaux — CB-62.
 *
 * Ce qui peut réellement mal tourner ici n'est pas la lecture d'un booléen. C'est :
 *
 * - **perdre les trois autres** en ajoutant un quatrième réglage, ou en relisant une
 *   ligne écrite par une version différente ;
 * - **s'écraser entre deux onglets**, chacun basculant son interrupteur ;
 * - **faire échouer l'ouverture de l'app** parce qu'une ligne est abîmée.
 *
 * Le fichier part donc des formes mal écrites, et pas de la forme nominale.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CarnetDatabase } from './database.ts'
import { DexieStore } from './store.ts'
import { MemoryStore } from './memory.ts'
import {
  PREFERENCES_PAR_DEFAUT,
  PREFERENCES_VERSION,
  readPreferences,
  writePreferences,
} from '../domain/preferences.ts'

let compteur = 0
function magasin(): { base: CarnetDatabase; store: DexieStore } {
  compteur += 1
  const base = new CarnetDatabase(`carnet-preferences-${compteur}`)
  return { base, store: new DexieStore(base) }
}

describe('relire une ligne de réglages', () => {
  it('rend les défauts quand il n’y a rien', () => {
    expect(readPreferences(undefined)).toEqual(PREFERENCES_PAR_DEFAUT)
    expect(readPreferences(null)).toEqual(PREFERENCES_PAR_DEFAUT)
  })

  it('garde les réglages connus d’une ligne écrite par une version plus récente', () => {
    // Le cas d'un aller-retour entre deux appareils dont un seul est à jour. Refuser la
    // ligne entière rendrait ses trois réglages connus à leur défaut, c'est-à-dire
    // effacerait des choix qu'Ugo a faits.
    const future = { version: 99, vibration: false, sonChrono: false, reglageInconnu: 'bleu' }
    expect(readPreferences(future)).toEqual({
      ...PREFERENCES_PAR_DEFAUT,
      vibration: false,
      sonChrono: false,
    })
  })

  it('remplace champ par champ ce qui est abîmé, sans toucher au reste', () => {
    // Une seule valeur du mauvais type ne doit pas coûter les autres.
    const abimee = { version: 1, vibration: 'oui', sonChrono: false, modePresseParDefaut: null }
    expect(readPreferences(abimee)).toEqual({
      ...PREFERENCES_PAR_DEFAUT,
      sonChrono: false,
    })
  })

  it('ne prend pas une ligne qui n’est pas un objet pour des réglages', () => {
    expect(readPreferences('vibration')).toEqual(PREFERENCES_PAR_DEFAUT)
    expect(readPreferences(42)).toEqual(PREFERENCES_PAR_DEFAUT)
  })

  it('écrit la version qui l’a produite', () => {
    expect(writePreferences(PREFERENCES_PAR_DEFAUT).version).toBe(PREFERENCES_VERSION)
  })
})

describe('les réglages sur une vraie base', () => {
  it('rend les défauts sur une base neuve', async () => {
    const { store } = magasin()
    await store.ready()
    expect(await store.getPreferences()).toEqual(PREFERENCES_PAR_DEFAUT)
  })

  it('n’écrit que ce qu’on lui donne, et conserve le reste', async () => {
    const { store } = magasin()
    await store.ready()

    await store.savePreferences({ vibration: false })
    await store.savePreferences({ modePresseParDefaut: true })

    // Le second appel ne doit pas ressusciter la vibration : c'est un correctif
    // partiel, pas un remplacement.
    expect(await store.getPreferences()).toEqual({
      ...PREFERENCES_PAR_DEFAUT,
      vibration: false,
      modePresseParDefaut: true,
    })
  })

  it('survit à la fermeture et à la réouverture de la base', async () => {
    const { base, store } = magasin()
    await store.ready()
    await store.savePreferences({ sonChrono: false })
    const nom = base.name
    base.close()

    const rouverte = new DexieStore(new CarnetDatabase(nom))
    await rouverte.ready()
    expect((await rouverte.getPreferences()).sonChrono).toBe(false)
  })

  it('ne perd rien quand deux réglages partent en même temps', async () => {
    // Deux onglets, ou deux interrupteurs tapés coup sur coup. Sans la lecture et
    // l'écriture dans la même transaction, le second lit l'état d'avant le premier.
    const { store } = magasin()
    await store.ready()

    await Promise.all([
      store.savePreferences({ vibration: false }),
      store.savePreferences({ sonChrono: false }),
    ])

    const finales = await store.getPreferences()
    expect(finales.vibration).toBe(false)
    expect(finales.sonChrono).toBe(false)
  })

  it('n’efface pas les réglages quand l’historique est vidé', async () => {
    // `meta` ne fait pas partie de ce qu'un remplacement touche : effacer ses séances
    // n'est pas réinitialiser ses réglages.
    const { store } = magasin()
    await store.ready()
    await store.savePreferences({ vibration: false })

    const fichier = { schemaVersion: 2, targets: await store.getTargets(), seances: [] }
    const apercu = await store.previewImport(fichier)
    await store.importReplace(fichier, apercu.identite)

    expect((await store.getPreferences()).vibration).toBe(false)
  })
})

describe('les deux implémentations répondent pareil', () => {
  it('rendent les mêmes défauts et le même cumul', async () => {
    // Un test écrit contre `MemoryStore` doit rester vrai contre Dexie, sinon il ne
    // prouve rien de ce qui tourne sur le téléphone d'Ugo.
    const memoire = new MemoryStore()
    await memoire.ready()
    const { store: dexie } = magasin()
    await dexie.ready()

    expect(await memoire.getPreferences()).toEqual(await dexie.getPreferences())

    await memoire.savePreferences({ ecranAllume: false })
    await dexie.savePreferences({ ecranAllume: false })
    await memoire.savePreferences({ vibration: false })
    await dexie.savePreferences({ vibration: false })

    expect(await memoire.getPreferences()).toEqual(await dexie.getPreferences())
  })
})

describe('ce que les réglages changent réellement', () => {
  it('ouvre la séance dans l’état réglé, écran et mode pressé', async () => {
    // Sans ce branchement, les deux interrupteurs seraient décoratifs : réglés,
    // enregistrés, relus — et sans effet sur la seule chose qu'ils décrivent.
    const { store } = magasin()
    await store.ready()
    await store.savePreferences({ ecranAllume: true, modePresseParDefaut: true })

    const draft = await store.openDraft('A', '2026-09-15')
    expect(draft.keepAwake).toBe(true)
    expect(draft.rushed).toBe(true)
  })

  it('démarre aussi la séance dans l’état réglé', async () => {
    // `startSession` est un second chemin de construction, et il aurait pu être le seul
    // à ignorer les réglages — le genre d'oubli qui ne se voit qu'en salle, un mode
    // pressé actif à l'accueil et inactif après le tap sur « Démarrer ».
    const { store } = magasin()
    await store.ready()
    await store.savePreferences({ modePresseParDefaut: true, ecranAllume: true })

    const demarre = await store.startSession('B', '2026-09-17', { now: 5000 })
    expect(demarre.rushed).toBe(true)
    expect(demarre.keepAwake).toBe(true)
  })

  it('laisse le choix de l’accueil l’emporter sur la préférence, dans les deux sens', async () => {
    // Le mode pressé est un choix d'interface jusqu'au clic : type, date, mode et
    // `startedAt` forment une seule intention. Le poser après coup par `saveDraft`
    // casserait l'atomicité que `startSession` existe pour tenir. P1 de Codex sur #55.
    const a = magasin()
    await a.store.ready()
    await a.store.savePreferences({ modePresseParDefaut: false })
    expect((await a.store.startSession('A', '2026-09-15', { rushed: true })).rushed).toBe(true)

    const b = magasin()
    await b.store.ready()
    await b.store.savePreferences({ modePresseParDefaut: true })
    expect((await b.store.startSession('A', '2026-09-15', { rushed: false })).rushed).toBe(false)
  })

  it('applique le choix à un brouillon vierge du même jour', async () => {
    // Le dernier endroit où l'oubli était possible : `reutilisable` accepte un
    // brouillon vierge de même type et même date, et on le reprenait **tel quel**. Un
    // brouillon laissé par un affichage antérieur — ou par l'ancienne interface sur le
    // téléphone — imposait alors son mode au démarrage. P1 de Codex sur #55.
    const { store } = magasin()
    await store.ready()
    const ouvert = await store.openDraft('A', '2026-09-15')
    expect(ouvert.rushed).toBe(false)

    const demarre = await store.startSession('A', '2026-09-15', { now: 5000, rushed: true })
    expect(demarre.rushed).toBe(true)
    // Son identité est conservée : c'est le même brouillon, pas un neuf.
    expect(demarre.id).toBe(ouvert.id)
  })

  it('ne décide rien quand l’accueil ne donne pas de choix', async () => {
    const { store } = magasin()
    await store.ready()
    await store.savePreferences({ modePresseParDefaut: true })
    const ouvert = await store.openDraft('A', '2026-09-15')
    expect(ouvert.rushed).toBe(true)

    const demarre = await store.startSession('A', '2026-09-15', { now: 5000 })
    expect(demarre.rushed).toBe(true)
  })

  it('ne rouvre pas une file qu’Ugo a repliée en salle', async () => {
    // Une séance **déjà démarrée** garde son mode : le choix de l'accueil ne s'applique
    // qu'à la construction, et reprendre n'est pas recommencer.
    const { store } = magasin()
    await store.ready()
    const demarre = await store.startSession('A', '2026-09-15', { now: 5000, rushed: true })
    await store.saveDraft({ ...demarre, rushed: false })

    const reprise = await store.startSession('A', '2026-09-15', { now: 9000, rushed: true })
    expect(reprise.rushed).toBe(false)
  })

  it('n’impose rien quand rien n’a été réglé', async () => {
    // Le défaut du mode pressé est `false` : il ampute l'affichage, personne ne doit le
    // subir sans l'avoir demandé.
    const { store } = magasin()
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    expect(draft.rushed).toBe(false)
  })

  it('ne rouvre pas une séance repliée quand une cible est ajustée', async () => {
    // La reconstruction d'un brouillon vierge remet les charges à jour ; elle n'a pas à
    // décider de l'affichage. `keepAwake` était déjà protégé, `rushed` ne l'était pas.
    const { store } = magasin()
    await store.ready()
    const draft = await store.openDraft('A', '2026-09-15')
    await store.saveDraft({ ...draft, rushed: !draft.rushed, keepAwake: true })
    const avant = await store.loadDraft()

    await store.adjustTarget('squat', { w: 80 })

    const apres = await store.loadDraft()
    expect(apres?.rushed).toBe(avant?.rushed)
    expect(apres?.keepAwake).toBe(true)
    // La reconstruction a bien eu lieu : c'est ce qui rend le test non trivial.
    expect(apres?.sets.find((set) => set.id === 'a-squat:top:0')?.weight).toBe(80)
  })
})
