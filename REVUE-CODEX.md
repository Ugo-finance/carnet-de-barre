# Revue Codex — Carnet de barre

12 septembre 2026 — revue du PLAN.md version 1, avant arbitrage d’Ugo et M0.

**Avis : d’accord sur la direction, désaccord sur plusieurs critères qui empêchent de valider le plan tel quel.** Vite/React/TypeScript, stockage local et domaine pur conviennent au périmètre. Les priorités sont de sécuriser les données et le moteur, puis de vérifier une séance complète hors ligne sur le téléphone réel avant le 20 septembre. Les propositions ci-dessous ne modifient pas les décisions : Ugo les arbitre, Claude reporte les décisions retenues dans le plan.

Sources locales relues : [SPEC.md](handoff/carnet-de-barre-handoff/SPEC.md), [prototype](handoff/carnet-de-barre-handoff/prototype/carnet-de-barre.html), [seed.json](handoff/carnet-de-barre-handoff/data/seed.json), [PLAN.md](PLAN.md), ainsi que les précédents de collaboration du portail paie et le modèle de veille indiqué.

## 1. Décisions D1–D8

| Décision | Avis et proposition |
|---|---|
| **D1 — Vite + React 19 + TypeScript** | **D’accord.** Le site statique convient à cette application sans API. React n’est pas indispensable, mais revenir au vanilla ferait perdre du temps sans gain produit établi. Garder cette stack, figer les versions et le lockfile en M0. L’argument déterminant est la simplicité du besoin, pas une comparaison absolue de fiabilité entre frameworks. |
| **D2 — Dexie, export format seed** | **D’accord sur Dexie ; désaccord sur le contrat encore ambigu.** Il faut une transaction pour séance + cibles et une persistance du brouillon dès la saisie, pas seulement à la fin. « Format exact » et ajout de `schemaVersion`, UUID, séries et accessoires ne sont pas identiques : arbitrer une enveloppe compatible et versionnée, décrite ci-dessous. « Pas de base locale » dans le contexte doit signifier aucun serveur de base à administrer ; IndexedDB reste bien une base locale au navigateur. |
| **D3 — Sans backend** | **D’accord pour V1.** L’export manuel est une dépendance opérationnelle réelle de la tâche Outlook. Décrire qui lui remet le JSON et quand ; un fichier téléchargé sur le téléphone ne l’alimente pas automatiquement. CB-51 reste une décision ultérieure, sans installation ni configuration de service maintenant. |
| **D4 — Domaine pur** | **D’accord, avec correction du portage.** Le prototype sert de référence fonctionnelle, pas d’oracle. `applyRule` dépend d’un état global et diffère de la spec. Exiger des entrées/sorties explicites et une matrice de cas métier ; remplacer « couverture exhaustive » par ces invariants vérifiables. |
| **D5 — UUID, séries, vues dérivées** | **D’accord.** Préserver `lines`, `tops`, `notes`, `approx` et les informations legacy sans inventer de séries à partir du texte. Distinguer série prévue, saisie, validée et sautée. Les valeurs pré-remplies ne prouvent pas une réalisation. Définir aussi poids total de barre, poids par haltère, lest ajouté et PDC pour éviter les comparaisons incohérentes. |
| **D6 — Édition et cibles** | **Désaccord avec “écrase l’état des cibles à partir de là”.** Corriger une note du 22 juillet ne doit pas modifier la cible de septembre. Proposition soumise à Ugo : corriger/supprimer une séance ancienne modifie l’historique et ses statistiques, sans effet automatique sur les cibles ; ajuster les cibles reste une action explicite. Corriger la dernière séance pourrait offrir un recalcul seulement si un état antérieur fiable est conservé et qu’aucune modification ultérieure de cible ne l’invalide. Sinon garder l’ajustement manuel en V1. |
| **D7 — Europe/Zurich** | **D’accord.** Séparer date de séance (`YYYY-MM-DD`) et instant technique. Tester les sept jours, minuit, changement d’heure et téléphone dans un autre fuseau. Définir l’accueil après l’horaire prévu et après une séance terminée : proposition, garder la séance du jour tant qu’elle n’est pas terminée, puis montrer la prochaine, sans empêcher une autre séance manuelle. |
| **D8 — Tailwind et composants maison** | **D’accord.** Pas de nouvelle bibliothèque UI. Viser des zones tactiles de 44 px, des libellés accessibles, une indication du RPE autre que la couleur et un affichage stable avec clavier ouvert et safe area. Le prototype a des boutons de stepper de 30 × 34 px et suit le thème système : ne pas reprendre ces détails tels quels pour le sombre par défaut. |

