# Mise en service de la connexion à la sauvegarde — CB-85, CB-87

Ce runbook ferme la différence entre un écran compilé et une connexion réellement
utilisable. La cible unique est le projet Supabase `carnet-de-barre`, ref
`rtxdtiysrdgzsomatwon`. Une autre ref arrête la procédure.

## Arbitrages d'Ugo

Le 28.09.2026 :

- le compte Auth unique est l’adresse personnelle d’Ugo ;
- le projet reste sur l'offre Supabase gratuite.

Le 29.09.2026, la connexion par code e-mail (CB-85) est remplacée par une connexion
**adresse + mot de passe** (CB-87). Sur l'offre gratuite, un code e-mail exigeait un SMTP
personnalisé, donc un mot de passe d'application Google ; le compte d'Ugo n'en propose
pas. Sans e-mail, il n'y a plus ni SMTP à configurer, ni modèle à poser, ni envoi qui
puisse tomber en panne.

## Configuration Supabase

Dans le tableau de bord du projet exact :

1. **Authentication → Users → Add user → Create new user** : l’adresse personnelle
   d’Ugo, un mot de passe long choisi par lui, **Auto Confirm User** coché. Cette création
   d'administration reste possible avec les inscriptions publiques fermées. Le mot de
   passe ne passe ni par un agent, ni par Git, ni par Vercel, ni par un ticket.
2. **Authentication → Sign In / Providers** : le fournisseur Email reste activé ;
   `enable_signup` global et `auth.email.enable_signup` restent tous deux à `false`.

Aucun SMTP, aucun modèle d'e-mail. Le réglage `otp_length` n'est plus utilisé.

La clé publishable est publique ; les inscriptions fermées côté serveur sont la
protection contre un autre client qui l'utiliserait. Supabase répond le même refus pour
une adresse inconnue et un mauvais mot de passe, et l'écran conserve cette ambiguïté.

## Configuration Vercel

Dans le projet `ugo6/carnet-de-barre`, poser en **Preview** et **Production** :

- `VITE_SUPABASE_URL=https://rtxdtiysrdgzsomatwon.supabase.co` ;
- `VITE_SUPABASE_PUBLISHABLE_KEY`, avec une clé publishable active du même projet.

Ne jamais exposer une clé secrète ou `service_role` sous un nom `VITE_*`.

## Contrôles avant recette

- `auth.users` contient exactement le compte confirmé d'Ugo ; aucun compte de test ne
  subsiste.
- Une lecture fraîche de la configuration rend les deux inscriptions désactivées.
- Une connexion avec une autre adresse est refusée et aucun utilisateur n'est créé.

## Recette sur l'iPhone d'Ugo

1. Ouvrir la PWA installée depuis l'écran d'accueil, puis Réglages → Sauvegarde.
2. Saisir l'adresse et le mot de passe, se connecter, constater l'adresse connectée.
   Accepter que le trousseau iOS enregistre le mot de passe.
3. Fermer complètement la PWA, la rouvrir et constater que la session est reprise.
4. Se déconnecter et vérifier que seule la session de cet appareil est fermée ; le
   trousseau propose le mot de passe à la connexion suivante.

La synchronisation du carnet utilisera le `client` rendu par `configureEmailAuth` ; elle
ne crée pas une seconde instance Supabase concurrente.

## Mot de passe oublié

Sans SMTP, Supabase ne peut pas envoyer de lien de réinitialisation. Ne pas supprimer
puis recréer le compte : le carnet distant est rattaché à son identifiant. Ne pas écrire
non plus dans `auth.users` en SQL : cette écriture contourne l'API Auth et ses effets de
bord.

Le chemin pris en charge est l'API d'administration Auth (`auth.admin.updateUserById`,
équivalent HTTP `PUT /auth/v1/admin/users/<UID>`), lancée **une fois par Ugo, depuis son
propre terminal**, par `scripts/changer-mot-de-passe.sh` :

1. Tableau de bord → **Authentication → Users** : copier l'`UID` du compte.
2. Tableau de bord → **Project Settings → API Keys** : copier une clé **secrète**
   `sb_secret_…`.
3. Depuis ce dépôt : `bash scripts/changer-mot-de-passe.sh`. Le script demande l'UID,
   la clé puis deux fois le nouveau mot de passe, saisies masquées. Seul « Mot de passe
   changé. » confirme le changement. Sans réponse du serveur, relancer le script avec le
   même mot de passe : l'appel peut être rejoué sans effet de bord.

Aucun des deux secrets ne passe par les arguments d'un processus, qu'un `ps` ou
`/proc/<pid>/cmdline` montreraient pendant la requête : `curl` les lit dans sa
configuration, sur son entrée standard. Ni l'environnement, ni un fichier, ni
l'historique ne les voient. La clé `sb_secret_…` contourne toutes les politiques RLS :
elle ne va jamais chez un agent, dans Git, dans Vercel ou dans une variable `VITE_*`.
Si le tableau de bord propose un jour de définir le mot de passe d'un utilisateur,
préférer ce bouton.

## Après une période sans utilisation

Le plan Free peut mettre le projet en pause après une période sans activité. Si la
connexion ou la sauvegarde ne répond plus au retour d’une coupure, vérifier dans le
tableau de bord Supabase que le projet est actif et le réactiver avant de reprendre la
recette.

## État constaté le 29.09.2026

Les variables Vercel Preview/Production sont présentes, les inscriptions globales et
e-mail sont fermées. Le schéma `20260919120000_carnet` est appliqué au projet par
`npm run supabase:pousser` ; tables, RLS, droits et fonction ont été relus. Aucun compte
Auth n'existe encore : il reste à le créer (étape 1) avant la recette réelle.
