# Prompt Codex — lancement M0/M2 — 12.09.2026

Ta revue (`REVUE-CODEX.md`) a été retenue quasi intégralement : les arbitrages sont consignés dans `PLAN.md` § 7, et `AGENTS.md` en fait les règles du dépôt. Ugo a demandé d'avancer ; ce qui reste à trancher est listé dans le ticket Linear UGO-179 (CB-00) et ne bloque pas M0 ni le démarrage de M2.

## État vivant à recontrôler avant d'agir

- Dépôt : `git@github.com:Ugo-finance/carnet-de-barre.git`, cloné ou à cloner dans un worktree distinct de `/home/ugo-bellumore/dev/gym-chad` (qui est mon worktree).
- `main` : commit initial minimal (plan, revue, handoff).
- PR #1 `claude/cb-01-socle` ouverte : socle Vite + React + TS, PWA, Vitest, oxlint, Prettier, CI, `AGENTS.md`, `scripts/veille.sh`, `vercel.json`. **Contre-revue demandée à toi, en priorité.**
- GitHub Actions est bloqué par la facturation du compte (« recent account payments have failed »). Porte provisoire : le build Vercel exécute `npm run check` ; un déploiement de preview réussi sur le SHA de tête vaut CI verte. C'est écrit dans `AGENTS.md`.
- Linear : projet « Carnet de barre — PWA », tickets UGO-158 (CB-01) à UGO-179 (CB-00). Tes tickets : UGO-165 CB-20, UGO-166 CB-21, UGO-167 CB-22, UGO-168 CB-23, UGO-173 CB-40 (interface), UGO-174 CB-41, UGO-175 CB-42.

## Tes trois actions, dans l'ordre

1. **Contre-revue de la PR #1** sur le SHA de tête exact : annonce « revue en cours sur #1 » puis publie un commentaire signé `<!-- codex -->` avec verdict, SHA complet et findings P1/P2/P3. Regarde en particulier : liste des dépendances (liste fermée d'`AGENTS.md`), configuration PWA (`registerType: 'prompt'`, `navigateFallback`), `vercel.json`, cohérence d'`AGENTS.md` avec ta revue, `scripts/veille.sh`. Je fusionne dès zéro P1, puis j'enchaîne CB-10.
2. **Arme ta veille** : `scripts/veille.sh codex` depuis le dépôt (fichier d'état dans `~/.local/state/carnet-de-barre/`). Consigne PID et journal dans le ticket UGO-160.
3. **Démarre CB-20 (UGO-165)** dès que CB-10 (UGO-161, contrats et types) est fusionné, sur `codex/cb-20-accueil` fondée sur `main` à jour. En attendant CB-10, tu peux préparer les composants sans dépendance aux types (stepper, chips RPE, carte, chrono à échéance) dans `src/components/`, sur une branche `codex/cb-21-composants`, à condition de ne pas toucher `App.tsx` avant réservation.

## Rappels

- Tout commentaire et toute revue GitHub se termine par `<!-- codex -->`.
- Fichiers réservés déclarés dans le ticket avant de commencer ; `App.tsx`, `main.tsx`, `index.css`, `vite.config.ts`, `package.json`, lockfile et `.github/` ne se touchent qu'après réservation explicite.
- Aucune dépendance hors de la liste d'`AGENTS.md` sans accord d'Ugo (y compris pour Playwright : déjà dans la liste ; `fake-indexeddb` est en attente dans UGO-179).
- Ce qui remonte à Ugo est dans UGO-179 ; ne tranche pas à sa place.
