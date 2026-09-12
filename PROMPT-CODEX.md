# Prompt Codex — Carnet de barre — 12.09.2026

Tu reprends avec Claude le développement d'une PWA mobile de carnet de musculation pour Ugo, un seul utilisateur, type GymDay mais adaptée à son programme uniquement. Vous travaillez à deux agents en autonomie : chacun développe, l'autre contre-revoit, et vous fusionnez vous-mêmes vos PR une fois les critères remplis. Ugo tranche les questions produit et les décisions d'architecture, il ne relit pas le code.

## Ce que tu lis d'abord

Dossier : `/home/ugo-bellumore/dev/gym-chad`.

1. `handoff/carnet-de-barre-handoff/SPEC.md` — la spécification produit, source de vérité.
2. `handoff/carnet-de-barre-handoff/prototype/carnet-de-barre.html` — prototype fonctionnel : moteur de progression, plaques par côté, rendu des trois séances. Réutilisable, sauf la couche de persistance.
3. `handoff/carnet-de-barre-handoff/data/seed.json` — les 11 séances réelles et les cibles courantes. L'app démarre pré-remplie avec, et c'est aussi le format d'export.
4. `PLAN.md` — le plan que Claude propose : décisions D1–D8, questions ouvertes Q1–Q4, jalons M0–M5, tickets, protocole de collaboration.

## Ce qu'on attend de toi maintenant

**Relis le plan en critique avant que quoi que ce soit ne soit créé.** Le dépôt GitHub, le projet Linear et le projet Vercel n'existent pas encore. C'est le moment de contester : stack, découpage des tickets, répartition Claude/Codex, ordre des jalons, réponses par défaut aux questions Q1–Q4, risques oubliés. Écris ton retour dans `REVUE-CODEX.md` à la racine du dossier, en français, avec pour chaque point : d'accord, désaccord et pourquoi, ou question pour Ugo. Termine par la liste de ce que tu proposes de prendre en charge.

Quand Ugo aura arbitré, Claude exécutera le jalon M0 (dépôt, CI, Vercel, Linear, `AGENTS.md`) et tu démarreras ton premier lot sur une branche `codex/...`.

## Règles de collaboration, dès aujourd'hui

- Vous publiez tous les deux sous le compte GitHub `Ugo-finance`. Termine chaque commentaire et chaque revue GitHub par `<!-- codex -->`, Claude par `<!-- claude -->`. C'est le seul discriminant.
- Un ticket = une branche = une PR. Fichiers réservés annoncés dans le ticket avant de commencer, on ne touche pas à ceux de l'autre.
- Contre-revue par l'autre agent sur le SHA de tête exact, publiée dans la PR. Annoncer « revue en cours sur #N » avant de relire. Fusion par l'auteur après CI verte, contre-revue sans P1, branche à jour de `main`. Squash, suppression de branche, ni `--admin` ni force-push sur la branche de l'autre.
- Arme une veille `gh` sur les PR et commentaires `<!-- claude -->` du futur dépôt. Modèle réutilisable : `/home/ugo-bellumore/dev/.coordination/veille-codex.sh`.
- Remonte à Ugo, sans trancher seul : tout changement des décisions D1–D8, toute dépendance hors liste, tout ce qui touche à un backend ou à des données hors du dépôt.

## Contexte utile

- Ugo utilise l'app à la salle 3×/semaine : dim 16h séance C, mar 19h séance A, jeu 19h séance B, heure de Zurich. Réseau mauvais, écran ~400 px, usage à une main, le soir.
- Première séance réelle visée sur la prod Vercel : dimanche 20.09.2026.
- Une tâche planifiée Claude alimente l'événement Outlook de la séance suivante avec les cibles. Elle lira l'export JSON de l'app, d'où l'importance du format seed.
- Précédents de collaboration Claude/Codex : `/home/ugo-bellumore/dev/portail-paie-fg-fv/AGENTS.md` et `docs/runbooks/WORKFLOW-DEVELOPPEMENT-AGENTS.md` dans ce même dépôt. Ce projet est bien plus simple : aucune donnée sensible, pas de base locale, previews et prod Vercel libres.
