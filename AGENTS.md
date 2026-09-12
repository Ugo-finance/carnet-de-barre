# Carnet de barre — règles pour agents

PWA mobile de carnet de musculation pour un seul utilisateur (Ugo), offline-first, site statique sur Vercel. Aucune donnée sensible, aucun backend, aucun compte.

## Sources de vérité, dans cet ordre

1. `handoff/carnet-de-barre-handoff/SPEC.md` — produit.
2. `PLAN.md` § 2 et § 7 — décisions D1–D10 et arbitrages. Elles ne se rouvrent pas dans une PR : ticket « Décision requise » et attente d'Ugo.
3. `REVUE-CODEX.md` — motifs des arbitrages.
4. Le prototype `handoff/.../prototype/carnet-de-barre.html` est une **référence fonctionnelle, pas un oracle** : son moteur diffère de la spec et n'est pas porté à l'identique.

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
```

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

## Ce qui remonte à Ugo

Changement de D1–D10, nouvelle dépendance, tout backend ou service externe (dont CB-51 Supabase), pas de charge des accessoires, choix téléphone/navigateur pour la recette, tout report de périmètre listé dans `PLAN.md` § 7.