## 2. Défauts concrets et contrat du moteur

**Désaccord — CB-30 doit attendre 12 séances, pas 11.** Le tableau JSON contient bien 12 entrées, du 22.07 au 10.09 inclus. Vérification par lecture JSON et comptage. Corriger cette mention dans la spec et le plan, conserver toutes les entrées, y compris les deux dates approximatives et les séances hors rotation.

**Désaccord — “Rejouer le seed doit redonner exactement les cibles” n’est pas un test valable.** Les cibles sont un état de départ déjà arbitré, l’historique est partiellement structuré et contient des décisions manuelles :

- Les tractions du 10.09 passent de +20 à +15 pour la prise large et la qualité d’exécution. Un reset mécanique de 7,5 % de 20 donne 17,5 après arrondi, jamais 15.
- Le bench volume du 08.09 est noté 60 × 8 × 3, mais la cible initiale reste 60. Un rejeu littéral des trois séries donnerait 62,5 ; `tops` seul ne décrit de toute façon pas les trois séries.
- Les reps des tractions du 03.09 sont inconnues. Cette absence ne prouve pas un échec.

Acceptation proposée : importer fidèlement les **12 séances et les cinq cibles fournies**, sans rejeu. Tester séparément des scénarios synthétiques dont les résultats sont connus. Le moteur commence à agir sur les nouvelles réalisations validées.

**Désaccord — `applyRule` ne doit pas être porté à l’identique.** Il compte RPE 8,5 comme échec (`>8`), traite des reps inconnues comme manquées, exige `poids réalisé >= cible` pour progresser alors que la spec ne le dit pas, et conserve la cible courante au premier échec même si le poids réalisé diffère. Exemple à arbitrer : cible 75, réalisation 72,5 × 3 → la spec invite à retenter 72,5 ; le prototype garde 75. Proposition : appliquer les règles au poids effectivement réalisé et ne jamais assimiler une valeur inconnue à un échec.

**Question pour Ugo — que signifie “2e échec au même poids” après un maintien ?** Proposition : retenir un échec en attente à ce poids, le conserver après RPE 8,5 ou RPE absent avec reps faites, l’effacer après succès/reset/ajustement manuel ; un échec à une autre charge remplace la charge suivie. Les données insuffisantes n’incrémentent pas ce compteur. Cette proposition doit être validée, car le prototype efface `fail` quand le RPE manque et les reps sont faites.

**Question pour Ugo — backoffs après changement du top set.** Proposition : recalculer les backoffs encore vierges à partir du poids de top set choisi ; préserver ceux déjà modifiés ou validés. Tractions : +7,5 fixe. Pour le bench volume, exiger trois séries validées à la cible avec au moins huit reps ; une série sautée ne déclenche pas de progression.

**D’accord avec CB-12, mais préciser les erreurs.** À 20 kg, afficher « barre seule » ; à 17,5 kg, indiquer que la barre de 20 kg ne permet pas cette charge. Une charge non réalisable avec les plaques listées ne doit pas produire une décomposition partielle présentée comme exacte. Aucun calcul de plaques de barre pour le lest des tractions ou les haltères.

## 3. Réponses proposées à Q1–Q4

