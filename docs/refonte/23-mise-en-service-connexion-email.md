# Mise en service de la connexion par code e-mail — CB-85

Ce runbook ferme la différence entre un écran compilé et une connexion réellement
utilisable. La cible unique est le projet Supabase `carnet-de-barre`, ref
`rtxdtiysrdgzsomatwon`. Une autre ref arrête la procédure.

## Préconditions qui nécessitent Ugo

1. Ugo confirme l'adresse e-mail unique à autoriser. Une adresse trouvée dans Git ou dans
   une autre application n'est pas un consentement à créer le compte.
2. Le projet doit pouvoir personnaliser le modèle d'e-mail. Pour ce projet Free créé
   après le 03.06.2026, Supabase refuse cette personnalisation avec son fournisseur par
   défaut. Ugo choisit donc un SMTP personnalisé ou une offre Supabase qui l'autorise.
3. Les identifiants SMTP restent dans Supabase. Ils ne vont ni dans Git, ni dans Vercel,
   ni dans le paquet public de la PWA.

## Configuration Supabase

Dans le tableau de bord du projet exact :

1. **Authentication → Users → Add user** : créer uniquement l'adresse confirmée par Ugo
   et marquer l'e-mail confirmé. Cette création d'administration reste possible avec les
   inscriptions publiques fermées.
2. **Authentication → Sign In / Providers → Email** : désactiver la création de nouveaux
   utilisateurs. Le réglage global `enable_signup` et le réglage e-mail
   `auth.email.enable_signup` doivent tous deux être à `false`.
3. Régler la longueur de l'OTP e-mail à **6**.
4. **Authentication → Email Templates → Magic Link** : remplacer le lien par un code et
   conserver la variable exacte `{{ .Token }}`. Exemple minimal :

   ```html
   <h2>Ton code de connexion</h2>
   <p>Saisis ce code dans Carnet de barre : <strong>{{ .Token }}</strong></p>
   ```

`shouldCreateUser: false` dans la PWA évite une création accidentelle par cet écran ; les
deux réglages serveur ci-dessus sont la protection contre un autre client utilisant la
clé publique.

## Configuration Vercel

Dans le projet `ugo6/carnet-de-barre`, poser en **Preview** et **Production** :

- `VITE_SUPABASE_URL=https://rtxdtiysrdgzsomatwon.supabase.co` ;
- `VITE_SUPABASE_PUBLISHABLE_KEY`, avec une clé publishable active du même projet.

La clé publishable est publique par nature. Ne jamais exposer une clé secrète ou
`service_role` sous un nom `VITE_*`.

## Contrôles avant recette

- `auth.users` contient exactement le compte confirmé d'Ugo ; aucun compte de test ne
  subsiste.
- Une lecture fraîche de la configuration rend les deux inscriptions désactivées et
  `otp_length = 6`.
- Le preview ouvre Réglages → Sauvegarde et affiche le champ d'adresse, sans erreur de
  configuration.
- Une adresse différente reçoit le message « aucun compte de sauvegarde n'est ouvert
  pour cette adresse » et aucun utilisateur n'est créé.

## Recette sur l'iPhone d'Ugo

1. Ouvrir la PWA installée depuis l'écran d'accueil, puis Réglages → Sauvegarde.
2. Saisir l'adresse précréée et demander le code.
3. Vérifier que l'e-mail contient six chiffres, sans imposer l'ouverture de Safari.
4. Saisir le code dans la PWA et constater l'adresse connectée.
5. Fermer complètement la PWA, la rouvrir et constater que la session est reprise.
6. Se déconnecter et vérifier que seule la session de cet appareil est fermée.

La synchronisation du carnet utilisera le `client` rendu par
`configureEmailCodeAuth`; elle ne crée pas une seconde instance Supabase concurrente.

## État constaté le 28.09.2026

Les variables Vercel Preview/Production sont présentes. Le projet a été réactivé, les
inscriptions globales et e-mail sont fermées, et l'OTP vaut six chiffres. Aucun compte
Auth n'existe encore. Le modèle `{{ .Token }}` reste bloqué tant qu'Ugo n'a pas choisi
SMTP personnalisé ou offre Supabase payante ; la recette réelle ne peut pas commencer
avant ces deux préconditions.
