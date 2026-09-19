# Interface de sauvegarde et restauration — CB-75a

Contrat d'interface proposé par Codex, à contre-revoir par Claude. Ticket UGO-226.
Consommateur : le lot de connexion, état de sauvegarde et restauration dans Réglages.
Le plan `21-synchronisation.md` prime sur ce document. Aucune nouvelle décision
D1–D10, dépendance ou configuration de service n'est autorisée par ce lot.

## Point d'entrée et présentation

Réglages gagne une page « Sauvegarde », accessible dans sa navigation existante.
L'écran et son point d'entrée se livrent ensemble. Export et import manuels restent
accessibles, même sans connexion ou sans réseau.

Le contenu tient en pages successives à 393 × 659 : état, connexion si nécessaire,
comparaison avant restauration, résultat. Les commandes font au moins 44 px ; un
contenu exceptionnellement long reste défilable. Le clavier ne masque ni le champ
actif ni sa commande. Les erreurs sont écrites, sans dépendre de leur seule couleur.

Texte visible avant activation : « Sauvegarde sur Supabase : dates, exercices,
charges, répétitions, RPE et notes de séance. Une adresse e-mail sert à la connexion. »
L'écran explique aussi que les séries de la séance en cours restent enregistrées sur
ce téléphone ; ce lot sauvegarde le carnet finalisé, pas le brouillon actif.
Si le stockage du téléphone est effacé pendant une séance, son brouillon et les
séries non finalisées ne sont donc pas récupérables depuis cette sauvegarde.

## États visibles

L'état vient du service, avec sa dernière réussite et ses changements encore en
attente. L'interface ne déduit pas une réussite d'un clic, d'un retour de réseau ou
de l'égalité entre une génération locale et une révision distante.

| État | Message principal | Geste disponible |
| --- | --- | --- |
| Non activée | « Sauvegarde automatique non activée. » | Commencer la connexion |
| Connexion nécessaire | « Connecte-toi pour sauvegarder ce carnet. » | Se connecter ; export manuel |
| Lecture distante nécessaire | « Vérification de la sauvegarde… » | Attendre ; continuer l'utilisation locale |
| Attente hors ligne | « Enregistré sur ce téléphone. Sauvegarde en attente de réseau. » | Continuer la séance ; export manuel |
| Envoi | « Sauvegarde en cours… » | Continuer la séance |
| Réussite sans attente | « Carnet sauvegardé. » et date de réussite | Consulter l'état ; export manuel |
| Échec | « Sauvegarde non terminée. » et dernière réussite si elle existe | Réessayer ; se reconnecter si nécessaire |
| Distant différent | « Une sauvegarde différente est disponible. » | Voir la comparaison |
| Conflit | « Les deux carnets ont changé. Sauvegarde suspendue tant que le conflit n'est pas résolu. » | Voir la comparaison ; revenir à la séance sans résoudre le conflit |

Sans réussite confirmée, afficher « Aucune sauvegarde confirmée » au lieu d'une
date fictive. En présence d'attente, de lecture inconnue, d'erreur ou de conflit,
ne jamais afficher « à jour ». Une réussite de g laisse g+1 en attente : l'écran
affiche alors cette attente et peut conserver la date de la dernière réussite.
Les dates affichées utilisent Europe/Zurich, `jj.mm.aaaa`, et l'heure locale.

Quitter la comparaison conserve les données locales mais ne résout pas le conflit
et ne relance pas l'envoi. Le message de sauvegarde suspendue reste visible au
retour. Ce contrat n'offre pas encore de commande « garder le mien » : une telle
commande exige une opération canonique de résolution, sa confirmation explicite
et ses préconditions, à annoncer par Claude dans CB-79 / UGO-228 avant le raccord.
Fermer une page ne vaut jamais consentement à remplacer le carnet distant.

## Matrice des intentions

Les noms ci-dessous désignent des intentions, pas des signatures TS déjà figées.
Claude fournit les opérations canoniques de magasin/transport ; Codex branche
l'interface sur ces opérations, sans écrire lui-même dans IndexedDB.

| Geste | Intention de service / persistance | Écran après résultat |
| --- | --- | --- |
| Commencer la connexion | Obtenir une session dans le contexte de l'app utilisée | Lecture distante puis état réel |
| Activer avec un carnet existant | Lire le distant ; distinguer carnet initial, saisies locales et sauvegarde existante avant tout envoi | État d'envoi ou comparaison, jamais remplacement automatique |
| Réessayer | Reprendre l'opération durable non résolue avant d'en créer une autre | Envoi, réussite ou erreur selon résultat canonique |
| Reconnexion après expiration | Rétablir la session sans effacer l'attente locale | Reprise du service, sans mention prématurée de réussite |
| Voir une restauration | Lire un candidat cohérent et le valider par `previewImport` | Comparaison sans écriture |
| Quitter la comparaison | Aucune écriture locale ou distante ; aucune résolution de conflit | Carnet local intact ; conflit et suspension des envois conservés si présents |
| Confirmer la restauration | Intention atomique de magasin utilisant le chemin `importReplace`, contrôles ci-dessous | Résultat réel ; rafraîchissement des écrans qui lisent le carnet |
| Exporter avant remplacement | `exportAll` puis téléchargement existant | Comparaison conservée ; erreur expliquée si l'export échoue |

