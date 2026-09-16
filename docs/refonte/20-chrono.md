# Mode récup — CB-74

Plan, pas encore une implémentation. À contre-relire avant d'écrire une ligne de code.

## 1. Le défaut, mesuré

Signalé par Ugo le 16.09.2026, après sa première séance complète sur l'app : « le chrono est bien
trop petit alors qu'on a de la place (maintenant trop) ».

Mesuré sur la production, iPhone 15 Pro dans un onglet Safari — 393 × 659 :

| Élément | Hauteur | Taille du chiffre |
| --- | --- | --- |
| Barre de chrono | 46 px | **20 px** |
| Charge de la série | — | 54 px |
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

### Ce que le mode récup ne fait pas

- **Il ne bloque rien.** Corriger la série qu'on vient de valider doit rester possible pendant la
  récup ; c'est même le moment naturel pour le faire.
- **Il ne se déclenche jamais sur un palier d'échauffement.** Voir § 5.
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

Ce serveur est exactement celui dont la sauvegarde automatique a besoin. **CB-75 débloque donc
cette option**, et il n'y a aucune raison de la construire deux fois. Tant que CB-75 n'est pas
livrée, le mode récup doit continuer à ne rien promettre qu'il ne tienne : le texte actuel, « pas
d'alarme garantie écran verrouillé », reste vrai et reste affiché.

**À vérifier sur l'appareil d'Ugo avant toute promesse** : il ouvre l'app dans un onglet Safari et
non depuis l'écran d'accueil — c'est ce que révèle la hauteur de 659 px. Aucune notification web ne
lui parviendra tant qu'il ne l'aura pas installée. Voir aussi CB-75 § 1, où ce même détail a une
conséquence bien plus grave.

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

Chaque mesure doit **échouer avant** le correctif. Un test écrit après coup sur un écran neuf passe
au vert sans avoir exercé son sujet — c'est le motif des 25 tests morts de CB-64.

- [ ] À 393 × 659, quand un chrono est actif, le chiffre du temps restant mesure **au moins 72 px**
      de hauteur rendue. Mutation : revenir à `text-xl` doit rougir.
- [ ] Le mode récup nomme l'exercice **suivant**, sa charge et ses répétitions. Mutation : afficher
      l'exercice courant à la place doit rougir.
- [ ] Valider un palier d'échauffement n'ouvre **pas** le mode récup.
- [ ] Les commandes du mode récup sont entièrement dans la vue à 393 × 659.
- [ ] La fin du décompte ramène à la saisie sans perdre la valeur en cours de frappe.
- [ ] Un tap pendant la récup ramène à la saisie, et le chrono continue de tourner.
- [ ] Avec **Réduire les animations**, la bascule est immédiate.
- [ ] Le texte sur l'absence d'alarme écran verrouillé reste présent tant que CB-75 n'est pas
      livrée.

## 7. Reste ouvert

- **La cible de 96 px est une intention, pas une mesure.** Elle se valide sur le téléphone d'Ugo, à
  bout de bras, pas dans un navigateur de bureau redimensionné.
- **Faut-il garder le mode récup après la dernière série ?** Il n'y a plus rien « ensuite », et
  l'écran de clôture a déjà sa place. Proposition : pas de mode récup sur la dernière série.
- **Le mode pressé raccourcit-il les récups ?** Aujourd'hui non — il retire des exercices, pas du
  repos. Hors périmètre de ce lot, mais à ne pas confondre en l'implémentant.
