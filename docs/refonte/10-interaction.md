# Contrat d'interaction UX v2 — CB-60

Ce document transforme la maquette en états applicatifs réels. Il décrit ce que voit Ugo, ce
qu'une action écrit et ce qui se passe ensuite. Les règles de calcul et les paliers restent dans
`00-contrat.md` ; les composants React ne les redéfinissent pas.

La maquette est une référence de rendu. Ses valeurs de démonstration ne deviennent jamais des
données de production. Les cartes e1RM, record, tonnage, tendances et « Semaine 1/8 » restent
absentes tant que leurs contrats métier ne sont pas livrés.

## 1. Vocabulaire et invariants

### Avant séance

L'accueil peut afficher une suggestion A, B ou C sans créer de brouillon. La sélection manuelle du
type et le choix du mode pressé sont des choix d'interface tant que l'utilisateur n'a pas appuyé sur
« Démarrer ».

Le clic sur « Démarrer » crée le brouillon, fixe sa date civile en Europe/Zurich et son `startedAt`,
puis ouvre la première série à faire. Ces mutations forment une seule intention utilisateur : un
échec d'écriture laisse l'accueil affiché et ne simule pas une séance commencée.

### Séance active

Un brouillon portant `startedAt` est une séance active, même si aucune série n'a encore été
validée. Pour un brouillon créé par une ancienne version sans `startedAt`, toute saisie, série
validée ou passée, note ou chrono le rend actif. Il est proposé à la reprise sans réécriture
destructive.

Une séance active :

- masque la navigation globale et le sélecteur A/B/C ;
- interdit l'import et l'ajustement d'une cible ;
- empêche tout rechargement automatique du service worker ;
- survit à une fermeture, un rechargement, une mise en arrière-plan et une sortie de la vue focus.

### États d'une série

| État | Sens dans l'interface | Effet sur la file |
|---|---|---|
| `planned` | Valeurs proposées, jamais touchées. | Première série `planned` admissible = prochaine série à faire. |
| `entered` | Au moins une valeur a été modifiée, sans validation. | Devient la prochaine série à reprendre. |
| `validated` | Réalisation confirmée après écriture réussie. | Comptée comme terminée et, sauf correction, dépassée par la file. |
| `skipped` | Série ou optionnel passé explicitement. | Compté comme traité, jamais comme un échec. |

Une valeur préremplie ne prouve jamais qu'une série a été faite. Une répétition ou un RPE inconnu
reste inconnu et n'est jamais traduit en échec.

### File de séance

La file est une **projection du brouillon et du programme**, pas une seconde source de vérité. Elle
est reconstruite au montage et après chaque écriture :

1. ordre des exercices du programme ;
2. paliers `warmup` immédiatement avant les séries de travail du même exercice ;
3. séries d'un même superset alternées par rang : exercice 1 série 1, exercice 2 série 1, exercice 1
   série 2, exercice 2 série 2 ;
4. exercices au-delà du deuxième omis de la file active en mode pressé, sans supprimer leurs
   séries du brouillon ;
5. optionnels structurés présents et explicitement passables.

La série courante canonique est la première série `planned` ou `entered` de la file active. Un
curseur local peut afficher une série précédente pour la relire, mais ne change aucune donnée. Dès
qu'une correction la place en `entered`, elle redevient la série canonique à terminer.

La progression affiche le nombre de séries `validated` ou `skipped` sur le nombre de séries de la
file active. Elle n'inclut pas les exercices désactivés par le mode pressé. Les totaux 23 / 22 / 16
ne sont affichés que s'ils sont obtenus depuis la file réelle, jamais codés en dur.

## 2. Inventaire des écrans et états

### S0 — Initialisation

- **Chargement** : « Préparation de ta séance… » pendant l'ouverture de la base et la lecture des
  données.
- **Erreur** : « Carnet indisponible » avec le motif utile et une action « Réessayer ».
- **Hors ligne** : aucun écran dégradé si le shell et IndexedDB sont disponibles. L'absence de
  réseau n'empêche ni la séance ni la sauvegarde locale.

Sortie normale : S1 ou S2.

### S1 — Accueil, aucune séance active

Affiche uniquement des données réelles :

- séance suggérée par la rotation et l'historique ;
- date de séance en heure de Zurich ;
- liste concise des exercices ;
- sélecteur manuel A/B/C ;
- mode pressé ;
- nombre de paliers d'échauffement calculé pour la sélection ;
- bouton principal « Démarrer la séance [A/B/C] ».

La durée estimée, le bloc de huit semaines et les tendances sont absents. Changer A/B/C ne crée ni
n'écrase aucun brouillon.

### S2 — Accueil, séance à reprendre

