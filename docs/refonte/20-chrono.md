# Mode récup — CB-74

Plan, pas encore une implémentation. À contre-relire avant d'écrire une ligne de code.

## 1. Le défaut, mesuré

Signalé par Ugo le 16.09.2026, après sa première séance complète sur l'app : « le chrono est bien
trop petit alors qu'on a de la place (maintenant trop) ».

Mesuré sur la production, iPhone 15 Pro dans un onglet Safari — 393 × 659 :

| Élément | Hauteur | Taille du chiffre |
| --- | --- | --- |
| Barre de chrono | 46 px | **20 px** |
| Charge de la série | — | 50 px |
| Espace libre sous la carte | **127 px** | — |

L'app affiche donc en 54 px **ce qu'Ugo vient de soulever**, et en 20 px **ce qu'il est en train
d'attendre**. L'inversion est complète, et elle est arrivée sans que personne la décide : la barre
a été dimensionnée quand l'écran était plein, et CB-73 a libéré la place sans redistribuer.

C'est aussi le seul moment de la séance où le téléphone n'est pas à 30 cm des yeux. Pendant la
récup il est posé sur un banc, par terre, ou sur la machine d'à côté.

## 2. L'arbitrage d'Ugo

Question posée le 16.09.2026, les trois dispositions sous les yeux — barre agrandie, mode plein
écran, ou les deux avec bascule au tap ?

Réponse : **mode récup plein écran**.

Le motif qu'il donne tient en une phrase, et c'est elle qui doit guider le dessin : pendant la
récup, la charge est déjà soulevée.

## 3. Ce que l'écran montre

Quand un chrono est actif, la vue de séance bascule en **mode récup** :

1. **Le temps restant**, en très grand — cible ≈ 96 px, à valider sur l'appareil réel et non sur
   une maquette. C'est le seul chiffre que l'écran doit rendre lisible de loin.
2. **Ce qui a déclenché la récup** : l'exercice, en petit, au-dessus.
3. **Une progression visuelle** du temps écoulé, qui se lit sans lire le chiffre.
4. **Ce qui attend ensuite** : exercice, numéro de série, charge et répétitions visées. C'est la
   question qu'Ugo se pose pendant qu'il souffle, et y répondre évite de rouvrir la carte.
5. **Les commandes** : −30 s, +30 s, et une sortie explicite de la récup.

À la fin du décompte, l'écran revient de lui-même à la saisie. Un tap y ramène avant la fin.

### Quand il s'ouvre, et quand il ne s'ouvre pas

« Quand un chrono est actif » ne suffit pas : un chrono de travail court encore pendant le palier
suivant, et cette formulation rouvrirait l'écran après chaque saisie, chaque ±30 s et chaque sortie.
P2-1 de Codex, fondé. La règle est donc un **événement**, pas un état.

| Geste | Mode récup |
| --- | --- |
| Validation d'une série de travail **effectivement écrite**, qui crée une nouvelle récupération | **s'ouvre** |
| Validation d'un palier d'échauffement | ne s'ouvre pas, même si un chrono tourne |
| Saisie d'un poids, de répétitions ou d'un RPE | ne s'ouvre pas |
| ±30 s, ou arrêt du chrono | ne s'ouvre pas ; l'arrêt le **ferme** |
| Tap de sortie | se ferme, **sans arrêter l'échéance** |
| Geste explicite de retour au chrono | se rouvre |
| Rechargement pendant une récupération | voir ci-dessous |

**Fermer la vue n'arrête pas le chrono.** Ce sont deux choses distinctes, et les confondre ferait
perdre une récupération à chaque fois qu'Ugo veut corriger une valeur.

**Au rechargement**, l'échéance persistée est relue comme aujourd'hui. Le mode récup **ne se rouvre
pas tout seul** : rien ne dit qu'Ugo rouvre l'app pour regarder le temps plutôt que pour corriger
une série. Il retrouve la saisie, la barre de chrono compacte, et le geste explicite pour revenir
au plein écran.

### Un seul propriétaire du signal d'expiration

La carte reste montée sous le mode récup. Deux `useRecoveryTimer` sur la même échéance donneraient
**deux alarmes**. Le signal appartient à un seul appelant, et le mode récup lit un temps restant
qu'on lui passe — il ne s'abonne pas une seconde fois. À prouver par un test qui compte les
notifications, pas par une relecture.

Les commandes du mode récup ne doivent pas déclencher le tap de sortie par propagation.

### Ce que le mode récup ne fait pas

- **Il ne bloque rien.** Corriger la série qu'on vient de valider doit rester possible ; c'est même
  le moment naturel pour le faire.
- **Il ne remplace pas la carte** : il la recouvre, et la carte reprend sa place intacte.

## 4. La question de l'écran verrouillé

Ugo demande le 16.09 : « il n'est pas présent sur l'écran verrouillé, jsp si c'est normal ou pas ».

**C'est attendu, et c'était déjà écrit** — contrat § 2.6, « Chrono : aucune promesse d'alarme écran
verrouillé ». Mais la raison mérite d'être dite, parce qu'elle décide de ce qui est faisable.

Ce que l'app fait aujourd'hui : l'échéance est **persistée**, donc revenir dans l'app après
n'importe quelle absence rend le bon temps restant. Le son et la vibration ne partent qu'au premier
plan.

Ce qu'iOS ne permet pas à une application web :

