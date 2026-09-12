# Recette iPhone — Carnet de barre

Cette recette valide ce qu’un navigateur de bureau ne peut pas prouver : installation iOS, stockage de la PWA installée, reprise en mode avion, comportement du chrono quand l’écran se verrouille et application d’une nouvelle version.

## Environnement à consigner

| Champ | Valeur |
|---|---|
| Date | À renseigner |
| Téléphone | iPhone 15 Pro |
| Version iOS | À renseigner |
| Navigateur d’installation | Safari |
| URL | <https://carnet-de-barre.vercel.app> |
| Commit de production | À renseigner |
| Testeur | Ugo |

Une PWA iOS s’installe depuis Safari. N’installe qu’une copie : Safari, Chrome et l’application installée peuvent avoir des stockages séparés.

## Avant de commencer

1. Ouvre l’URL de production avec du réseau.
2. Dans **Export**, touche **Copier mes séances** et conserve le JSON hors de l’application. Ce fichier permettra de restaurer les vraies données après les essais.
3. Note le nombre de séances annoncé dans **Historique** et les cinq charges de **Cibles**.

Arrête la recette si l’export de sauvegarde n’est pas lisible ou ne contient pas `schemaVersion`, `targets` et `seances`.

## Installation

- [ ] Dans Safari, touche **Partager**, puis **Sur l’écran d’accueil**.
- [ ] Le nom proposé est « Carnet » et l’icône montre une barre orange sur fond sombre.
- [ ] Lance l’icône. L’application s’ouvre sans barre d’adresse, en portrait.
- [ ] Les 12 séances de départ ou les données déjà présentes sont visibles.

Résultat et notes :

> À renseigner.

## Brouillon et mode avion

1. Ouvre la séance proposée et saisis la note `RECETTE HORS LIGNE`.
2. Modifie une charge ou des répétitions, puis attends que l’indicateur de saisie soit visible.
3. Ferme complètement l’application, active le mode avion et relance-la depuis l’icône.

- [ ] L’application s’ouvre sans écran d’erreur.
- [ ] La séance, la note et la valeur modifiée sont restaurées.
- [ ] Valide un top set : le chrono apparaît.
- [ ] Termine la séance, confirme les séries incomplètes et vois le récapitulatif.
- [ ] La séance de recette apparaît dans **Historique**.
- [ ] **Copier mes séances** produit un export qui contient la séance de recette.

Résultat et notes :

> À renseigner.

## Chrono et verrouillage de l’écran

Le son et la vibration ne sont garantis qu’au premier plan. Ce contrôle consigne le comportement réel de cette version d’iOS ; il ne transforme pas le verrouillage en garantie.

- [ ] Au premier plan, laisse un chrono arriver à zéro et constate le son.
- [ ] Lance un nouveau chrono, verrouille l’écran dix secondes, puis reviens dans l’application.
- [ ] Note si le décompte a suivi l’échéance et si un son tardif s’est produit.
- [ ] Si **Garder l’écran allumé** est disponible, vérifie que l’écran reste allumé pendant le chrono.

Résultat et notes :

> À renseigner, y compris l’absence de son ou de vibration.

## Mise à jour avec des données existantes

Cette partie s’exécute lorsqu’un bandeau **Mise à jour disponible** apparaît après un nouveau déploiement.

- [ ] Avec une séance commencée, **Mettre à jour** refuse l’activation et la saisie reste présente.
- [ ] Touche **Plus tard** : aucun rechargement ne se produit.
- [ ] Termine ou abandonne explicitement la séance, puis applique la mise à jour.
- [ ] Après le rechargement, l’historique, les cibles et l’export ont les mêmes valeurs.

Résultat, ancienne version et nouvelle version :

> À renseigner.

## Ajustement, import et restauration

1. Sans séance commencée, ajuste une cible et vérifie qu’elle se reporte dans la séance affichée.
2. Dans **Export**, colle le JSON sauvegardé au début et touche **Vérifier ce contenu**.
3. Contrôle le nombre de séances et les dates annoncés avant de toucher **Remplacer définitivement**.

- [ ] L’import restaure le nombre de séances initial.
- [ ] Les cinq cibles correspondent aux valeurs notées avant la recette.
- [ ] Une fermeture et une relance conservent ces données restaurées.

Résultat et notes :

> À renseigner.

## Verdict

| Risque | Résultat | Notes |
|---|---|---|
| Perte du brouillon au rechargement | ☐ OK ☐ KO | |
| Utilisation et finalisation hors ligne | ☐ OK ☐ KO | |
| Double progression après double tap | ☐ OK ☐ KO | |
| Mise à jour pendant une séance | ☐ OK ☐ KO | |
| Conservation après mise à jour | ☐ OK ☐ KO | |
| Export puis restauration | ☐ OK ☐ KO | |
| Chrono au premier plan | ☐ OK ☐ KO | |
| Chrono écran verrouillé, constat seulement | ☐ Observé | |

Tout KO lié à une perte de données, une double progression ou une séance impossible à finaliser bloque la recette de production.