Un brouillon actif existe. L'accueil ne propose pas silencieusement une autre séance. Il montre :

- « Séance [type] en cours » ;
- date, avancement réel et dernière mise à jour ;
- bouton principal « Reprendre la séance » ;
- action secondaire « Abandonner la séance », suivie d'une confirmation.

Un brouillon ancien mais vierge peut être remplacé au démarrage d'une autre séance. Un brouillon
portant une saisie ne l'est jamais sans confirmation.

### S3 — Séance en focus

Une seule carte de série principale est visible. Elle contient selon le rôle :

- rôle, exercice et rang de la série ;
- badge du partenaire de superset, le cas échéant ;
- charge et unité adaptées à `loadKind` ;
- plaques par côté uniquement pour une charge totale à la barre ;
- répétitions éditables pour les séries de volume et accessoires ;
- RPE sur le top set uniquement ;
- action principale « Valider » ;
- action « Passer » lorsque la série ou l'exercice est passable.

La ligne « Ensuite » annonce la série suivante issue de la file. Elle n'affiche jamais une charge
calculée dans le composant.

Le haut de l'écran montre avancement et temps écoulé depuis `startedAt`. Le bas offre des boutons
visibles « Précédente » et « Quitter la vue ». Le balayage horizontal peut dupliquer
« Précédente/Suivante », sans être nécessaire au parcours.

### S4 — Séance en focus, chrono actif

La carte suivante reste utilisable pendant le repos. La zone du chrono garde une hauteur stable
dans tous ses états :

- inactif : état neutre sans promesse d'un futur déclenchement ;
- actif : temps restant calculé depuis l'échéance persistée, libellé et boutons −30 s / +30 s /
  arrêter ;
- expiré : 0:00 et signal sonore/vibration si la plateforme l'autorise.

Valider une autre série remplace l'échéance par celle de cette nouvelle validation. Un palier
`warmup` ne crée jamais de chrono ; le texte bref est « Repos libre ».

### S5 — Erreur d'écriture pendant la séance

La carte reste affichée avec les valeurs saisies. Aucune avance automatique et aucun nouveau chrono
ne sont présentés comme acquis. Le message est :

> Sauvegarde impossible. Ta série reste à confirmer. Réessayer.

L'action « Réessayer » rejoue l'intention sur le même brouillon et le même identifiant de série. La
navigation vers une autre série ne transforme pas l'échec en réussite.

### S6 — Confirmation de fin incomplète

Si des séries actives sont encore `planned` ou `entered`, « Terminer » ouvre un dialogue avec leur
nombre réel :

- « Revenir à la séance » ferme le dialogue ;
- « Terminer quand même » finalise seulement ce qui est validé et conserve les séries explicitement
  passées comme telles.

Le premier bouton reçoit le focus. Échap et le bouton retour ferment le dialogue sans finaliser.

### S7 — Fin de séance

Cet écran n'est rendu qu'après le succès de la transaction de finalisation. Il affiche :

- date, type et durée réelle si `startedAt` et `completedAt` sont disponibles ;
- séries réellement validées ;
- notes ;
- événements de progression et prochaines cibles renvoyés par la finalisation ;
- actions « Retour à l'accueil » et « Voir dans l'historique ».

Il n'affiche ni record, ni e1RM, ni tonnage tant que les tickets métier correspondants ne sont pas
livrés. Une seconde activation de « Terminer » ne crée pas une seconde séance.

### S8 — Historique et édition

Hors séance active, la navigation « Historique » ouvre les semaines et séances réelles. Une séance
peut être développée puis modifiée. L'écran d'édition garde visible :

> Corriger cette séance modifie l'historique, jamais les cibles actuelles.

La suppression demande confirmation. Correction et suppression n'écrivent aucune cible.

### S9 — Progression

L'onglet « Progression » montre les cibles courantes, leur contexte disponible et l'action
explicite d'ajustement. L'ajustement s'ouvre en feuille basse et reste interdit pendant une séance
active. Sparklines, records et e1RM sont absents tant que leurs données ne sont pas définies.

### S10 — Réglages et export

L'onglet « Réglages » rassemble :

- vibration, son du chrono, écran allumé et mode pressé par défaut ;
- matériel connu en lecture seule ;
- copie et téléchargement de l'export JSON ;
- import avec validation, résumé, proposition de sauvegarde préalable et confirmation.

L'import est refusé pendant une séance active. « Dernière sauvegarde » n'apparaît que si un instant
d'export réussi est réellement persisté.

## 3. Navigation

Hors séance active, quatre onglets sont présents en bas :

1. Séance ;
2. Historique ;
3. Progression ;
4. Réglages.