La connexion par code e-mail dans la PWA est une proposition du plan, à consigner
avant implémentation. Aucun SDK n'est installé par ce contrat. Quelle que soit la
méthode retenue, la recette doit vérifier une session utilisable dans l'app
installée, sans supposer qu'une session obtenue dans Safari lui est transférée.

## Comparaison et confirmation de restauration

Montrer côte à côte les deux états : nombre de séances, date de la plus récente
(ou « Aucune séance »), cinq cibles et informations d'échec conservées. Les
libellés sont « Sur ce téléphone » et « Sauvegarde proposée ». La confirmation
dit explicitement que la restauration remplace séances et cibles du téléphone.

**Extension de contrat requise chez Claude, dans CB-79 / UGO-228.** `ImportPreview`
ne fournit actuellement que le nombre de séances, les dates du candidat et un
résumé du carnet remplacé ; il ne fournit ni les cibles des deux côtés ni leurs
informations d'échec. Les cinq cibles, leur état d'échec et la date de dernière
séance locale doivent être ajoutés à l'aperçu canonique avant ce lot UI, avec les
identités d'état nécessaires aux contrôles de confirmation. L'interface ne
reconstruit pas ces informations en analysant elle-même le fichier ou une copie
du carnet. Tant que cette extension manque, la comparaison complète n'est pas
annoncée comme livrée.

Une version inconnue, un candidat invalide ou une lecture distante incohérente
n'atteint jamais la confirmation. Les évolutions d'export restent additives,
avec `schemaVersion`, `targets` et `seances` ; aucun compteur de transport n'est
introduit dans le fichier téléchargé.

Un brouillon actif bloque la restauration ; l'écran explique comment revenir à
la séance. Ce contrôle doit aussi vivre dans la transaction de remplacement.
Une saisie locale ou une modification du candidat après l'aperçu exige un nouvel
aperçu, plutôt que d'appliquer une confirmation portant sur un ancien état.
Le service associe donc la confirmation aux états réellement comparés et contrôle
leur validité au point d'écriture. L'interface ne réécrit pas une copie du carnet.

Après remplacement, l'état de sauvegarde vient du service : une restauration
réussie ne signifie pas qu'un éventuel envoi consécutif a déjà réussi. Ce contrat
ne tranche ni le protocole de résolution distante ni la fusion multi-appareils.

## Transfert Safari vers l'app installée

Relais d'arbitrage de Claude dans le plan du 17.09 : Ugo utilise Safari pour sortir
la webapp. Garder la vérification des données comme première étape.

1. Dans Safari, vérifier que l'historique montre la séance la plus récente qu'Ugo
   sait avoir faite. Si elle manque, arrêter le transfert et retrouver le contexte
   contenant le carnet.
2. Exporter le fichier et le conserver hors de l'app. Relever nombre de séances,
   date la plus récente et cinq cibles.
3. Installer puis ouvrir l'app depuis l'écran d'accueil.
4. Importer le fichier par l'aperçu et la confirmation existants, sans brouillon actif.
5. Comparer nombre, date et cibles avec les valeurs relevées. Ne pas amorcer une
   sauvegarde depuis le carnet initial à la place du vrai carnet.

Cette recette n'est pas annoncée comme exécutée sur le téléphone d'Ugo tant
qu'il n'en a pas confirmé le résultat. L'installation et le réseau réel ne se
prouvent pas par une émulation Playwright.

## Parcours de validation du futur lot d'interface

Tests depuis App réel, avec magasin réel pour les écritures locales et transport
contrôlé pour les pannes ; recette distincte sur la PWA installée pour la connexion.

- Réglages ouvre Sauvegarde ; export reste joignable sans réseau ni session.
- Finalisation hors ligne puis reconnexion : attente visible, réussite seulement
  après acquittement ; aucune séance dupliquée.
- Mutation pendant un envoi : date de dernière réussite conservée, g+1 encore en
  attente ; retirer ce garde fait apparaître une fausse réussite et rougit.
- Réponse perdue et reprise : même opération résolue avant le départ de la suivante,
  aucun faux conflit ; un véritable changement distant reste expliqué.
- Conflit puis fermeture de la comparaison : données locales intactes, conflit
  toujours signalé et aucun envoi repris. Les nouvelles saisies locales restent
  possibles sans faire passer la sauvegarde à « à jour ».
- Nouvelle installation et distant existant : proposition, aucun envoi du carnet
  initial ; quitter conserve les données locales.
- Aperçu puis restauration : comparaison réelle, confirmation explicite, refus
  d'une version inconnue ou d'un brouillon devenu actif ; aucune écriture partielle.
- Modification locale après aperçu : refus de la confirmation périmée et nouvel
  aperçu, sans perte des changements.
- Échec d'authentification ou de réseau : attente durable conservée, message lisible,
  séance locale utilisable ; un retour au premier plan reprend le service.
- À 393 × 659, commandes atteignables avec et sans clavier ; contrôle avec des
  éléments réellement présents. Aucun rechargement SW pendant une séance active.

Les opérations de première activation, reprise et restauration doivent être
annoncées dans les contrats de magasin avant le lot UI. Les scénarios associés
s'ajoutent alors à App.test.tsx et à la porte E2E dans le même lot que le point d'entrée.
L'extension de l'aperçu et l'éventuelle opération de résolution en faveur du local
ont le même préalable ; leur prise en charge est annoncée dans CB-79 / UGO-228.
