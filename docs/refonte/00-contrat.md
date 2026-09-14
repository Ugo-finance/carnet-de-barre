# Contrat d'échauffement et arbitrages UX v2 — CB-53

Ce document fige ce qui doit être vrai **avant** d'écrire une ligne de moteur. Il ne remplace
pas `01-echauffement.md` et `02-refonte-ux.md`, validés par Ugo le 13.09.2026 : il les rend
calculables, et corrige les endroits où leurs exemples se contredisent.

Ordre de lecture en cas de désaccord :

1. les arbitrages d'Ugo consignés ici ;
2. les règles écrites de `01-echauffement.md` ;
3. la maquette `maquette-ux.html`, qui est une **référence de rendu**, pas un oracle de calcul.

Ce classement a servi deux fois. Les deux fois, la règle écrite avait raison contre la maquette.

## 1. Arbitrages d'Ugo — 13.09.2026

1. **Palier haut du soulevé de terre : 82,5 kg** à 92,5 de cible, et non 85. À 90 %, 83,25 kg
   arrondit à 82,5 au pas de 2,5. L'exemple d'origine était le seul des cinq à ne pas suivre
   l'arrondi au plus proche.
2. **Plancher du soulevé de terre : 60 kg, atteints avec 20 kg par côté.** Le besoin porte sur
   la hauteur de départ de la barre, et les disques de 20 ont le même diamètre que ceux de 25.
   La mention « avec des disques de 25 » était arithmétiquement impossible : deux disques de 25
   sur une barre de 20 font 70 kg, pas 60.
3. **Les optionnels deviennent des séries structurées** — curls, élévations latérales, face pulls
   et abdos. Voir CB-69.
4. **Le palier haut est conservé à toute cible.** La phrase « sous 60 kg de cible barre, le palier
   ~87 % saute » est **retirée**. Question posée à Ugo le 13.09.2026, les deux rampes sous les
   yeux, à la suite d'un P1 de Codex : à 57,5 kg de cible, veut-il `20 · 30 · 40 · 50` ou
   `20 · 30 · 40` ? Réponse : la rampe garde sa forme habituelle à toutes les cibles, le single
   lourd compris. Voir § 3.2 pour ce que cela donne plus bas.
5. **Les face pulls entrent dans le moteur de double progression.** La maquette les annonce
   « hors moteur (poulie) », et leur `2×15` ferme suffisait à les y laisser : sans fourchette,
   `planAccessory` ne trouve aucun haut à atteindre et retombe toujours sur la charge de la
   table. La conséquence n'était pas « ils ne montent pas » mais « ils **oublient** » — une
   séance tirée à 30 kg laissait la proposition à 25, indéfiniment. C'est la forme exacte du
   défaut qu'Ugo a vu en salle le 12.09, son incliné affichant 20 pendant qu'il en tirait 24.
   Question posée le 13.09.2026 : veut-il que la charge suive ce qu'il a noté, sans progresser
   pour autant ? Réponse : **« non il faut progresser »**.

   Les abdos roulette restent en dehors, et c'est délibéré : au poids du corps il n'y a aucune
   charge à faire monter, et la double progression déplace une charge, pas des répétitions.

   Le pas de la colonne reste celui des machines, 5 kg. Question posée à Ugo, réponse du
   13.09.2026 : c'est un détail, il corrigera à la main le jour où ça le gênera.
6. **Fourchette des face pulls : 12–20**, comme les élévations latérales. L'arbitrage 5 fait
   entrer les face pulls dans le moteur ; il ne dit pas avec quelle fourchette. Une première
   version de ce document écrivait **12–15** en le présentant comme une conséquence de la
   réponse d'Ugo — P1 de Codex, fondé, et la même faute que l'arbitrage 4 : la démonstration
   établit qu'un arbitrage est nécessaire, jamais lequel.

   Question reposée le 14.09.2026, les trois rampes sous les yeux : à 25 kg de départ et un
   pas de 5 kg, quelle fourchette avant de monter ? Réponse : **12–20**, le motif étant celui
   que son coach a appliqué aux élévations — la poulie saute de +20 % à cette charge, et une
   fourchette étroite la ferait monter trop souvent. Retour au bas de la fourchette après une
   montée, comme le défaut.
