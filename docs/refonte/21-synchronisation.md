# Sauvegarde automatique, et la porte ouverte au multi-appareils — CB-75

Plan, pas encore une implémentation. À contre-relire avant d'écrire une ligne de code.

## 1. Pourquoi maintenant, et un risque qu'Ugo ne connaît pas

Demandé par Ugo le 16.09.2026 : « j'aimerai qu'on voit pour la synchronisation sans que j'ai besoin
de faire des exports ou des copier-coller, c'est chiant ».

La gêne est réelle, mais elle n'est pas le vrai enjeu. **Ses données sont exposées à une perte
silencieuse, aujourd'hui.**

Safari efface le stockage d'un site après **sept jours d'utilisation du navigateur sans interaction
avec ce site**. IndexedDB en fait partie. Les applications **installées sur l'écran d'accueil** en
sont exemptées — mais Ugo ouvre l'app dans un onglet, et on le sait de façon certaine : la hauteur
utile de 659 px mesurée le 15.09 est celle d'un onglet Safari avec ses barres, pas celle d'une PWA
installée, qui en fait 759.

Conséquence : **deux semaines sans s'entraîner peuvent effacer tout son carnet**, sans message et
sans recours. Le seul filet actuel est un export manuel qu'il trouve pénible — donc qu'il ne fera
pas.

Deux gestes en découlent, et le premier est gratuit :

1. **Installer l'app sur l'écran d'accueil.** Cela supprime le risque d'éviction et débloque au
   passage les notifications d'iOS, dont dépend l'alarme écran verrouillé de CB-74 § 4. À faire
   ajouter à `docs/RECETTE.md` — c'est une instruction d'usage, pas une ligne de code.
2. **La sauvegarde automatique**, objet de ce lot.

## 2. L'arbitrage d'Ugo

Question posée le 16.09.2026 : sauvegarde automatique seule, vrai multi-appareils, ou sauvegarde
maintenant avec un format qui ne ferme pas la porte ?

Réponse : **sauvegarde maintenant, multi-appareils plus tard, sans jeter de travail**.

## 3. Ce qui rend le problème petit

Trois faits mesurés, et ils décident de tout le reste.

**Le carnet entier pèse 5 Ko** pour douze séances. Même avec les séries détaillées et une année
d'entraînement, on reste sous quelques centaines de kilo-octets. Aucune pagination, aucun
chargement partiel, aucune synchronisation incrémentale n'est nécessaire.

**Une séance finalisée ne change presque jamais.** Elle est écrite une fois, porte un identifiant
stable, et n'est modifiée que par une correction explicite en D6 — geste rare et délibéré.

**Les cibles sont le seul état réellement disputé.** Elles changent après chaque séance, et c'est le
seul objet que deux appareils pourraient vouloir écrire en même temps.

Autrement dit : le multi-appareils, quand il viendra, ne portera pas sur « fusionner un carnet ».
Il portera sur **un seul petit objet**. C'est ce qui permet de tenir la promesse « porte ouverte »
sans rien surdimensionner aujourd'hui.

## 4. La forme distante

Deux collections, et non un fichier unique.

| Collection | Clé | Contenu | Écriture |
| --- | --- | --- | --- |
| `seances` | `id` de la séance | la séance telle que l'export la produit | ajout, quasi jamais modification |
| `cibles` | document unique | l'objet `targets` | réécriture après chaque séance |

**Un fichier unique aurait été plus simple aujourd'hui et ferait tout jeter demain** : deux
appareils qui réécrivent le même blob ne peuvent pas fusionner, et le dernier écrase l'autre sans
que rien ne proteste. Une ligne par séance coûte à peine plus maintenant et rend la fusion future
naturelle, puisque des ajouts disjoints se fusionnent tout seuls.

Chaque document distant porte, **en enveloppe et non dans le format d'export** :

- `revision` — entier strictement croissant ;
- `ecritPar` — identifiant de l'appareil ;
- `ecritLe` — horodatage.

Le format d'export reste **pur** : ce qu'on envoie est exactement ce que `buildExport` produit
aujourd'hui, `schemaVersion` compris. Mélanger les métadonnées de transport aux données métier
ferait diverger le fichier qu'Ugo télécharge de celui qu'on stocke, et il n'y a aucune raison
d'avoir deux vérités.

C'est `revision` qui tient la porte : avec un seul appareil elle s'incrémente proprement. Avec deux,
un écart devient **détectable** au lieu d'être silencieux — et c'est tout ce qu'on demande à ce lot.

