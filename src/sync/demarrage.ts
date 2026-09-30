/**
 * L'assemblage réel du moteur de sauvegarde — CB-79e.
 *
 * Deux choses vivent ici, et nulle part ailleurs :
 *
 * - **le client Supabase partagé.** L'écran de connexion et le moteur doivent parler au
 *   même client : c'est lui qui porte la session. Deux instances se disputeraient le
 *   stockage de session et le renouvellement du jeton, et la connexion faite dans
 *   Réglages resterait invisible au moteur. Le module du SDK reste chargé à la demande,
 *   comme avant : il ne pèse pas sur le premier affichage ;
 * - **les déclencheurs.** Une mutation enregistrée du carnet, le retour du réseau, le
 *   retour de l'app au premier plan, une connexion ou une déconnexion, et le démarrage.
 *   Il n'y a pas de minuterie : sur iOS, une PWA en arrière-plan ne tourne pas, et un
 *   réessai périodique donnerait l'illusion d'une garantie que la plateforme ne tient pas.
 *   Le retour au premier plan est le vrai moment où l'app peut agir.
 */

import { store } from '../db/store.ts'
import type { EmailAuthConfiguration } from '../features/export/supabaseAuth.ts'
import { creerMoteur, type MoteurSauvegarde } from './moteur.ts'
import { transportSupabase } from './transport.ts'

let configuration: Promise<EmailAuthConfiguration> | undefined

/**
 * La configuration de connexion, créée une seule fois pour toute l'app.
 *
 * Un échec de chargement n'est pas mémorisé : hors ligne, le module du SDK peut manquer
 * au premier essai et être là au suivant.
 */
export function configurationPartagee(): Promise<EmailAuthConfiguration> {
  configuration ??= import('../features/export/supabaseAuth.ts')
    .then((module) => module.configureEmailAuthFromVite())
    .catch((cause: unknown) => {
      configuration = undefined
      throw cause
    })
  return configuration
}

export const moteurSauvegarde: MoteurSauvegarde = creerMoteur({
  port: store,
  appareil: () => store.identifiantAppareil(),
  async transport() {
    const { client } = await configurationPartagee()
    if (!client) return null
    const { data } = await client.auth.getSession()
    return data.session ? transportSupabase(client) : null
  },
})

/** Branche les déclencheurs et lance un premier passage. Rend de quoi tout débrancher. */
export function demarrerSauvegarde(): () => void {
  let actif = true
  const demander = () => {
    if (actif) moteurSauvegarde.demander()
  }
  const auPremierPlan = () => {
    if (document.visibilityState === 'visible') demander()
  }

  const arrets: (() => void)[] = [store.surMutationCarnet(demander)]
  window.addEventListener('online', demander)
  document.addEventListener('visibilitychange', auPremierPlan)
  arrets.push(() => {
    window.removeEventListener('online', demander)
    document.removeEventListener('visibilitychange', auPremierPlan)
  })

  void store
    .ready()
    .then(() => configurationPartagee())
    .then(({ client }) => {
      if (!actif || !client) return
      const { data } = client.auth.onAuthStateChange((evenement) => {
        // Hors du rappel : le SDK tient son verrou de session pendant qu'il l'exécute,
        // et le passage relit justement la session.
        if (evenement === 'SIGNED_IN' || evenement === 'SIGNED_OUT') setTimeout(demander, 0)
      })
      arrets.push(() => data.subscription.unsubscribe())
    })
    .catch(() => {
      // Sans configuration, le passage dira `deconnecte` : rien à ajouter ici.
    })
    .finally(demander)

  return () => {
    actif = false
    for (const arret of arrets) arret()
  }
}