L'onglet courant porte `aria-current="page"`. Le contenu conserve une marge basse incluant
`env(safe-area-inset-bottom)`.

Pendant une séance active, ces onglets sont masqués. « Quitter la vue » revient à S2 après avoir
attendu les écritures en cours ; le brouillon et le chrono restent intacts. Cette action n'est pas
un abandon. « Abandonner la séance » vit sur S2, demande confirmation, puis supprime le brouillon.

Le bouton retour du navigateur ou de la PWA suit la même hiérarchie : fermer un dialogue, revenir de
l'édition au détail, revenir d'une série consultée à la série courante, puis quitter la vue focus.
Il ne finalise et n'abandonne jamais une séance.

## 4. Matrice action → persistance → écran suivant

| État | Action | Écriture attendue | Écran après succès | Comportement en échec |
|---|---|---|---|---|
| S0 | Initialiser | Aucune ; lecture base + brouillon + historique + préférences | S1 ou S2 | Rester S0 en erreur, proposer Réessayer |
| S1 | Choisir A/B/C | Aucune | S1 mis à jour | Sans objet |
| S1 | Basculer mode pressé | Aucune avant démarrage | S1 mis à jour | Sans objet |
| S1 | Démarrer | Créer le brouillon avec type, date, mode et `startedAt` | S3, première série | Rester S1, message et Réessayer |
| S2 | Reprendre | Aucune ; relire le brouillon | S3, première série à faire | Rester S2 |
| S2 | Abandonner, puis confirmer | Attendre les écritures, supprimer le brouillon | S1 | Garder S2 et le brouillon |
| S3 | Modifier charge/reps/RPE | Mettre la série à `entered`, écrire le brouillon | Même carte | Conserver les valeurs à l'écran et montrer S5 |
| S3 | Valider un warmup | Mettre `validated`, sans échéance de chrono | Série suivante | Rester sur la série, S5 |
| S3 | Valider une série de travail | Mettre `validated` et écrire l'échéance éventuelle dans la même version du brouillon | Série suivante + S4 | Rester sur la série, aucun nouveau chrono |
| S3 | Passer | Mettre `skipped`, sans effet de progression | Série suivante | Rester sur la série |
| S3 | Précédente | Aucune, curseur de consultation local | Série précédente | Sans objet |
| S3 | Corriger une série validée | Mettre `entered`, écrire le brouillon | Cette série devient courante | Garder l'ancienne valeur persistée et montrer S5 |
| S3/S4 | Quitter la vue | Attendre la file d'écritures ; aucune autre mutation | S2 | Rester en focus et expliquer l'écriture en attente |
| S4 | ±30 s | Écrire la nouvelle échéance absolue | S4 | Garder la dernière échéance persistée |
| S4 | Arrêter | Mettre échéance et libellé à `null` | S3, zone neutre | Rester S4 |
| S3 | Modifier notes ou préférence de séance | Écrire le brouillon | Même écran | Afficher l'erreur sans perdre le champ local |
| S3 | Terminer, séries restantes | Aucune | S6 | Sans objet |
| S3 | Terminer, tout traité | Finalisation atomique séance + cibles + fermeture du brouillon | S7 | Rester S3, permettre Réessayer |
| S6 | Terminer quand même | Même finalisation atomique | S7 | Rester S6 avec l'erreur |
| S7 | Retour accueil | Aucune | S1, données relues | Afficher S0 en erreur si la relecture échoue |
| S7 | Voir historique | Aucune | S8, séance enregistrée visible | Afficher l'erreur de lecture |
| S8 | Corriger/supprimer | Écrire uniquement la séance ou la supprimer | S8 relu | Conserver l'ancienne vue et expliquer l'échec |
| S9 | Ajuster une cible | Transaction de cible et trace d'ajustement | S9 relu | Garder la cible affichée |
| S10 | Exporter | Lecture puis copie/fichier ; mémoriser l'instant seulement après succès si ce choix est livré | S10 avec confirmation | Ne pas annoncer de sauvegarde |
| S10 | Importer | Validation complète, sauvegarde proposée, puis remplacement atomique après confirmation | S1 relu | État courant inchangé |
| Tous | Appliquer une mise à jour PWA | Rechargement autorisé seulement sans séance active | Même destination après relance | Mise à jour gardée en attente |

## 5. File détaillée et contrôles par rôle

