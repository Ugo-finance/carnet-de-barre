# Carnet de barre — règles pour agents

PWA mobile de carnet de musculation pour un seul utilisateur (Ugo), offline-first, site statique sur Vercel. Aucune donnée sensible, aucun backend, aucun compte.

## Sources de vérité, dans cet ordre

1. `handoff/carnet-de-barre-handoff/SPEC.md` — produit.
2. `PLAN.md` § 2, § 7 et § 8 — décisions D1–D10 et arbitrages. Elles ne se rouvrent pas dans une PR : ticket « Décision requise » et attente d'Ugo.
3. `docs/refonte/` — refonte UX et échauffement, dossier validé par Ugo le 13.09.2026.
   `docs/refonte/00-contrat.md` fige les paliers et les arbitrages ; il prime sur les autres
   pièces du dossier, et la maquette n'est qu'une référence de rendu.
4. `REVUE-CODEX.md` — motifs des arbitrages.
5. Le prototype `handoff/.../prototype/carnet-de-barre.html` est une **référence fonctionnelle, pas un oracle** : son moteur diffère de la spec et n'est pas porté à l'identique.

## Règles dures

- Domaine pur dans `src/domain/` : aucun import React ni DOM, fonctions à entrées/sorties explicites, testé par Vitest sur des scénarios synthétiques à résultat connu. Le seed n'est jamais rejoué comme test.
- Une valeur inconnue (RPE ou reps absents) n'est jamais assimilée à un échec.
- Toute écriture IndexedDB passe par `src/db/`. Finalisation d'une séance = une transaction séance + cibles + fermeture du brouillon, idempotente. Le brouillon est écrit au fil de la saisie.
- Corriger ou supprimer une séance passée ne modifie jamais les cibles. Ajuster une cible est une action explicite.
- Format d'export : clés `targets` et `seances`, champs legacy conservés, `schemaVersion` obligatoire, évolutions additives. Le seed non versionné est le format historique importable.
- Jamais de rechargement automatique du service worker pendant une séance active.
- Dates de séance en `YYYY-MM-DD`, rotation calculée en Europe/Zurich, affichage `jj.mm.aaaa`. UI en français, nombres avec virgule décimale.
- Zones tactiles ≥ 44 px, RPE indiqué autrement que par la seule couleur, safe area et clavier gérés.
- Dépendances directes autorisées, liste close (P2 de la contre-revue de #1 : la règle ne doit pas s'élargir toute seule quand `package.json` change) :
  - exécution : `react`, `react-dom`, `dexie`, `zod` ;
  - build : `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@tailwindcss/vite`, `vite-plugin-pwa` ;
  - tests et qualité : `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fake-indexeddb`, `@playwright/test`, `oxlint`, `prettier` ;
  - types : `@types/node`, `@types/react`, `@types/react-dom`.
  Toute autre dépendance, y compris de test, remonte à Ugo avant installation.

## Commandes

```text
npm run dev            serveur de développement
npm run check          lint + format + typecheck + tests + build (ce que la CI exécute)
npm run test:watch     Vitest en continu
npm run format         Prettier
npm run test:sql       garanties du schéma distant (exige Docker et `npx supabase start`)
npm run ports          les ports de cette copie du dépôt
```

## Cloisonnement des projets — règle dure

Sur la machine d'Ugo tournent au moins **trois** choses qui se ressemblent :

1. ce dépôt ;
2. **le worktree de l'autre agent**, même projet et donc **même configuration** ;
3. **Portail Paie**, son autre projet, avec sa propre pile Supabase.

**Ne jamais lancer `fuser -k <port>/tcp`, ni `pkill`, ni `kill` sur un pid qu'on n'a pas
attribué.** Le port `4173` est le défaut de `vite preview` : c'est celui de *toutes* les
copies du projet. Le libérer de force interrompt la suite de tests de l'autre agent, et
l'échec ressemble alors à un test instable — personne ne cherche un conflit.

À la place :

- **les ports se dérivent du chemin de la copie** (`scripts/ports.mjs`). Deux worktrees
  sont à des chemins différents, donc sur des ports différents, sans coordination ;
- **`scripts/liberer-port.sh <port>`** ne tue qu'un processus dont il a *vérifié* qu'il
  vient de cette copie. Un port occupé par un propriétaire non identifiable — un
  conteneur Docker, par exemple — est **intouchable**, et le script refuse au lieu de
  prétendre que le port est libre ;
- **`strictPort`** est activé : Vite échoue bruyamment plutôt que de glisser sur le port
  voisin, qui pourrait appartenir à quelqu'un d'autre.

**Une seule copie à la fois fait tourner la pile Supabase locale.** Les conteneurs sont
nommés d'après `project_id`, identique dans les deux worktrees : deux `supabase start`
ne créent pas deux piles, ils se disputent la même. Avant d'en lancer une, vérifier
`docker ps`, et l'arrêter avec `npx supabase stop` en partant.

## Propriété des fichiers

| Propriétaire | Dossiers |
|---|---|
| Claude | `src/domain/`, `src/db/`, `src/features/history/` |
| Codex | `src/features/session/`, `src/components/`, `src/pwa/`, `src/features/export/` (interface) |
| Réservation explicite dans le ticket, un seul propriétaire actif | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html`, `vite.config.ts`, `package.json`, lockfile, `.github/` |

## Workflow

- Un ticket Linear = une branche = une PR. Branches `claude/cb-NN-sujet` ou `codex/cb-NN-sujet`, fondées sur `main` à jour, dans un worktree distinct. Passer le ticket `In Progress` en commençant, y déclarer les fichiers réservés.
- Les deux agents publient sous le compte GitHub `Ugo-finance`. **Chaque commentaire et chaque revue se termine par `<!-- claude -->` ou `<!-- codex -->`.** C'est le seul discriminant.
- **Même règle dans Linear**, et pour la même raison : nos commentaires y sortent aussi sous le nom d'Ugo. Un commentaire Linear **non marqué** est le seul qui vienne de lui. Ne jamais citer un commentaire marqué comme un arbitrage d'Ugo : ce serait se citer soi-même, ou citer l'autre agent, en croyant citer l'utilisateur.
- Contre-revue par l'autre agent, publiée dans la PR GitHub, en commentaire signé avec verdict explicite, SHA complet relu et findings classés P1/P2/P3. Annoncer « revue en cours sur #N » avant de relire. Pas d'approbation GitHub native requise (impossible sous un compte unique).
- Porte de contrôle : le job GitHub Actions `check` et le build Vercel exécutent `npm run check` ; le job GitHub Actions `e2e` exécute en plus les parcours Playwright. Ces trois contrôles doivent être verts sur le SHA de tête.
- Fusion par l'auteur quand : contrôles GitHub `check`/`e2e` et Vercel verts sur le `head_sha` exact, contre-revue sans P1 sur ce même SHA, branche à jour de `main`. Squash, suppression de branche. Ni `--admin`, ni force-push sur la branche de l'autre. Toute nouvelle tête appelle une nouvelle revue.
- Après fusion : commenter le SHA fusionné dans le ticket Linear, le passer `Done`, vérifier l'URL de production.
- Veille : chaque agent fait tourner `scripts/veille.sh <claude|codex>` qui signale PR, revues et commentaires portant le marqueur de l'autre.
- Déploiement : previews Vercel automatiques par PR, production automatique sur `main`. Autorisation donnée par Ugo le 12.09.2026, révocable.

## Leçons du 12.09.2026, payées comptant

Écrites le soir de la première séance réelle, après les avoir toutes coûtées au moins une fois. Elles ne remplacent rien au-dessus : elles disent où l'on s'est trompé malgré les règles.

- **L'urgence n'est pas une dispense de contre-revue — c'est le moment où elle rapporte le plus.** #17 a été fusionnée sans revue « parce qu'Ugo partait s'entraîner ». Elle contenait un P1 qui lui aurait coûté sa séance entière : l'ajustement d'une cible devenu accessible pendant un brouillon, donc une finalisation refusée sans issue. Une PR fusionnée sans verdict se fait relire **après coup**, tout de suite, et le correctif passe avant le reste.
- **Un invariant qui ne vit que dans l'interface n'existe pas.** Deux fois le même défaut le même jour : `importReplace` puis `adjustTarget` contrôlaient hors transaction. L'écran peut lire un état vieux d'une fraction de seconde, et une seconde fenêtre ne passe pas par l'écran du tout. Le contrôle va au point d'écriture, dans la même transaction ; le garde d'écran **explique**, il ne protège pas.
- **Un écran utilisateur se livre avec son point d'entrée, dans le même lot.** `ExportPanel` et `TargetsPanel` ont été construits, testés, revus et fusionnés — et inatteignables, faute d'onglet. La règle ne vise que les écrans : un lot de contrat ou de persistance se livre volontairement avant son interface (#21), à condition d'annoncer le lot qui l'utilisera.
- **Nos suites par composant sont aveugles aux défauts d'assemblage, par construction.** Chaque pièce prouvée correcte ne prouve rien sur leur branchement. D'où `src/App.test.tsx`, qui part du point d'entrée réel, et `src/db/seance-reelle.dexie.test.ts`, qui rejoue un parcours entier sur une vraie base. Tout nouvel écran s'ajoute au premier.
- **Un test de régression se vérifie dans les deux sens.** Quand un test est écrit pour fermer un défaut précis, retirer le correctif et vérifier qu'il passe au rouge avant d'annoncer quoi que ce soit. Deux fois dans la journée, un test écrit de bonne foi ne couvrait pas le défaut visé. La règle ne s'applique pas aux vérifications ordinaires, qui n'ont pas de correctif à retirer.
- **Une assertion et un garde de type se ressemblent et ne font pas le même travail.** `if (x !== 'attendu') return` fait **réussir** le test en silence sur la régression qu'il devait attraper. Garder l'assertion, ajouter le garde ensuite pour TypeScript seulement.
- **Ne jamais enchaîner une publication derrière un filtre sur la sortie des tests.** `npm run check | grep … && git push` pousse une branche rouge : c'est le `grep` qui réussit. Mesurer le code de sortie.
- **Un renommage se relit ligne à ligne, pas au `grep`.** Renommer `UpcomingSession.date` a failli renommer aussi la `date` d'une `Seance`, qui n'a rien d'ambigu.
- **`scripts/veille.sh` journalise, il ne réveille personne.** Aucun mécanisme ne relance un tour d'agent une fois le tour terminé : le script a fidèlement écrit son journal pendant que plus personne ne le lisait, et deux verdicts sont restés sans réponse. Le protocole exécutable :
  - tant qu'une réponse connue est attendue (revue demandée, correctif annoncé), **garder le tour ouvert** et sonder le journal plutôt que de conclure ;
  - **au début de chaque tour**, relire le journal *et* l'état GitHub avant toute autre chose — le journal seul peut avoir un trou ;
  - vérifier la **fraîcheur** du journal, pas seulement la présence du processus ;
  - ne jamais présenter un processus vivant comme une garantie de réponse autonome après la fin d'un tour.
- **Une défense devenue difficile à atteindre reste une défense.** `stale-targets` n'est plus atteignable par le chemin normal depuis que `adjustTarget` refuse pendant un brouillon. On la garde, et on l'éprouve par un mutateur réservé aux tests, plutôt que de la supprimer en la croyant morte.

## Leçons du 13.09.2026

- **L'état GitHub fait autorité ; nos veilles sont un confort.** Avant de déclarer qu'on attend l'autre, vérifier sur GitHub que la demande a bien été reçue et qu'aucune réponse n'est déjà publiée. Un retour publié la veille au soir est resté « attendu » toute une matinée, les deux veilles étant mortes sans que personne le sache.
- **Une robustesse à la panne s'éprouve sur une panne intermittente, jamais uniforme.** Le faux `gh` qui a servi à valider CB-06 échouait *toujours* : toutes les branches tombaient, donc toutes alarmaient, et une branche sans alarme était invisible **par construction**. Le tableau chiffré produit était exact et la preuve était creuse — la forme exacte d'une vérification qui ne vérifie rien. La panne réelle, celle du matin même, était intermittente. Le scénario minimal : réussir, échouer, réussir.
- **Démontrer qu'une règle produit est fausse n'autorise pas à la réécrire.** Le dossier validé disait « sous 60 kg de cible barre, le palier ~87 % saute ». C'est arithmétiquement faux — à 57,5 kg, 87 % arrondit à 50, qui reste sous la charge de travail — et la phrase a d'abord été corrigée dans la PR, au motif qu'aucune cible actuelle n'était concernée. « C'est théorique », « ça ne change rien aujourd'hui », « les deux lectures se valent » sont des commodités, pas des mandats : **la démonstration établit qu'il faut un arbitrage, jamais lequel**. La contre-revue a maintenu son P1 deux tours jusqu'à ce qu'Ugo soit consulté, et elle avait raison.
- **Un arbitrage d'Ugo ne s'écrit jamais à sa place.** Un commentaire non marqué est le seul qui vienne de lui. Quand il tranche en conversation, le relayer sous son propre marqueur, en citant la question posée et la réponse reçue, et dire que c'est un relais.
- **Un test se vérifie sur l'exercice où le défaut est possible, pas sur celui auquel on pense.** Le test qui devait prouver l'exclusion des paliers d'échauffement était monté sur le squat, dont le top set est désigné par son rôle : il restait vert l'exclusion retirée. Il a fallu le porter sur le développé volume, où c'est la **plus légère** des séries validées qui fait foi, pour qu'il morde. Quatre assertions creuses le même jour, dont une qui vérifiait l'unicité des identifiants de série sur `seanceSchema` alors qu'elle vit dans le `superRefine` du **fichier** : elle passait au vert avec deux séries homonymes. Chacune a été trouvée en cassant, aucune en relisant.
- **Ne jamais fonder une PR sur la branche d'une autre PR.** À la fusion du lot de base, GitHub supprime la branche, **ferme** la PR empilée et refuse de la rouvrir : il faut en créer une neuve, et la demande de contre-revue déjà adressée meurt avec l'ancienne. Fonder sur `main` et attendre la fusion du lot précédent. Corollaire : une fusion par squash réécrit l'histoire de la branche, donc rebaser une branche dérivée rejoue des commits déjà présents — repartir de `main` et rejouer le seul diff du lot, puis vérifier par `git diff origin/main --stat` que le contenu est identique.

## Leçons du 14.09.2026

Six P1 de Codex vers Claude, puis un de Claude vers Codex sur #56. **Tous avaient le même point commun : aucun test ne traversait le chemin fautif, ou l'assertion restait verte sans exercer son sujet.**

Le code, lui, était bel et bien faux : un avancement affiché 0/16 au lieu de 7/23, un mode pressé perdu à la reprise, un choix d'accueil qui n'atteignait pas le magasin. La faiblesse des tests explique pourquoi ces défauts ont vécu ; elle ne les transforme pas en code juste. C'est la distinction que la première rédaction de ces leçons effaçait, et c'est une contre-revue qui l'a rétablie.

- **Une assertion « aucun élément mauvais » doit prouver qu'elle avait des éléments à vérifier.** Le garde de CB-43 balaye les champs de charge de la page et exige qu'aucun ne déborde. Quand l'accueil de CB-63 a mis un écran devant l'éditeur, il a trouvé **zéro champ** — et il est resté vert, en ne protégeant plus rien. Il protégeait la troncature qu'Ugo avait trouvée lui-même en salle.

  La frontière n'est pas « tout `toEqual([])` se double d'un compte » : un ensemble vide est parfois le cas valide, et réellement exercé. Le garde s'impose quand **la disparition du sujet ferait réussir le test sans exercer le comportement annoncé**. Il se vérifie alors comme tout le reste : faire disparaître le sujet, et constater le rouge.
- **Un test peut encoder le contraire du contrat et rester vert pour cette raison même.** `resumeAccueil` comptait l'avancement sur les seules séries de travail ; le contrat dit « sur la file active », paliers compris. Ugo validait ses sept paliers et lisait 0/16. Le test affirmait 0/16. Quand un contrat écrit existe, **le test se relit contre le contrat**, pas contre l'implémentation qu'on vient d'écrire.
- **Une API qui se compose en deux appels crée une fenêtre entre les deux.** Le démarrage proposé était `openDraft()` puis `saveDraft(startDraft(copie))`. Un ajustement de cible intercalé reconstruisait le brouillon stocké, et la réécriture de la copie y remettait les anciennes `baseTargets` : la séance démarrait condamnée à `stale-targets`, ce qui ne se découvre qu'à la finalisation, après le travail. Un geste utilisateur qui forme une seule intention se livre comme **une seule intention de magasin**, et l'objet canonique ne vient jamais de l'appelant. Même leçon que « un invariant qui ne vit que dans l'interface n'existe pas », déplacée d'un cran.
- **Un correctif se cherche à toutes les portes de sa condition.** Le mode pressé choisi sur l'accueil a été appliqué à la construction neuve, puis oublié sur la branche « brouillon vierge réutilisé » de la même fonction. Après avoir corrigé un chemin, relire **le prédicat** qui y mène et vérifier chaque issue.
- **Une mutation qui survit dit soit que le test est creux, soit que la mutation ne touche aucun chemin testé.** Les deux sont des informations, et elles se distinguent en regardant si un test passe par le code muté. Sur CB-62, trois mutations ont survécu : une parce que ma justification écrite était fausse — l'ordre que je croyais critique était indifférent —, deux parce qu'aucun scénario n'atteignait le code. Corriger le commentaire dans le premier cas, ajouter le scénario dans les deux autres. **Ne jamais conclure d'une survivante que le code est bon.**
- **Un test qui dépend du jour se fige sur le jour qui casse, pas sur celui qui passe.** `App.test.tsx` montait l'app sur l'horloge réelle ; l'app propose une séance différente selon le jour ; le test cherchait « Squat » dans le document entier. Écrit un dimanche — séance C, pas de squat — il est tombé le lundi suivant sur une CI verte la veille. La preuve tient en deux mutations : même requête cassée, **dimanche figé → vert, mardi figé → rouge**.
- **Un `check` arrêté en chemin ne ressemble pas à un échec.** Un `format:check` rouge coupe la chaîne avant les tests : la sortie ne contient alors aucune ligne de test, et lue au travers d'un filtre elle ressemble à un silence tranquille. La porte reste celle déjà écrite plus haut — **le code de sortie de `npm run check`**, jamais un motif cherché dans sa sortie. Le compte de tests sert seulement à diagnostiquer *où* la chaîne s'est arrêtée, après coup.

## Ce qui remonte à Ugo

Changement de D1–D10, nouvelle dépendance, tout backend ou service externe (dont CB-51 Supabase), pas de charge des accessoires, choix téléphone/navigateur pour la recette, tout report de périmètre listé dans `PLAN.md` § 7.