| Question | Avis et réponse proposée à Ugo |
|---|---|
| **Q1 — RPE 8,5** | **D’accord** avec maintien sans nouvel échec si les reps sont faites. Si les reps sont manquées, c’est bien un échec. Faire valider aussi le traitement de l’échec en attente décrit plus haut. |
| **Q2 — Accessoires structurés** | **D’accord sur le principe ; question sur les charges.** Les six accessoires proposés ne couvrent pas les tractions PDC obligatoires de C : prévoir au moins leur saisie en reps. Les incréments d’haltères et de presse, la charge initiale de presse et les plafonds disponibles ne sont pas définis. Ne pas inventer une progression de +2,5 universelle. Ugo précise les pas disponibles ; une charge inconnue reste « à renseigner ». À défaut de ces précisions, toute progression automatique différée constitue une réduction explicite de la spec à faire accepter. |
| **Q3 — Chrono verrouillé** | **Désaccord** avec « notification locale » comme solution acquise et avec la garantie Android en arrière-plan. Proposition : stocker une échéance, recalculer le temps restant au retour, son/vibration lorsque disponibles au premier plan, maintien de l’écran allumé facultatif. Aucune promesse d’alarme ponctuelle écran verrouillé. Ugo confirme que ce compromis convient et indique son téléphone/navigateur. |
| **Q4 — Mode pressé** | **D’accord** pour replier et désactiver les exercices après les deux premiers, avec possibilité de les réactiver. Ne jamais effacer leurs séries déjà saisies. Attention : en C, le DI haltères est bien l’exercice 2, alors que le prototype le range dans `acc`. Il doit rester visible et saisissable en mode pressé. |

Les timers peuvent être ralentis en arrière-plan et le Wake Lock ne maintient que les documents actifs visibles : [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). Ces limites justifient une recette sur le téléphone réel ; elles ne permettent pas de garantir une notification au moment exact où le navigateur suspend l’application.

## 4. Persistance, export et risques oubliés

**Désaccord — attendre M3 pour découvrir le contrat de sauvegarde.** CB-10 doit définir avec nous les interfaces de brouillon, validation de série, finalisation, édition et export. CB-30 vient immédiatement après. Garder un brouillon persistant, incluant les séries validées, les notes, le type et l’échéance du chrono. Rechargement, fermeture puis réouverture et changement A/B/C ne doivent pas perdre la saisie. La validation démarre le chrono ; la finalisation applique la progression une seule fois.

**D’accord avec l’enregistrement local, sous réserve d’atomicité et d’idempotence.** Finaliser dans une transaction séance + cibles + fermeture du brouillon. Un double tap, une relance après erreur ou deux onglets ne doivent ni créer deux séances ni augmenter deux fois une charge. Utiliser l’UUID du brouillon et une vérification transactionnelle de son état ; détecter aussi un brouillon fondé sur des cibles devenues obsolètes. En cas d’échec de stockage, ne pas afficher « enregistré » et préserver la saisie. L’initialisation du seed doit être atomique et marquée comme terminée ; une base volontairement vidée ne doit pas réimporter le seed au prochain lancement.

**Question pour Ugo — valider D2/D5 comme format compatible enrichi.** Proposition : garder les clés `targets` et `seances` et tous les champs legacy ; ajouter `schemaVersion` et les champs structurés nécessaires. Importer le seed non versionné comme format historique. Refuser une version future non prise en charge avant toute écriture. Préserver `approx`, les notes de cible, les valeurs nulles et `fail`. Ne pas transformer les `lines` historiques en séries supposées complètes. Fournir un exemple d’export enrichi pour vérifier que Claude peut encore en extraire les prochaines cibles avant de figer CB-10.

**Désaccord — “export puis import = état identique” est trop vague.** Définir l’égalité des séances et cibles, y compris identifiants et états d’échec ; préciser séparément le sort des préférences et brouillons. Proposition : export finalisé au format convenu, sauvegarde locale indépendante du brouillon, blocage d’un import de remplacement tant qu’un brouillon est actif. Valider intégralement l’import, afficher le nombre de séances et les cibles remplacées, proposer d’exporter l’existant, puis remplacer atomiquement. Aucun mélange partiel en cas d’erreur. Tester aussi un JSON invalide et le seed historique. Le téléchargement reste disponible si la copie échoue.

**Désaccord — l’offline complet ne doit pas arriver seulement à J5–J7.** Ajouter le service worker minimal tôt, embarquer seed et ressources indispensables, remplacer ou embarquer les polices distantes du prototype. Vérifier après un premier chargement connecté : arrêt/réouverture de la PWA en mode avion, saisie, finalisation et export. Ne pas recharger automatiquement une séance active à l’arrivée d’une mise à jour ; sauvegarder avant activation. Tester la conservation des données lors d’une mise à jour et d’une migration de schéma.