| Rôle | Charge | Répétitions | RPE | Passable | Chrono après validation |
|---|---|---|---|---|---|
| `warmup` | Préremplie, modifiable | Préremplies, modifiables | Non | Oui | Non |
| `top` | Préremplie, modifiable | Préremplies, modifiables | Oui, avec texte en plus de la couleur | Non par défaut ; fin incomplète reste possible | Repos principal du programme |
| `backoff` | Préremplie, modifiable | Préremplies, modifiables | Non | Non par défaut | Repos principal du programme |
| `volume` | Préremplie, modifiable | Préremplies, modifiables | Non | Non par défaut | Repos du programme |
| `accessory` obligatoire | Adaptée au matériel | Oui | Non | Non par défaut | Repos du programme |
| `accessory` optionnel | Adaptée au matériel | Oui | Non | Oui | Repos du programme si validé |

Les boutons de pas utilisent `weightStepFor(loadKind)`. Une charge `bodyweight` affiche « PDC » et
n'offre aucun stepper de poids. Une charge `perDumbbell` dit « kg par haltère » ; une charge machine
ne montre jamais une barre ou des plaques calculées.

Le badge de superset annonce le partenaire, et la file alterne les exercices. « Ensuite » rend cette
alternance visible avant validation.

## 6. États transversaux

### Écriture en cours

L'action qui vient d'être déclenchée est désactivée et porte un libellé d'attente. Les autres actions
qui modifieraient le même brouillon attendent la file d'écritures. L'interface n'annonce jamais une
validation avant la confirmation du magasin.

### Hors ligne

La séance ne dépend d'aucun appel réseau. Un indicateur hors ligne peut informer sans occuper la
zone de la série ni bloquer le bouton principal. Export, historique et réglages locaux restent
disponibles.

### Mise à jour disponible

Sans séance active : « Mettre à jour » peut recharger l'application. Avec une séance active : le
bandeau dit « Mise à jour prête après ta séance » et ne propose aucun rechargement immédiat.

### Clavier, safe area et mouvement réduit

- Le champ actif reste visible au-dessus du clavier logiciel.
- Les actions principales ne passent pas sous la safe area basse.
- Toute cible tactile mesure au moins 44 px.
- `prefers-reduced-motion` supprime glissements et animations sans retarder le changement d'état.
- La couleur n'est jamais le seul signal de RPE, succès, alerte ou série passée.

## 7. Textes qui remplacent les promesses de la maquette

| Maquette | Texte contractuel |
|---|---|
| « Le chrono marche écran verrouillé » | « Le chrono reprend au retour dans l'app. Son et vibration si disponibles. » |
| « Échauffement · ~6 min » | « Échauffement · [n] paliers » tant qu'aucune durée n'est définie |
| « Record séance », e1RM et tonnage illustratifs | Carte absente |
| « Bloc 2 · Semaine 1/8 » | Bloc absent |
| Flèche de tendance illustrative | Indicateur absent |
| « Dernière sauvegarde » fictive | Ligne absente jusqu'au premier export réussi mémorisé |

## 8. Parcours d'acceptation du contrat

### Parcours nominal

1. Ouvrir l'app hors ligne sans brouillon : S1 apparaît sans écriture.
2. Choisir B puis A : aucune séance et aucun brouillon ne sont créés.
3. Démarrer A : `startedAt` est fixé et la première série réelle apparaît.
4. Valider un palier : l'écriture réussit, la file avance, aucun chrono ne démarre.
5. Modifier puis valider un top set : la saisie est persistée, puis le chrono apparaît.
6. Quitter la vue et reprendre : série courante et échéance sont retrouvées.
7. Terminer : la transaction réussit une fois, S7 affiche seulement les résultats retournés.
8. Ouvrir l'historique puis exporter : la séance est visible et le JSON la contient.

### Parcours d'échec d'écriture

1. Modifier une série puis simuler l'échec intermittent du magasin.
2. Vérifier que l'écran n'avance pas et qu'aucun chrono nouveau n'apparaît.
3. Réessayer avec le magasin rétabli.
4. Vérifier une seule validation, une seule échéance et la série suivante correcte.

### Parcours optionnel et mode pressé

1. Ouvrir une séance complète : les optionnels structurés appartiennent à la file.
2. Passer un optionnel : il devient `skipped`, la cible ne bouge pas.
3. Ouvrir une séance pressée : seuls les deux premiers exercices alimentent la file active ; leurs
   échauffements sont conservés en entier.
4. Désactiver le mode pressé avant finalisation : les séries des exercices suivants sont toujours
   présentes et reprennent leur place.

### Parcours de reprise et mise à jour

1. Reprendre un brouillon ancien contenant déjà une saisie : rien n'est injecté ou remplacé.
2. Détecter une mise à jour PWA : aucun rechargement n'est possible pendant la séance active.
3. Fermer et rouvrir l'app : la première série non traitée et le chrono recalculé sont restaurés.

Ces parcours seront automatisés dans les tickets d'interface et les portes E5/U8. CB-60 fixe leur
sens ; il n'ajoute encore aucun comportement de production.