- **programmer une notification pour plus tard.** L'API qui le ferait — *Notification Triggers* —
  n'existe que côté Chrome, en essai, et n'a jamais été livrée dans Safari ;
- **afficher une activité en direct** sur l'écran verrouillé. Les *Live Activities* sont réservées
  aux applications natives ;
- **exécuter du code en arrière-plan** à une heure donnée.

Il reste **un seul chemin**, et il a deux conditions :

1. l'app doit être **installée sur l'écran d'accueil** — les notifications web n'existent sur iOS
   que dans ce mode, depuis iOS 16.4 ;
2. un **serveur** doit connaître l'échéance et envoyer la notification au bon moment.

**Ce chemin n'est pas débloqué par CB-75**, et une première version de ce plan le disait à tort —
P2-2 de Codex, fondé. La sauvegarde n'envoie rien à chaque série : son serveur ne connaît **aucune**
échéance de repos. Ce qui se réutilise est l'hébergement et l'authentification, pas le protocole.

L'alarme d'écran verrouillé est donc un **ticket séparé**, et son périmètre propre est plus large
qu'il n'en a l'air : permission obtenue par un geste explicite, abonnement, envoi de chaque nouvelle
échéance, envoi des modifications et des arrêts, déduplication, refus d'une notification devenue
périmée, et réception tardive ou hors ligne. Une notification ponctuelle n'est pas un décompte qui
défile : iOS ne donne pas aux applications web l'équivalent d'une *Live Activity*.

**Le texte de limitation reste affiché** tant que cette fonctionnalité séparée n'est pas livrée
**et vérifiée sur l'appareil d'Ugo**. Et même livrée, il ne faudra jamais promettre une heure de
réception garantie : une notification poussée arrive quand le système veut bien la remettre.

**Avant toute promesse, un fait à vérifier** : Ugo ouvre l'app dans un onglet Safari et non depuis
l'écran d'accueil — c'est ce que révèle la hauteur de 659 px. Aucune notification web ne lui
parviendra tant qu'il ne l'aura pas installée, et **installer n'est pas un geste anodin** : voir
CB-75 § 1, où le même détail a une conséquence bien plus grave.

## 5. Ce qui ne doit pas casser

Trois invariants ont chacun coûté un P1 cette semaine. Le mode récup les traverse tous.

- **Valider un palier d'échauffement n'arme aucun chrono** (CB-56). Le mode récup ne doit donc
  jamais s'ouvrir sur un palier. Le garde vit dans `SessionHome.test.tsx` ; il doit rester rouge
  quand on retire la condition.
- **Un chrono déjà actif n'est pas remplacé** par la validation d'un palier (CB-58).
- **L'action principale reste joignable** à 393 × 659 (CB-72). Le mode récup a ses propres boutons :
  ils entrent dans le garde de `action-atteignable.spec.ts`.

Et une leçon de mise en page : `overflow-hidden` ne fait pas rentrer un contenu, il le cache. Un
mode plein écran qui déborderait doit rester **défilable**, jamais coupé.

## 6. Acceptation

Chaque mesure doit **échouer avant** le correctif, et les transitions se testent **depuis l'app
assemblée**, pas sur le composant isolé : c'est le montage qui porte le cycle de vie. Un test écrit après coup sur un écran neuf passe
au vert sans avoir exercé son sujet — c'est le motif des 25 tests morts de CB-64.

- [ ] À 393 × 659, quand un chrono est actif, le chiffre du temps restant mesure **au moins 72 px**
      de hauteur rendue. Mutation : revenir à `text-xl` doit rougir.
- [ ] Le mode récup nomme l'exercice **suivant**, sa charge et ses répétitions. Mutation : afficher
      l'exercice courant à la place doit rougir.
- [ ] Valider un palier d'échauffement n'ouvre **pas** le mode récup.
- [ ] Les commandes du mode récup sont entièrement dans la vue à 393 × 659.
- [ ] La fin du décompte ramène à la saisie sans perdre la valeur en cours de frappe.
- [ ] Un tap pendant la récup ramène à la saisie, et **le chrono continue de tourner**. Mutation :
      arrêter l'échéance à la fermeture doit rougir.
- [ ] Saisir un poids, toucher ±30 s ou valider un palier **ne rouvre pas** le mode récup.
- [ ] Un rechargement pendant une récupération rend la saisie, pas le plein écran, et le temps
      restant reste juste.
- [ ] L'expiration ne déclenche **qu'une** alarme, carte montée sous le mode récup comprise.
      Mutation : abonner le mode récup à son propre `useRecoveryTimer` doit rougir sur le compte.
- [ ] Les commandes du mode récup ne déclenchent pas la sortie par propagation.
- [ ] Avec **Réduire les animations**, la bascule est immédiate.
- [ ] Le texte sur l'absence d'alarme écran verrouillé reste présent tant que le ticket push n'est
      pas livré **et vérifié sur l'appareil**.

## 7. Reste ouvert

- **La cible de 96 px est une intention, pas une mesure.** Elle se valide sur le téléphone d'Ugo, à
  bout de bras, pas dans un navigateur de bureau redimensionné.
- **Faut-il garder le mode récup après la dernière série ?** Il n'y a plus rien « ensuite », et
  l'écran de clôture a déjà sa place. Proposition : pas de mode récup sur la dernière série.
- **Le mode pressé raccourcit-il les récups ?** Aujourd'hui non — il retire des exercices, pas du
  repos. Hors périmètre de ce lot, mais à ne pas confondre en l'implémentant.
