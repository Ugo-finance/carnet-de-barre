# Sauvegarde automatique, et la porte ouverte au multi-appareils — CB-75

Plan, pas encore une implémentation. À contre-relire avant d'écrire une ligne de code.

## 1. Pourquoi maintenant, et un risque qu'Ugo ne connaît pas

Demandé par Ugo le 16.09.2026 : « j'aimerai qu'on voit pour la synchronisation sans que j'ai besoin
de faire des exports ou des copier-coller, c'est chiant ».

La gêne est réelle, mais elle n'est pas le vrai enjeu. **Ses données sont exposées à une perte
silencieuse, aujourd'hui.**

WebKit efface le stockage d'un site après **sept jours d'utilisation du navigateur sans interaction
avec ce site**. IndexedDB en fait partie. Les applications **installées sur l'écran d'accueil** en
sont exemptées — mais Ugo ouvre l'app dans un onglet, et la hauteur utile de 659 px mesurée le 15.09
est celle d'un onglet avec ses barres, pas celle d'une application installée, qui en fait 759.

**Dans quel navigateur, exactement ?** Ugo a répondu sur UGO-179 / Q3 : « iphone 15 pro et
**j'utilise chrome**, mais je peux enregistrer la webapp dans safari ». Sur iOS, Chrome s'exécute
sur WebKit comme Safari : la politique de stockage est la même, et le risque est identique. Ce qui
change est le **point de départ du transfert** — et c'est ce qui compte ici, parce que chaque
navigateur a son propre stockage.

**Son carnet est là où il a saisi sa séance.** Exporter depuis le mauvais navigateur donnerait un
carnet vide ou amorcé au dossier de départ, et l'importer ensuite écraserait le vrai. La procédure
ci-dessous commence donc par identifier ce navigateur, pas par supposer lequel c'est.

Conséquence : **deux semaines sans s'entraîner peuvent effacer tout son carnet**, sans message et
sans recours. Le seul filet actuel est un export manuel qu'il trouve pénible — donc qu'il ne fera
pas.

### Installer ne transfère **pas** le carnet

Une première version de ce plan présentait l'installation comme un geste gratuit et immédiatement
protecteur. **C'est faux, et dangereux** — P1-1 de Codex, fondé.

Sur iOS, l'application installée depuis l'écran d'accueil a **son propre stockage, séparé de celui
de Safari**. Rien n'est copié. Ugo ouvrirait une base neuve, amorcée avec le dossier de départ, en
croyant retrouver son carnet — pendant que sa séance du 15.09 resterait dans l'onglet. Et une
première sauvegarde partie de ce contexte neuf **sauvegarderait le mauvais carnet**.

Ce plan ne demande donc aucun changement de point d'entrée avant que le transfert soit fait et
**vérifié**. Procédure, dans cet ordre :

1. **ouvrir l'app dans le navigateur où la séance du 15.09 a été saisie** — la vérification est
   immédiate : l'historique doit montrer cette séance. S'il ne la montre pas, ce n'est pas le bon
   navigateur, et il ne faut rien exporter depuis celui-là ;
2. y exporter le carnet et le conserver hors de l'app ;
3. **ensuite** seulement, ajouter l'app à l'écran d'accueil ;
4. dans l'app installée, importer par le chemin existant — `previewImport` puis `importReplace` ;
5. **vérifier avant de faire confiance** : nombre de séances, date de la plus récente, et les cinq
   cibles. Ce sont les trois choses qu'un import raté rend visiblement fausses.

Le chemin d'export manuel **ne doit pas être retiré** tant que ce transfert n'est pas fait. C'est
le filet, et on ne retire pas un filet avant d'avoir sauté.

### Ce que l'installation protège, exactement

Elle exempte de **l'expiration ITP** décrite plus haut. Elle ne met pas les données à l'abri d'une
suppression par Ugo, ni d'une éviction sous pression de stockage — la politique WebKit les autorise
toutes deux. Dire « installer supprime le risque » serait une promesse que le système ne tient pas.

C'est aussi pourquoi l'installation ne remplace pas la sauvegarde : elle déplace le risque, elle ne
l'enlève pas.

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

**Les cibles sont l'état le plus disputé** — elles changent après chaque séance. Elles ne sont pas
le seul : D6 permet de corriger ou de supprimer une séance déjà écrite, donc deux appareils peuvent
diverger sur une même séance. Une première version de ce plan l'oubliait, et Codex a raison de le
relever. La différence reste utile : sur les séances la divergence est **rare et volontaire**, sur
les cibles elle est **systématique**.