**D’accord sur l’absence de backend ; risque de récupération à couvrir.** Une sauvegarde dans le navigateur ne remplace pas un export récupérable. Une nouvelle origine Vercel peut présenter un autre stockage : adopter une URL de production stable, utiliser des données d’essai en preview et vérifier sur cette URL la reprise après fermeture. Prévoir un rappel discret d’export après séance. Le parcours manuel vers Claude/Outlook doit être écrit et essayé ; aucune intégration automatique n’est livrée par CB-40.

## 5. Découpage et calendrier proposés

**Désaccord — M0 “une PR” contredit trois tickets et “un ticket = une PR”.** Garder CB-01 pour le socle et son contre-examen ; CB-02 pour la configuration/documentation Vercel ; CB-03 pour la configuration/documentation Linear. Les opérations externes sont tracées dans leurs tickets, les fichiers correspondants dans leurs PR. Prévoir explicitement le commit initial minimal permettant d’ouvrir la première PR, sans en faire un contournement pour intégrer tout le socle directement sur `main`.

**D’accord avec la répartition principale, désaccord avec “le reste au premier qui ouvre”.** Claude garde domaine, adaptateurs DB et historique ; Codex garde séance, chrono, PWA et interface d’export. Pour CB-31, Claude implémente le service de finalisation ; Codex raccorde l’écran dans sa PR. Pour CB-40, Claude possède l’import transactionnel dans `src/db/`, Codex l’interface et le téléchargement. Réserver explicitement `App`, les styles globaux, les fichiers de configuration, le manifeste de dépendances et le lockfile ; un seul propriétaire actif par fichier. Utiliser des worktrees distincts.

**Désaccord — la parallélisation M3 ∥ M4 masque les dépendances.** L’export dépend du contrat DB ; l’E2E dépend de la finalisation ; l’écran dépend du modèle d’accessoires. Proposition de séquence, avec des critères de sortie plutôt qu’une promesse de durée :

1. **12–13.09 :** arbitrages, M0 puis CB-10 avec contrats de persistance/export, et premier squelette installable CB-41.
2. **13–15.09 :** Claude CB-11/12 et CB-30 ; Codex CB-20/21/22 sur les contrats stabilisés. Chaque PR attend sa contre-revue, ce temps fait partie du calendrier.
3. **15–16.09 :** CB-31 + CB-23 : tranche complète séance C, dont DI, brouillon repris après fermeture, finalisation et cibles. Export/import CB-40 prioritaire ; historique minimal lisible en parallèle.
4. **17–18.09 :** E2E CB-42, parcours manuel sur téléphone réel et URL de prod, mode avion, mise à jour avec données existantes, import/export et ajustement manuel des cibles.
5. **19.09 :** marge de correction et nouvelle recette ciblée ; pas de changement de schéma de dernière minute sans nécessité.
6. **20.09 à 16 h Zurich :** utilisation réelle de C, puis export et retours CB-50.

**Question pour Ugo — périmètre reportable si le délai se tend.** Reporter CB-13/e1RM (explicitement optionnel), les graphiques et les finitions. Conserver avant la séance réelle sauvegarde du brouillon, export, cibles fiables, mode pressé et ajustement manuel. Reporter l’édition détaillée de l’ancien historique ou la double progression des accessoires demande son accord explicite : ces fonctions font partie de la spec. La suppression est un ajout du plan, moins prioritaire que la correction demandée.

