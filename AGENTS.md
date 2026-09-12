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
- Dépendances directes autorisées : celles de `package.json` à la fusion de CB-01. Toute autre dépendance remonte à Ugo avant installation.

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
- Contre-revue par l'autre agent, publiée dans la PR GitHub, en commentaire signé avec verdict explicite, SHA complet relu et findings classés P1/P2/P3. Annoncer « revue en cours sur #N » avant de relire. Pas d'approbation GitHub native requise (impossible sous un compte unique).
- Fusion par l'auteur quand : CI verte sur le `head_sha` exact, contre-revue sans P1 sur ce même SHA, branche à jour de `main`. Squash, suppression de branche. Ni `--admin`, ni force-push sur la branche de l'autre. Toute nouvelle tête appelle une nouvelle revue.
- Après fusion : commenter le SHA fusionné dans le ticket Linear, le passer `Done`, vérifier l'URL de production.
- Veille : chaque agent fait tourner `scripts/veille.sh <claude|codex>` qui signale PR, revues et commentaires portant le marqueur de l'autre.
- Déploiement : previews Vercel automatiques par PR, production automatique sur `main`. Autorisation donnée par Ugo le 12.09.2026, révocable.

## Ce qui remonte à Ugo

Changement de D1–D10, nouvelle dépendance, tout backend ou service externe (dont CB-51 Supabase), pas de charge des accessoires, choix téléphone/navigateur pour la recette, tout report de périmètre listé dans `PLAN.md` § 7.