Le multi-appareils portera donc sur un petit nombre d'objets identifiés, pas sur « fusionner un
carnet ». Et le choix d'une ligne par séance (§ 4) se justifie par la simplicité de la fusion des
ajouts, **non** par l'idée qu'un instantané versionné serait impossible à réconcilier : versionner
un blob permet aussi de détecter un conflit. C'est une préférence argumentée, pas une nécessité.

## 4. La forme distante

Deux collections, et non un fichier unique.

| Collection | Clé | Contenu | Écriture |
| --- | --- | --- | --- |
| `seances` | `id` de la séance | la séance telle que l'export la produit | ajout, quasi jamais modification |
| `cibles` | document unique | l'objet `targets` | réécriture après chaque séance |

**Un fichier unique serait plus simple aujourd'hui et coûterait plus cher demain.** Il n'interdit
pas de détecter un conflit — un instantané versionné le détecte très bien — mais il oblige, le jour
où deux appareils écrivent, à réconcilier un blob entier là où des ajouts disjoints se fusionnent
d'eux-mêmes. C'est un argument de coût de fusion, pas une impossibilité : une première version de ce
plan l'énonçait comme une fatalité, et Codex a eu raison de le reprendre deux fois. Une ligne par séance coûte à peine plus maintenant et rend la fusion future
naturelle, puisque des ajouts disjoints se fusionnent tout seuls.

### La révision porte sur le **carnet**, pas sur chaque document

Une révision par document ne définit aucun état cohérent — P1-2 de Codex, fondé, et son exemple
suffit à le montrer : l'ajout de séance réussit, l'envoi des cibles échoue, et une restauration
recolle la séance neuve avec les anciennes cibles. Le carnet obtenu n'a jamais existé.

Le contrat doit donc poser, **avant tout schéma** :

- **une révision de carnet**, entier strictement croissant, acquittée **seulement** quand les
  séances, les suppressions et les cibles forment ensemble un état complet. Un échec partiel ne la
  fait jamais avancer ;
- **une écriture distante atomique**, où la révision attendue est contrôlée **dans la transaction**.
  Une écriture partie d'une révision périmée est refusée, pas appliquée ;
- **un identifiant d'opération idempotent**, pour qu'une réponse perdue après commit ne produise pas
  un doublon ni un second incrément au réessai ;
- **une lecture cohérente**, qui reconstruit un candidat d'import complet avec son `schemaVersion`.

Deux appareils qui incrémentent chacun `n` en `n+1` ne se détectent pas avec un entier seul : c'est
la **révision attendue contrôlée dans la transaction** qui fait échouer le second, pas le nombre.

Chaque document distant porte, **en enveloppe et non dans le format d'export** :

- `revisionCarnet` — celle du carnet à laquelle ce document appartient ;
- `operation` — identifiant idempotent de l'écriture qui l'a posé ;
- `ecritPar`, `ecritLe` — appareil et horodatage, pour le diagnostic.

Le format d'export reste **pur** : ce qu'on envoie est exactement ce que `buildExport` produit
aujourd'hui, `schemaVersion` compris. Mélanger les métadonnées de transport aux données métier
ferait diverger le fichier qu'Ugo télécharge de celui qu'on stocke, et il n'y a aucune raison
d'avoir deux vérités.

**Tests exigés par ce paragraphe** : panne entre l'écriture des séances et celle des cibles ;
réponse perdue après commit ; reprise d'une ancienne tentative après une sauvegarde plus récente ;
deux écritures parties de la même révision.

## 5. Quand ça part, et ce qui se passe quand ça rate

### L'intention de sauvegarde s'écrit avec la donnée, pas après

Une première version de ce plan listait des déclencheurs sans dire où vit l'attente — P1-3 de
Codex, fondé, et son scénario est banal : Ugo finalise sa séance, ferme l'app dans la seconde, et
rien ne repart jamais. La mise en file vivait en mémoire.

**Règle : la génération locale à sauvegarder est écrite dans la même transaction IndexedDB que la
mutation qu'elle couvre.** Une séance finalisée et l'intention de la sauvegarder sont commitées
ensemble ou pas du tout. C'est le seul agencement où « c'est enregistré » et « ça partira » ne
peuvent pas diverger.

### Ce qui est couvert

La liste initiale oubliait trois cas, dont deux peuvent faire réapparaître des données supprimées :