**Désaccord — CB-41 “Lighthouse PWA installable” est obsolète comme porte.** Les audits PWA Lighthouse sont dépréciés : [documentation Chrome](https://developer.chrome.com/docs/lighthouse/pwa/offline-start-url). Remplacer par installation réelle, lancement autonome, manifeste/icônes corrects, fonctionnement offline et mise à jour sans perte. Playwright vérifie le parcours applicatif ; il ne remplace pas le test du verrouillage écran et de l’installation sur le téléphone d’Ugo.

## 6. Collaboration et veille

**D’accord** avec les marqueurs, réservations, contre-revue sur SHA complet, CI verte, branche à jour, squash et fusion par l’auteur. Après toute nouvelle tête, obtenir une contre-revue sur cette tête, y compris après intégration de `main`. Les contrôles portent sur la tête effectivement fusionnée. Publier le SHA fusionné et vérifier l’URL de production servie, sans redemander une autorisation de déploiement déjà donnée. Les restrictions du portail paie ne se transposent pas à ce projet.

**Désaccord avec une éventuelle exigence d’approbation GitHub native sous le compte partagé.** GitHub interdit à l’auteur d’approuver sa propre PR : [documentation GitHub](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews). Prévoir une revue de type commentaire signée `<!-- codex -->` ou `<!-- claude -->`, avec verdict explicite, SHA complet et P1/P2/P3 ; ne pas configurer une approbation native obligatoire impossible à satisfaire avec ce compte. Cette convention identifie l’agent par son texte, pas par une identité GitHub indépendante. Zéro P0/P1 ouvert ; les P2 acceptés restent tracés et ne peuvent contredire un critère de livraison.

**D’accord sur la liste fermée de dépendances, avec correction de rédaction.** Elle doit inclure Vite, TypeScript et les plugins/adaptateurs directs nécessaires au socle effectivement retenu. Cela ne doit pas autoriser des bibliothèques supplémentaires implicitement : Claude publie la liste directe complète de M0 pour arbitrage, puis lockfile et `npm ci` en CI.

**D’accord sur la veille ; désaccord avec la copie telle quelle du modèle.** Le script fourni observe le portail et recherche principalement `<!-- codex -->` : il correspond à la veille de Claude, malgré son nom. Pour Codex, il faut `Ugo-finance/carnet-de-barre`, le marqueur `<!-- claude -->` et un fichier d’état propre. Inclure PR, commentaires de conversation, commentaires de diff et revues ; paginer les réponses, détecter les mises à jour (`updated_at`) et les changements de SHA, afficher les erreurs API, et conserver un curseur entre redémarrages. Ne pas ignorer au démarrage les PR ouvertes qui attendent déjà une revue.

**État réel de la veille au terme de cette revue : non armée.** Le dépôt est annoncé inexistant ; la vérification en lecture `gh repo view Ugo-finance/carnet-de-barre` a en outre échoué sur la connexion à `api.github.com`, ce qui ne prouve pas son absence. Aucun processus de surveillance effectif n’est prétendu actif, aucun service n’a été créé. À M0, dès le dépôt accessible, adapter et lancer la veille, vérifier une lecture réussie et consigner PID, journal et fichier d’état ; l’arrêter à la fin du lot. Le script partagé du portail reste intact.

## 7. Arbitrages demandés avant M0

**Questions pour Ugo**, avec recommandations ci-dessus : valider les réponses Q1–Q4 ; approuver D6 sans effet automatique d’une correction ancienne sur les cibles ; accepter le format enrichi compatible D2/D5 ; préciser les échecs en attente, charges hors cible et incréments d’accessoires ; confirmer téléphone/navigateur et compromis du chrono ; accepter le calendrier et les éventuels reports. Le nombre réel de séances et les limites du rejeu sont des constats à corriger, pas des préférences produit.

## 8. Ce que je propose de prendre en charge

- **CB-20 à CB-23 :** écran de séance, saisie et validation par série, reprise du brouillon via les services de Claude, chrono à échéance persistée, mode pressé correct pour C, notes et récapitulatif.
- **CB-41 dès le début :** PWA minimale puis mise à jour maîtrisée, ressources offline et parcours d’installation.
- **CB-40 :** interface export/import, téléchargement et copie, en m’appuyant sur le contrat et les transactions DB de Claude.
- **CB-42 :** tests du parcours complet et protocole de recette sur le téléphone réel, avec priorité aux pertes de données et doubles progressions.
- **Contre-revues de M0 et des lots Claude :** contrats, écarts prototype/spec, matrice du moteur, migrations, atomicité et édition ; revue publiée sur chaque SHA exact.
- **Veille Codex du futur dépôt :** adaptation, lancement et vérification dès que M0 l’a rendu accessible.