## 5. Quand ça part, et ce qui se passe quand ça rate

**Déclencheurs** : à la finalisation d'une séance, à un ajustement manuel de cible, à une correction
D6. Pas à chaque série validée — la salle est souvent sans réseau, et une écriture par série
n'apporterait rien qu'une file d'attente.

**Hors ligne** : l'envoi est mis en attente et repart au retour du réseau. C'est le cas nominal, pas
une erreur : la séance du 15.09 a été finalisée entièrement hors ligne et tout a tenu.

**En échec** : l'app dit **quand remonte la dernière sauvegarde réussie**, et ne dit jamais
« synchronisé » quand elle ne l'est pas. Un indicateur qui ment sur ce point est pire que pas
d'indicateur — c'est exactement la règle du contrat § 2 sur les données de démonstration.

**IndexedDB reste la source de vérité.** L'app fonctionne entièrement sans réseau, comme
aujourd'hui. Le distant est une copie, jamais un maître.

## 6. La restauration

Le geste qui compte le jour où le téléphone meurt.

- Au démarrage, l'app **compare** sa révision locale à la distante et ne fait rien d'autre.
- Si le distant est en avance, elle le **propose**, en montrant ce qui change : nombre de séances de
  part et d'autre, date de la plus récente, cibles.
- **Jamais d'écrasement silencieux dans un sens ou dans l'autre.** Restaurer par-dessus une séance
  saisie mais pas encore envoyée serait la façon la plus bête de perdre ce qu'on prétend protéger.
- Le chemin existant — `previewImport` puis `importReplace` — fait déjà ce travail et refuse une
  version inconnue avant toute écriture. **La restauration doit passer par lui**, pas par un second
  chemin d'écriture. Deux chemins divergent ; c'est le motif de trois P1 cette semaine.

## 7. Où c'est stocké

**Supabase**, déjà au dossier sous CB-51 / UGO-177 et déjà connecté au poste d'Ugo.

- Une table par collection du § 4, avec sécurité au niveau des lignes.
- **Authentification par lien magique**, une fois, puis session persistante. Sans authentification,
  une clé anonyme ne protège rien : le carnet serait lisible par quiconque connaît l'URL.
- Ce qui quitte l'appareil : dates, exercices, charges, répétitions, RPE, notes de séance. Rien
  d'identifiant en dehors de l'adresse e-mail servant à l'authentification. À dire explicitement
  dans l'écran de réglages — Ugo doit savoir ce qu'il envoie.

**Ce lot ne décide pas de l'hébergement pour toujours.** Le format du § 4 est indépendant du
fournisseur : deux collections, un document JSON par ligne, une révision entière.

## 8. Acceptation

Chaque mesure doit **échouer avant** le correctif.

- [ ] Une séance finalisée part toute seule, sans aucun geste d'Ugo.
- [ ] Finaliser hors ligne puis retrouver le réseau envoie la séance sans la dupliquer. Mutation :
      retirer la déduplication par `id` doit rougir.
- [ ] Deux envois successifs de la même séance laissent **une** ligne distante.
- [ ] L'indicateur affiche la date de la dernière sauvegarde **réussie**, et jamais « à jour » après
      un échec. Mutation : afficher l'heure de la tentative doit rougir.
- [ ] Au démarrage, un distant en avance est **proposé** et non appliqué.
- [ ] La restauration passe par `previewImport` / `importReplace` et refuse un `schemaVersion`
      inconnu avant toute écriture.
- [ ] Sans réseau, l'ouverture, la saisie et la finalisation restent possibles — le garde existe
      déjà dans `session.spec.ts`, il ne doit pas régresser.
- [ ] Aucun secret n'apparaît dans le dépôt ni dans le bundle livré.

## 9. Reste ouvert

- **Le découpage en lots.** Ce plan est trop gros pour une seule PR. Proposition : (a) le contrat et
  le schéma distant, (b) l'envoi et sa file d'attente, (c) la restauration et son écran, (d) la
  notification d'écran verrouillé de CB-74 § 4, qui dépend de (a).
- **Qui implémente quoi.** La partie contrat et domaine tombe naturellement du côté de Claude,
  l'écran de réglages du côté de Codex, qui vient de le construire. À trancher entre nous.
- **L'alarme écran verrouillé** est une conséquence de ce lot, pas son objet. Elle mérite son
  ticket, et elle exige que l'app soit installée sur l'écran d'accueil.
- **Le multi-appareils lui-même** reste non planifié, et c'est délibéré. Ce lot se contente de ne
  pas lui fermer la porte.