| Événement | Couvert |
| --- | --- |
| Première activation avec un carnet déjà présent | oui |
| Finalisation d'une séance | oui |
| Ajustement manuel d'une cible | oui |
| Correction d'une séance (D6) | oui |
| **Suppression d'une séance** (`deleteSeance`) | oui — sinon elle revient à la restauration |
| **Remplacement complet** (`importReplace`) | oui — sinon un ancien carnet distant l'écrase |

Les suppressions exigent une représentation distante explicite — ligne retirée dans la même
transaction, ou marque de suppression. Une séance absente d'un envoi ne veut pas dire « supprimée » :
elle peut simplement ne pas avoir été envoyée.

Pas d'envoi à chaque série validée : la salle est souvent sans réseau, et cela n'apporterait qu'une
file plus longue.

### Reprise

Au lancement, au retour au premier plan, et après une reconnexion ou une ré-authentification.
**Sans exiger qu'une page reste ouverte en arrière-plan** — iOS ne le garantit pas.

**Hors ligne** : l'attente est durable, donc l'envoi repart plus tard. C'est le cas nominal : la
séance du 15.09 a été finalisée entièrement hors ligne et tout a tenu.

**En échec** : l'app dit **quand remonte la dernière sauvegarde réussie**, et ne dit jamais « à
jour » quand elle ne l'est pas. Un indicateur qui ment sur ce point est pire que pas d'indicateur —
règle du contrat § 2 sur les données de démonstration.

**IndexedDB reste la source de vérité.** Le distant est une copie, jamais un maître.

### Le tout premier envoi

Avant d'envoyer ou de restaurer quoi que ce soit, l'app doit distinguer trois situations qu'un
démarrage ne sépare pas tout seul : **une base seulement amorcée**, **des changements locaux en
attente**, et **une sauvegarde distante existante**. Envoyer le dossier de départ avant qu'Ugo ait
choisi d'écraser ou de restaurer détruirait sa sauvegarde avec des données de démonstration. C'est
le scénario « nouvelle installation avec distant existant », et c'est exactement celui qui se
produira quand il passera de Safari à l'app installée (§ 1).

**Tests exigés par ce paragraphe** : fermeture immédiatement après le commit local ; suppression
puis restauration ; import puis reconnexion ; nouvelle installation avec un distant existant.

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

## 7. Où c'est stocké — et ce qui doit être décidé avant

### Une décision d'Ugo, pas une conséquence de ce plan

Ses arbitrages du 16.09 portent sur le **périmètre** — sauvegarde d'abord, multi-appareils ensuite.
Ils ne portent ni sur un fournisseur, ni sur le fait d'envoyer ses données d'entraînement hors de
son téléphone. P2-3 de Codex, fondé : **une connexion déjà présente sur son poste ne vaut pas
validation**, et UGO-177 reste « Décision requise » sans commentaire.

Trois points étaient à consigner sous son nom. **Deux sont tranchés**, relayés ici sous mon
marqueur avec la question et la réponse.

1. **Les données peuvent quitter le téléphone.** Question posée le 17.09.2026, en listant ce qui
   part — dates, exercices, charges, répétitions, RPE, notes de séance, plus une adresse e-mail
   pour l'authentification. Réponse : **oui**.
2. **Le fournisseur est Supabase.** Même date, même question. Réponse : **ok**. Le motif de la
   proposition était qu'il est au dossier depuis CB-51 et déjà connecté à son poste ; ce n'est pas
   ce qui vaut validation, c'est sa réponse.
3. **D3 n'a pas à être modifiée** — texte retrouvé le 17.09 dans `PLAN.md`, une fois Linear
   rebranché :

   > **D3 — Pas de backend en V1.** Supabase reste une option **M5** (sync multi-appareils,
   > alimentation de la tâche planifiée Outlook).

   Elle ne dit pas « les données restent locales ». Elle dit **pas de backend en V1**, et elle
   **nomme Supabase** comme l'option du jalon M5, pour cet usage exact. Or M5 s'intitule « Après la
   première séance réelle », et Ugo l'a faite le 15.09.2026.

   Ni Codex ni moi n'avions ce texte sous les yeux, et nous avons tous les deux parlé d'un
   « changement de D3 » qui n'a pas lieu d'être. **La décision n'est pas rouverte : sa condition
   est remplie.** Ce qui restait à trancher, D3 le déléguait explicitement à M5 — et c'est ce
   qu'Ugo vient de trancher aux points 1 et 2.

   UGO-177 / CB-51 porte déjà le jalon M5 et le label « Décision requise ». C'est ce ticket qui se
   débloque, pas une règle qu'on réécrit.