7. **Aucun écran ne scrolle. Le parcours avance page par page, un bouton après l'autre.**
   Signalé spontanément par Ugo le 14.09.2026, en usage : « sur la page principale il faut que
   je scrolle vers le bas pour trouver le bouton ; il faudrait que ce soit une page, pas que
   j'aie besoin de scroller, et que ce soit page par page, comme ça un bouton après l'autre ».

   Mesuré sur la production, iPhone 15 Pro (393 × 852 px, budget utile ~759 px en PWA
   installée, ~752 px dans l'onglet Safari) :

   | Écran | Hauteur | À scroller | Action principale |
   | --- | --- | --- | --- |
   | Accueil | 916 px | 72 px | « Démarrer la séance C » à 838 px |
   | Séance en focus | 1102 px | 258 px | « Valider » à 789 px, « Terminer » à 1040 px |

   Le budget vertical de l'accueil se répartit ainsi : en-tête 138, sélecteur A/B/C 74,
   **« Cibles du jour » 386**, échauffement et mode pressé 96, bouton 66. Un seul bloc pèse
   plus que la moitié du dépassement.

   Question posée le 14.09.2026, les trois dispositions sous les yeux — cibles sorties en page
   séparée, repliées derrière un dépliant, ou réduites à une ligne par exercice ? Réponse :
   **page séparée**. L'accueil tient en une vue et porte un seul bouton « Démarrer » ; les
   cibles du jour deviennent l'écran suivant, avec son propre bouton d'avancement.

   La règle vaut pour **tous** les écrans, pas seulement celui qu'Ugo a signalé : la séance en
   focus dépasse davantage. Un écran qui ne tient pas se **découpe** en étapes ; il ne se
   compresse pas jusqu'à devenir illisible en salle, ce que CB-43 a déjà coûté une fois.

   Deux exceptions, parce qu'elles ne sont pas des étapes d'un parcours mais des consultations :
   l'historique et la progression peuvent défiler, leur contenu étant une liste dont la longueur
   dépend des données. Leur en-tête et leur navigation restent en revanche toujours visibles.

## 2. Arbitrages des agents

Sous une seule règle : *une livraison peut masquer une métrique indéfinie, elle ne peut jamais
afficher une donnée de démonstration comme une donnée réelle.*

4. **e1RM, tonnage, carte record, bloc « Bloc 2 · Semaine 1/8 », flèches de tendance : non rendus.**
   La maquette les qualifie elle-même d'illustratifs. Ce qui manque n'est pas la même chose pour
   tous : l'e1RM, le record et le tonnage **ont leurs données** — les top sets existent — et
   attendent une **formule contractuelle**, celle de CB-13 ; le bloc de huit semaines et les
   flèches de tendance attendent en plus une donnée qui n'existe nulle part, date de début de
   cycle et période de comparaison. Les écrans se livrent sans les uns ni les autres, mais un
   ticket futur ne doit pas conclure à tort qu'il manque une donnée là où il manque une règle.
5. **Polices embarquées en WOFF2**, licences consignées. Aucun appel à Google Fonts : il casserait
   l'usage hors ligne, qui est l'usage en salle.
6. **Chrono : aucune promesse d'alarme écran verrouillé.** La maquette annonce un comportement
   qu'une PWA ne garantit pas sur iOS. Le texte se conforme à Q3 — échéance persistée, recalcul au
   retour au premier plan, son et vibration si disponibles.
7. **Sélecteur A/B/C conservé avant démarrage**, masqué pendant la séance, avec une sortie
   explicite. D7 exige qu'une séance manuelle reste toujours possible.

## 3. Règles de calcul

### 3.1 Arrondi

Au **pas disponible pour la nature de charge** de l'exercice (`WEIGHT_STEP_BY_LOAD_KIND`), au plus
proche, **égalité vers le haut**. Une charge hors grille envoie Ugo chercher un haltère qui
n'existe pas, en pleine séance.

### 3.2 Suite

Les paliers d'un exercice forment une suite **strictement croissante**, obtenue dans cet ordre :

1. calculer chaque palier et l'arrondir ;
2. supprimer tout palier **supérieur ou égal à la charge de travail** ;
3. dédupliquer, en gardant la première occurrence et ses répétitions.

Un palier qui disparaît à cible basse est une **conséquence** de ces règles, jamais un cas
particulier écrit à la main.

### Ce que ces règles donnent réellement à cible basse

Le document d'origine annonce « sous 60 kg de cible barre, le palier ~87 % saute ». **C'est
faux**, et il faut le dire ici plutôt que de laisser deux comportements déclarés à la fois :
à 57,5 kg de cible, 87 % vaut 50,025 et s'arrondit à 50 kg, qui reste strictement sous la
charge de travail. Le palier ne saute pas.

Ce qui saute, c'est le palier à **50 %**, puis celui à 70 % — ils s'écrasent sur la barre à
vide et tombent par la règle 3.2. Le palier haut est au contraire le dernier à survivre. Le
comportement vérifié :

| Cible | Paliers |
|---|---|
| 57,5 | 20×8 · 30×5 · 40×3 · 50×1 |
| 50 | 20×8 · 25×5 · 35×3 · 42,5×1 |
| 40 | 20×8 · 27,5×3 · 35×1 |
| 32,5 | 20×8 · 22,5×3 · 27,5×1 |
| 25 | 20×8 · 22,5×1 |

**Ce point a été remonté à Ugo plutôt que tranché par les agents**, et c'est la bonne
leçon du lot : la première version de ce document réécrivait une phrase de son dossier au
motif qu'aucune cible actuelle n'était concernée. Ce motif n'autorisait rien. Codex a
maintenu son P1 jusqu'à ce que la question lui soit posée.

Sa réponse, le 13.09.2026 : **la rampe garde sa forme habituelle à toutes les cibles**, le
single lourd compris. La phrase d'origine est donc retirée de `01-echauffement.md` par
décision, et non par correction.

### 3.3 Politiques

Sept politiques, `aucun` compris, déclarées **exercice par exercice dans la table du
programme**. Aucune déduction au nom de l'exercice ni au groupe musculaire : « premier mouvement à froid » ne se lit pas dans une
chaîne de caractères, et une déduction implicite se tromperait silencieusement au premier exercice
ajouté.

| Politique | Paliers | Pour |
|---|---|---|
| `barreComplet` | barre à vide ×8 → 50 % ×5 → 70 % ×3 → 87 % ×1 | le premier mouvement lourd à la barre d'un pattern froid |
| `barreReduit` | barre à vide ×10 → ⅔ ×5 | un mouvement à la barre sur un corps déjà échauffé |
| `barrePlancher` | 60 % ×5 → 78 % ×3 → 90 % ×1, **plancher 60 kg**, jamais à vide | le soulevé de terre seul |
| `lestComplet` | poids de corps ×5 → 50 % du lest ×2 | les tractions lestées quand le pattern tirage est froid |
| `lestReduit` | poids de corps ×5 | les tractions lestées sur un dos déjà sollicité |
| `accessoire` | 1×8 à 60 % | le premier exercice d'un pattern encore froid |
| `aucun` | — | tout le reste |

Précisions :

- le palier « barre à vide » vaut `BAR_WEIGHT`, soit 20 kg, et n'existe que pour `barTotal` ;
- le plancher de `barrePlancher` s'applique **après** l'arrondi, et reste soumis à la règle 3.2 :
  à une cible de 60 kg ou moins, la rampe disparaît entièrement ;
- le palier au poids de corps porte une charge `null`, jamais 0 : il n'y a pas de charge à porter ;
- si 50 % du lest arrondit à 0, le palier disparaît par la règle 3.2.

### 3.4 Ce que les paliers ne font jamais

Une série d'échauffement est **exclue de tout** : jamais dans `tops`, jamais dans les `lines` du
résumé, jamais lue par `applyProgression`, jamais comptée comme un échec ni comme un record. Elle
ne déclenche aucun chrono : le repos entre paliers est libre.

Elle est en revanche **présente dans `sets` de l'export**, avec son rôle. Une séance doit se
reproduire telle qu'elle a eu lieu.

## 4. Politique par exercice, et paliers attendus

Aux cibles du 13.09.2026 : squat 75, bench 70, deadlift 92,5, tractions +15, bench volume 60.

Ces valeurs sont les **cas canoniques** de CB-54. Elles doivent sortir du moteur à l'identique.

### Séance A — Squat + développé volume

| Exercice | Politique | Paliers attendus |
|---|---|---|
| `a-squat` | `barreComplet` | 20×8 · 37,5×5 · 52,5×3 · 65×1 |
| `a-bench-vol` | `barreReduit` | 20×10 · 40×5 |
| `a-tractions-lestees` | `lestReduit` | PDC×5 |
| `a-dips` | `aucun` | — |
| `a-curls` | `aucun` | — |
| `a-elevations` | `aucun` | — |

### Séance B — Développé lourd + dos

| Exercice | Politique | Paliers attendus |
|---|---|---|
| `b-bench` | `barreComplet` | 20×8 · 35×5 · 50×3 · 60×1 |
| `b-tractions` | `lestComplet` | PDC×5 · +7,5×2 |
| `b-rowing` | `aucun` | — |
| `b-dm` | `aucun` | — |
| `b-face-pulls` | `aucun` | — |
| `b-abdos` | `aucun` | — |

### Séance C — Soulevé de terre

| Exercice | Politique | Paliers attendus |
|---|---|---|
| `c-deadlift` | `barrePlancher` | 60×5 · 72,5×3 · 82,5×1 |
| `c-di` | `accessoire` | 14×8 |
| `c-presse` | `aucun` | — |
| `c-tractions-pdc` | `aucun` | — |
| `c-elevations` | `aucun` | — |

### Le principe derrière la colonne « aucun »

Un exercice reçoit un échauffement **s'il est le premier de son pattern dans la séance**, et
seulement à ce titre. Les dips suivent le développé volume, le rowing suit les tractions, la presse
suit le soulevé de terre, le développé militaire suit le développé couché : rien n'est froid. Le
développé incliné de la séance C est le seul accessoire à ouvrir un pattern — c'est pourquoi il est
le seul à porter la politique `accessoire`, et c'est exactement l'exemple que donne le document
d'origine.

## 5. Vérification des comptes de la maquette

La maquette annonce 23, 22 et 16 séries. La roadmap demandait de ne pas s'en servir avant
vérification contre le programme réel. Vérifié :

| Séance | Séries de travail | Paliers | Total | Annoncé |
|---|---|---|---|---|
| A | 16 | 7 | **23** | 23 |
| B | 16 | 6 | **22** | 22 |
| C | 12 | 4 | **16** | 16 |

Les trois se reproduisent exactement — **à condition que les optionnels soient structurés**. Sans
CB-69, la séance A tombe à 19 séries et la file de la séance en focus s'interrompt avant la fin.
C'est le motif de l'arbitrage 3.

## 6. Ce que nous avons dû interpréter

Trois points ne se déduisaient d'aucune règle écrite. Ils sont tranchés ici, et chacun se
contredit d'une ligne si Ugo ou son coach le corrige.

1. **La règle `barreReduit` est généralisée depuis un seul exemple.** La maquette donne 20×10 puis
   40×5 pour un développé volume à 60 kg. 40 vaut exactement ⅔ de 60, mais c'est aussi « un disque
   de 10 par côté » : un point ne distingue pas les deux lectures. Nous retenons le ratio, qui se
   calcule à toute cible. À confirmer au premier changement de cible du développé volume.
2. **Les tractions de la séance A n'ont qu'un palier, celles de la séance B en ont deux.** La
   maquette est explicite sur les deux, avec le motif « pattern tirage à froid » dans un cas et
   « ~50 % du lest » dans l'autre. La différence tient au rôle : en B les tractions sont le top set
   lourd du jour, en A un accessoire léger en superset.
3. **Les paliers de soulevé de terre de la maquette sont faux** — elle donne 60 · 75 · 85 quand les
   pourcentages écrits donnent 60 · 72,5 · 82,5. Ugo a corrigé le dernier ; le second suit du même
   calcul. Les pourcentages écrits font foi, la maquette sera corrigée.

## 7. Reste ouvert

- **Durée estimée** annoncée sur l'accueil et sur la puce « Échauffement · ~6 min » : aucune formule
  n'existe. Omise tant qu'elle n'est pas définie (CB-60).
- **Mode pressé et échauffement** : Q4 réduit les exercices, le document d'origine évoque aussi de
  réduire les paliers. Aucune règle n'est validée : le mode pressé ne touche à aucun palier, et
  Ugo peut passer une série individuellement.
- **Disques de 1,25 kg en salle** : le pas `added` est à 2,5 kg, soit +25 % sur 10 kg de lest.
  Question posée au coach, sans réponse à ce jour.
