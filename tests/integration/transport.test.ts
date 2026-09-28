/**
 * Le transport contre une vraie pile Supabase — CB-79d.
 *
 * Vrai Postgres, vraie authentification, vraie API : le client officiel, la fonction
 * `appliquer_sauvegarde` et les règles de ligne tels qu'ils tourneront chez Ugo. Seule la
 * machine change — c'est la pile **locale**, jamais le projet d'Ugo.
 *
 * Hors de `npm run check` (le dossier `tests/` n'est pas inclus) : il faut Docker et la
 * pile démarrée. `npm run test:transport` le lance, après avoir vérifié la cible.
 *
 * @vitest-environment node
 */

import 'fake-indexeddb/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { CarnetDatabase } from '../../src/db/database.ts'
import { DexieStore } from '../../src/db/store.ts'
import { synchroniser, transportSupabase } from '../../src/sync/transport.ts'

const URL = process.env.SUPABASE_LOCAL_URL ?? ''
const CLE = process.env.SUPABASE_LOCAL_ANON ?? ''

/**
 * Refuse de tourner contre autre chose que la machine locale. Ce test inscrit des comptes
 * et écrit des carnets : pointé vers un projet réel, il y créerait de faux utilisateurs.
 */
beforeAll(() => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL)) {
    throw new Error(`Refus : ce test n'écrit que sur la pile locale, pas sur « ${URL} ».`)
  }
})

/** Un compte neuf et connecté, propre à chaque test. */
async function compteConnecte(): Promise<SupabaseClient> {
  const client = createClient(URL, CLE, { auth: { persistSession: false } })
  const email = `essai-${crypto.randomUUID()}@carnet.test`
  const { data, error } = await client.auth.signUp({ email, password: 'mot-de-passe-local-1' })
  if (error || !data.session) throw new Error(`Inscription locale impossible : ${error?.message}`)
  return client
}

const CARNET = {
  seances: [{ id: 's1', date: '2026-09-15', type: 'A', lines: [], tops: {}, notes: '' }],
  targets: { updatedAt: '2026-09-15', squat: { w: 80, inc: 2.5, reps: 4, fail: null } },
} as never

describe('le transport, contre la vraie API', () => {
  it('lit « absente » avant tout envoi, puis la révision posée', async () => {
    const transport = transportSupabase(await compteConnecte())

    expect(await transport.lire()).toEqual({ etat: 'absente' })
    expect(
      await transport.ecrire({
        operation: 'iphone:1',
        revisionAttendue: 0,
        appareil: 'iphone',
        carnet: CARNET,
      }),
    ).toEqual({ motif: 'applique', revision: 1 })
    expect(await transport.lire()).toEqual({ etat: 'lue', revision: 1, operation: 'iphone:1' })
  })

  it('rend « déjà appliqué » au réessai, et « périmé » à une révision dépassée', async () => {
    const transport = transportSupabase(await compteConnecte())
    await transport.ecrire({
      operation: 'iphone:1',
      revisionAttendue: 0,
      appareil: 'iphone',
      carnet: CARNET,
    })

    expect(
      await transport.ecrire({
        operation: 'iphone:1',
        revisionAttendue: 0,
        appareil: 'iphone',
        carnet: CARNET,
      }),
    ).toEqual({ motif: 'deja-applique', revision: 1 })
    expect(
      await transport.ecrire({
        operation: 'iphone:2',
        revisionAttendue: 0,
        appareil: 'iphone',
        carnet: CARNET,
      }),
    ).toEqual({ motif: 'revision-perimee', revision: 1 })
  })

  it('accepte la deuxième sauvegarde, partie de la révision posée par la première', async () => {
    // Le cas de toutes les séances après la première. Sans lui, un transport qui
    // enverrait toujours la révision 0 passait tous les autres tests : ils écrivaient
    // tous depuis 0.
    const transport = transportSupabase(await compteConnecte())
    await transport.ecrire({
      operation: 'iphone:1',
      revisionAttendue: 0,
      appareil: 'iphone',
      carnet: CARNET,
    })

    expect(
      await transport.ecrire({
        operation: 'iphone:2',
        revisionAttendue: 1,
        appareil: 'iphone',
        carnet: CARNET,
      }),
    ).toEqual({ motif: 'applique', revision: 2 })
  })

  it('ne montre pas le carnet d’un compte à un autre', async () => {
    const ugo = transportSupabase(await compteConnecte())
    await ugo.ecrire({
      operation: 'iphone:1',
      revisionAttendue: 0,
      appareil: 'iphone',
      carnet: CARNET,
    })

    expect(await transportSupabase(await compteConnecte()).lire()).toEqual({ etat: 'absente' })
  })

  it('refuse d’écrire sans session, avec un message qui le dit', async () => {
    const anonyme = transportSupabase(createClient(URL, CLE, { auth: { persistSession: false } }))

    await expect(
      anonyme.ecrire({ operation: 'x:1', revisionAttendue: 0, appareil: 'x', carnet: CARNET }),
    ).rejects.toThrow()
  })

  it('refuse une écriture directe dans les tables, même connecté', async () => {
    // La protection vit dans le schéma, pas dans le client : on la teste par la vraie API.
    const client = await compteConnecte()
    const { data: utilisateur } = await client.auth.getUser()

    const { error } = await client.from('seance').insert({
      user_id: utilisateur.user!.id,
      id: 'directe',
      contenu: {},
      revision_carnet: 999,
      operation: 'x',
      ecrit_par: 'x',
      ecrit_le: new Date().toISOString(),
    })

    expect(error, 'une écriture directe a été acceptée').not.toBeNull()
  })
})

describe('un cycle complet, du magasin au serveur', () => {
  it('envoie le vrai carnet local, que le serveur restitue à l’identique', async () => {
    const client = await compteConnecte()
    const store = new DexieStore(new CarnetDatabase(`integration-${crypto.randomUUID()}`))
    await store.ready()
    await store.adjustTarget('squat', { w: 82.5 })

    expect(await synchroniser(store, transportSupabase(client), 'iphone-15-pro')).toEqual({
      issue: 'envoye',
      revision: 1,
    })

    const { data: cibles } = await client.from('cibles').select('contenu').single()
    expect((cibles!.contenu as { squat: { w: number } }).squat.w).toBe(82.5)
    const { count } = await client.from('seance').select('*', { count: 'exact', head: true })
    expect(count).toBe((await store.listSeances()).length)
    expect(await synchroniser(store, transportSupabase(client), 'iphone-15-pro')).toEqual({
      issue: 'a-jour',
    })

    // La séance suivante : le cycle doit repartir de la révision 1, pas de 0.
    await store.adjustTarget('bench', { w: 75 })
    expect(await synchroniser(store, transportSupabase(client), 'iphone-15-pro')).toEqual({
      issue: 'envoye',
      revision: 2,
    })
  })
})
