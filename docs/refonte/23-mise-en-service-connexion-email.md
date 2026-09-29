# Mise en service de la connexion par code e-mail — CB-85

Ce runbook ferme la différence entre un écran compilé et une connexion réellement
utilisable. La cible unique est le projet Supabase `carnet-de-barre`, ref
`rtxdtiysrdgzsomatwon`. Une autre ref arrête la procédure.

## Arbitrage d'Ugo

Ugo a confirmé le 28.09.2026 :

- le compte Auth unique est l’adresse personnelle d’Ugo ;
- le projet reste sur l'offre Supabase gratuite ;
- l'envoi du code utilise donc un SMTP personnalisé gratuit.

Pour ce projet Free créé après le 03.06.2026, Supabase refuse la personnalisation du
modèle avec son fournisseur d'e-mail par défaut. Le SMTP Gmail du compte confirmé permet
de rester sur l'offre gratuite :

- serveur `smtp.gmail.com` ;
- port `587` avec TLS/STARTTLS ;
- utilisateur et expéditeur l’adresse personnelle d’Ugo ;
- nom d'expéditeur `Carnet de barre` ;
- mot de passe d'application Google à 16 caractères, créé après activation de la
  validation en deux étapes.

Le mot de passe d'application est saisi directement dans Supabase. Il ne va ni dans Git,
ni dans Vercel, ni dans le paquet public de la PWA, ni dans un commentaire de ticket.

## Configuration Supabase

Dans le tableau de bord du projet exact :

1. **Authentication → Users → Add user** : créer uniquement
   l’adresse personnelle d’Ugo et marquer l'e-mail confirmé. Cette création
   d'administration reste possible avec les inscriptions publiques fermées.
2. **Authentication → Emails → SMTP Settings** : activer le SMTP personnalisé et saisir
   les paramètres Gmail ci-dessus, dont le mot de passe d'application directement dans
   le tableau de bord.
3. **Authentication → Sign In / Providers → Email** : désactiver la création de nouveaux
   utilisateurs. Le réglage global `enable_signup` et le réglage e-mail
   `auth.email.enable_signup` doivent tous deux être à `false`.
4. Régler la longueur de l'OTP e-mail à **6**.
5. **Authentication → Email Templates → Magic Link** : remplacer le lien par un code et
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

## Après une période sans utilisation

Le plan Free peut mettre le projet en pause après une période sans activité. Si la
connexion ou la sauvegarde ne répond plus au retour d’une coupure, vérifier dans le
tableau de bord Supabase que le projet est actif et le réactiver avant de reprendre la
recette.

## État constaté le 28.09.2026

Les variables Vercel Preview/Production sont présentes. Le projet a été réactivé, les
inscriptions globales et e-mail sont fermées, et l'OTP vaut six chiffres. L'adresse et le
maintien sur l'offre gratuite sont arbitrés. Aucun compte Auth n'existe encore. Il reste à
créer le mot de passe d'application Google, configurer le SMTP personnalisé directement
dans Supabase, créer le compte Auth puis poser le modèle `{{ .Token }}` avant la recette
réelle.