Reste aussi à consigner toute **nouvelle dépendance** ajoutée au bundle, au moment où elle est
proposée et non après.

### Proposition technique, à valider et non à appliquer

**Supabase**, déjà au dossier sous CB-51 / UGO-177.

- Une table par collection du § 4, avec sécurité au niveau des lignes.
- **Appartenance par `user_id`**, politiques d'accès explicites, et des tests pour les trois cas :
  propriétaire, autre utilisateur, non authentifié. **Aucune clé privilégiée côté client** — elle
  serait lisible dans le bundle livré.
- **Authentification sans mot de passe.** Attention au piège de contexte : un lien magique reçu par
  e-mail **ouvre Safari**, dont la session est séparée de celle de l'app installée — le même
  cloisonnement qu'au § 1. Il faut donc une recette de connexion **dans la PWA installée**, et
  prévoir la saisie d'un code à usage unique si le lien ne conserve pas le contexte.
- **Renouvellement et échec de session** : une session expirée ne doit ni vider la file d'attente,
  ni faire croire que la sauvegarde est à jour. Se reconnecter reprend la file là où elle en est.

Ce qui quitte l'appareil : dates, exercices, charges, répétitions, RPE, notes de séance. Rien
d'identifiant en dehors de l'adresse e-mail d'authentification. **À afficher dans l'écran de
réglages** — Ugo doit pouvoir lire ce qu'il envoie sans ouvrir ce document.

**Ce lot ne décide pas de l'hébergement pour toujours.** Le format du § 4 est indépendant du
fournisseur : deux collections, un document JSON par ligne, une révision de carnet.

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
- [ ] Une panne entre l'écriture des séances et celle des cibles **n'avance pas** la révision de
      carnet, et la restauration ne propose jamais un état mi-ancien mi-neuf.
- [ ] Une réponse perdue après commit, rejouée, ne crée ni doublon ni second incrément.
- [ ] Deux écritures parties de la même révision : la seconde est refusée dans la transaction.
- [ ] Fermer l'app immédiatement après la finalisation laisse l'envoi repartir au lancement suivant.
- [ ] Une séance supprimée ne revient pas à la restauration.
- [ ] Un `importReplace` n'est pas écrasé par un ancien carnet distant.
- [ ] Une base seulement amorcée **n'envoie rien** avant qu'Ugo ait choisi entre écraser et
      restaurer.
- [ ] Les politiques d'accès sont testées en propriétaire, autre utilisateur et non authentifié.
- [ ] Une session expirée ne vide pas la file et n'affiche pas « à jour ».

## 9. Découpage et répartition

L'ordre proposé par Codex le 16.09, que j'accepte tel quel :

1. **corriger ces contrats et consigner les décisions requises** — le présent document et le § 7 ;
2. **CB-74 en local**, sans aucune dépendance au serveur : le mode récup n'a pas à attendre ;
3. **contrat de sauvegarde, schéma distant, transaction et politiques d'accès** — Claude ;
4. **file durable et transport** — Claude ;
5. **réglages, connexion et restauration accessible** — Codex, assemblés sur les API de magasin ;
6. **porte E2E et recette de transfert Safari → PWA** — Codex ;
7. **notification d'écran verrouillé** — ticket distinct et ultérieur, périmètre au § 4 de
   `20-chrono.md`.

Répartition qu'il propose et que je prends : il garde **CB-74** (vue récup, transitions, tests
d'assemblage), l'**interface** réglages / connexion / restauration, les **parcours E2E** et la
**procédure de transfert**. Je garde le **domaine**, le **magasin**, le **schéma distant** et le
**protocole transactionnel**.

Chaque lot livre son écran avec son point d'entrée. Un lot de contrat peut précéder son interface,
à condition d'annoncer son consommateur — c'est la leçon d'`ExportPanel`, construit, testé, revu et
inatteignable.

## 10. Reste ouvert

- **Le multi-appareils lui-même** reste non planifié, et c'est délibéré. Ce lot se contente de ne
  pas lui fermer la porte.
- **La suppression distante** : ligne retirée ou marque de suppression conservée ? La seconde
  survit mieux à une restauration partielle, au prix d'un nettoyage à prévoir.
- **Le transfert Safari → PWA d'Ugo** est à faire une seule fois, à la main, avant tout le reste.
  Il ne dépend d'aucun de ces lots : le chemin d'export et d'import existe déjà.
