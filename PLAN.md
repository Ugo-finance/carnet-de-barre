# Carnet de barre — plan de développement

Version 1 — 12.09.2026 — rédigé par Claude, à valider par Ugo puis à soumettre à Codex.

Source de vérité produit : `handoff/carnet-de-barre-handoff/SPEC.md`. Ce plan ne la répète pas, il dit comment on la livre à deux agents, vite et sans se marcher dessus.

## 1. Cible

PWA mobile mono-utilisateur, offline-first, installable, déployée sur Vercel. À la salle : ouvrir → voir les charges exactes et les plaques par côté → valider chaque série en un tap → chrono de récup automatique → cibles recalculées → export JSON pour Claude.

Première version utilisable à la salle visée pour la séance C du **dimanche 20.09.2026** (J+8). Tout ce qui n'est pas nécessaire à cette séance passe en M4/M5.

## 2. Décisions d'architecture (D1–D8)

Ces décisions se tranchent maintenant et ne se rouvrent pas dans une PR. Si Codex ou Claude veut en changer une, il ouvre un ticket « Décision » et attend Ugo.

- **D1 — Stack : Vite + React 19 + TypeScript strict, déployé en site statique sur Vercel.** Pas de Next.js. L'app est 100 % côté client (aucun rendu serveur, aucune API), et un site statique donne l'offline le plus simple et le plus fiable via `vite-plugin-pwa` (Workbox). Next.js apporterait Serwist, un serveur et des cold starts pour rien.
- **D2 — Persistance : IndexedDB via Dexie.** Une base `carnet`, tables `seances`, `targets`, `settings`. `localStorage` uniquement pour les préférences UI. Export/import JSON au format exact de `data/seed.json` (c'est le contrat avec Claude et la tâche Outlook).
- **D3 — Pas de backend en V1.** Supabase reste une option M5 (sync multi-appareils, alimentation de la tâche planifiée Outlook). Tant qu'il n'y a pas de backend, la tâche Outlook est ré-alimentée par le JSON exporté collé à Claude.
- **D4 — Le domaine est un module pur, testé, sans DOM.** `src/domain/` contient programme, moteur de progression, plaques, rotation hebdo, e1RM. Zéro import React. Couverture Vitest exhaustive : c'est le cœur, et c'est ce que le prototype fournit déjà en vanilla JS, à porter en TS.
- **D5 — Une séance = un enregistrement `{ id, date, type, sets[], accessories[], notes, lines[], tops }`.** `id` = UUID (deux séances le même jour restent possibles). `lines` et `tops` sont **dérivés** des `sets` à l'enregistrement pour rester compatibles avec le format seed ; les 11 séances du seed n'ont que `lines`/`tops` et sont importées telles quelles (drapeau `legacy: true`).
- **D6 — Les cibles sont recalculées à l'enregistrement, jamais en lecture.** Modifier une séance passée ou une cible à la main écrase l'état des cibles à partir de là ; on ne rejoue pas tout l'historique. Simple, prévisible, conforme à l'exigence 6.
- **D7 — Rotation en Europe/Zurich** : dim = C, mar = A, jeu = B, calculée avec `Intl.DateTimeFormat` sur ce fuseau, pas avec `getDay()` local.
- **D8 — UI : Tailwind 4 + composants maison.** Pas de shadcn ni de lib UI : une dizaine de composants (stepper, chips RPE, chrono, carte exercice, toast). Thème sombre par défaut, chiffres en `tabular-nums`.

### Points de la spec à préciser (Ugo tranche, les agents ne devinent pas)

| # | Question | Proposition par défaut si pas de réponse |
|---|---|---|
| Q1 | RPE **8,5** sur un top set avec reps faites : ni succès (≤ 8) ni échec (≥ 9) selon la spec ; le prototype le compte comme échec. | Maintien de la cible sans compter d'échec. |
| Q2 | Accessoires : log structuré (charge × reps par série, double progression automatique) ou texte libre comme le prototype ? | Structuré pour les 6 accessoires nommés (tractions +10, dips, rowing, DM, DI, presse), texte libre pour les « optionnels ». |
| Q3 | Chrono écran verrouillé : sur iOS une PWA ne peut ni vibrer ni sonner écran verrouillé. | Notification locale + Wake Lock + son en foreground ; on documente la limite. |
| Q4 | Séance « pressée » : les exercices 1–2 seulement. Le superset 3 disparaît ou reste replié ? | Replié, désactivé par défaut. |

## 3. Jalons et tickets Linear

Projet Linear : **« Carnet de barre — PWA »** dans l'équipe UGO, un jalon par ligne M0–M5, un ticket par ligne ci-dessous. Chaque ticket porte : périmètre, fichiers réservés, critères d'acceptation, propriétaire (Claude ou Codex). Titres en français, préfixe `CB-` interne dans le titre pour s'y retrouver.

**Répartition** : Claude prend le domaine et la persistance (D4–D6), Codex prend l'écran de séance et le chrono. Chacun contre-revoit tout ce que fait l'autre. Ce découpage par dossier évite les conflits : `src/domain/` et `src/db/` à Claude, `src/features/session/` et `src/components/` à Codex, le reste au premier qui ouvre le ticket.

### M0 — Socle (J0, Claude, en une PR)

| Ticket | Contenu | Acceptation |
|---|---|---|
| CB-01 Dépôt et outillage | `git init`, dépôt GitHub privé `Ugo-finance/carnet-de-barre`, Vite + React + TS strict, Tailwind, Vitest, ESLint, Prettier, `AGENTS.md`, `CLAUDE.md`, `.github/workflows/ci.yml` (lint, typecheck, test, build). | CI verte sur `main`, `npm run check` passe en local. |
| CB-02 Vercel | Projet Vercel lié au dépôt, previews par PR, prod sur `main`. | URL de preview commentée automatiquement sur la première PR. |
| CB-03 Linear | Projet, jalons M0–M5, les tickets de ce plan, labels `claude`/`codex`/`revue`. | Tous les tickets ci-dessous existent et sont assignés. |

### M1 — Domaine pur (J1–J2, Claude)

| Ticket | Contenu | Acceptation |
|---|---|---|
| CB-10 Types et programme | `src/domain/program.ts` : lifts, séances A/B/C, accessoires, incréments, schémas. Types `Seance`, `SetLog`, `Targets`. Schéma Zod du format seed/export. | Le seed passe la validation Zod. |
| CB-11 Moteur de progression | Port de `applyRule`/`applyVolRule` en TS pur. Règles exactes de la spec + Q1. | Tests : succès, RPE non noté, 1er échec, 2e échec → reset −7,5 % arrondi 2,5, 8,5, backoffs −10 %, backoffs tractions fixes, double progression 3×8. Rejouer le seed doit redonner exactement les cibles du 12.09 (75 / 70 / 92,5 / +15 / 60). |
| CB-12 Plaques et rotation | `platesPerSide` (barre 20, [25, 20, 15, 10, 5, 2,5, 1,25]), `todayType` en Europe/Zurich, prochaine séance et délai. | Tests sur 60, 62,5, 67,5, 92,5, 20, 17,5 kg ; tests de rotation sur les 7 jours et autour de minuit. |
| CB-13 e1RM et PR | Epley/RPE-chart au choix, détection PR par lift (poids et e1RM). | Tests. |

### M2 — Écran de séance (J1–J4, Codex, en parallèle de M1 sur des interfaces figées par CB-10)

| Ticket | Contenu | Acceptation |
|---|---|---|
| CB-20 Écran d'accueil | Séance du jour (ou prochaine), sélecteur A/B/C, cartes exercice avec gros chiffre cible et plaques par côté, séries pré-remplies. | Sur un iPhone en 390 px, tout se fait d'une main, aucun débordement horizontal. |
| CB-21 Saisie d'une série | Stepper ±2,5 (poids) et ±1 (reps), chips RPE 7→9,5 avec code couleur, bouton « Valider » par série, état validé visible. | Valider une série pré-remplie = 1 tap. |
| CB-22 Chrono de récup | Démarre à la validation : 150 s après top set/backoff, 75 s en superset, ajustable ±30 s, vibration + son + notification à zéro, Wake Lock si dispo. | Fonctionne en arrière-plan Android ; limite iOS documentée (Q3). |
| CB-23 Fin de séance | Notes optionnelles, mode « pressée », récapitulatif des cibles recalculées (« Jeudi : bench 72,5 »). | Le récap correspond au retour du moteur. |

### M3 — Persistance, historique, édition (J3–J5, Claude)

| Ticket | Contenu | Acceptation |
|---|---|---|
| CB-30 Dexie et seed | Base, migrations, import du seed au premier lancement, hooks React de lecture. | Au premier lancement, 11 séances et les cibles sont présentes ; rechargement offline OK. |
| CB-31 Enregistrement | Sauvegarde d'une séance depuis l'écran M2, dérivation `lines`/`tops`, mise à jour des cibles. | Séance visible en historique, cibles mises à jour. |
| CB-32 Historique et progression | Liste des séances, tableau par lift (top sets), PR, e1RM, cibles courantes avec état « 2e essai ». | Le seed s'affiche fidèlement. |
| CB-33 Édition | Modifier/supprimer une séance passée, ajuster une cible à la main (D6). | Une cible modifiée devient la nouvelle base du moteur. |

### M4 — PWA et export (J5–J7, Codex)

| Ticket | Contenu | Acceptation |
|---|---|---|
| CB-40 Export/import JSON | Bouton « Exporter » → copie presse-papiers + fichier `.json`, format seed exact ; import avec validation Zod et confirmation de remplacement. | Export puis import = état identique (test). |
| CB-41 PWA | Manifest, icônes, `vite-plugin-pwa`, offline complet, bandeau « mise à jour disponible ». | Lighthouse PWA installable ; fonctionne en avion. |
| CB-42 Test bout en bout | Playwright : ouvrir → valider un top set → chrono → enregistrer → cible recalculée → export. | Passe en CI. |

### M5 — Après la première séance réelle (J8+)

| Ticket | Contenu |
|---|---|
| CB-50 Retours terrain | Corrections après la séance du 20.09. |
| CB-51 Sync Supabase (optionnelle) | Table `seances` + `targets`, sync bidirectionnelle simple, lecture par la tâche planifiée Outlook. À ne lancer que sur demande d'Ugo. |
| CB-52 Graphiques | Évolution des top sets et e1RM par lift. |

## 4. Protocole de collaboration Claude ↔ Codex

Repris du portail paie, allégé (pas de Supabase local, pas de données sensibles).

1. **Un ticket = une branche = une PR.** Branches `claude/cb-11-moteur` et `codex/cb-22-chrono`, fondées sur `main` à jour. Squash à la fusion, suppression de branche.
2. **Fichiers réservés** déclarés dans le ticket avant de commencer. On ne touche pas aux fichiers réservés par l'autre ; si besoin, commentaire dans le ticket et attente.
3. **Marqueurs** : tout commentaire et toute revue GitHub se termine par `<!-- claude -->` ou `<!-- codex -->`. Les deux agents publient sous le compte `Ugo-finance`, c'est le seul discriminant.
4. **Contre-revue obligatoire** par l'autre agent, sur le SHA de tête exact, publiée dans la PR GitHub (Linear ne reçoit qu'un résumé et le lien). Annoncer « revue en cours sur #N » avant de relire.
5. **Fusion** par l'auteur, après : CI verte sur le `head_sha`, contre-revue sans P1, branche à jour de `main`. Ni `--admin`, ni force-push sur la branche de l'autre.
6. **Veille** : chaque agent arme une boucle `gh` (modèle : `/home/ugo-bellumore/dev/.coordination/veille-codex.sh`, à adapter au nouveau dépôt) qui signale PR ouvertes, revues et commentaires marqués.
7. **Déploiement** : les previews Vercel sont automatiques et libres. La prod suit `main` automatiquement, ce dépôt ne contient rien de sensible. Ugo peut retirer cette autorisation à tout moment.
8. **Ce qui remonte à Ugo** : Q1–Q4, tout changement de D1–D8, toute dépendance ajoutée hors liste (React, Dexie, Zod, Tailwind, vite-plugin-pwa, Vitest, Playwright, ESLint, Prettier), CB-51.

## 5. Ordre d'exécution proposé

1. Ugo valide ce plan et répond à Q1–Q4 (ou accepte les défauts).
2. Claude exécute M0 seul (une PR, ~1 h) : dépôt GitHub, CI, Vercel, projet Linear et tickets, `AGENTS.md` contenant §2 et §4 de ce plan.
3. Ugo lance Codex dans le dépôt avec un prompt qui pointe vers `AGENTS.md`, le ticket CB-20 et ce plan.
4. Claude et Codex travaillent en parallèle M1 ∥ M2, puis M3 ∥ M4, contre-revue croisée à chaque PR.
5. Séance du 20.09 sur la prod Vercel, retours dans CB-50.

## 6. Risques

- **Chrono iOS écran verrouillé** : limite de plateforme, pas de contournement propre en PWA. On l'assume (Q3).
- **Dépendance M2 → M1** : Codex a besoin des types de CB-10. CB-10 est donc la première PR après M0, livrée avant que Codex ne commence, et ses interfaces sont figées jusqu'à M3.
- **Contrat du format seed** : c'est ce que la tâche Outlook et Claude consomment. Toute évolution du schéma est additive et versionnée (`schemaVersion`).

---

## 7. Arbitrages du 12.09.2026 (version 2, après REVUE-CODEX.md)

Ugo a demandé d'avancer sans arbitrage point par point. Les propositions de Codex deviennent donc les règles par défaut. Elles restent révisables par Ugo à tout moment, et tout ce qui touche au produit lui est rappelé en fin de chaque jalon.

### Constats corrigés
- Le seed contient **12 séances** (22.07 → 10.09), pas 11. CB-30 importe les 12, y compris les deux dates approximatives.
- **Le rejeu du seed n'est pas un test.** L'historique contient des décisions manuelles (tractions +20 → +15, bench volume 60 maintenu). CB-30 importe fidèlement les 12 séances et les 5 cibles fournies ; CB-11 se teste sur des scénarios synthétiques à résultat connu.
- **`applyRule` du prototype n'est pas porté à l'identique.** Règles réécrites : appliquées au poids effectivement réalisé ; une valeur inconnue (RPE ou reps absents) n'est jamais assimilée à un échec ; RPE 8,5 avec reps faites = maintien sans nouvel échec ; reps manquées = échec quel que soit le RPE.
- **Échec en attente** : un échec mémorise la charge ; il est conservé après un maintien (8,5 ou RPE absent avec reps faites), effacé après succès, reset ou ajustement manuel ; un échec à une autre charge remplace la charge suivie. Deux échecs consécutifs à la même charge → reset −7,5 % arrondi à 2,5.
- **Backoffs** : recalculés à partir du top set choisi tant qu'ils sont vierges ; préservés s'ils ont été modifiés ou validés. Bench volume : progression seulement si les 3 séries sont validées à la cible avec ≥ 8 reps.
- **Plaques** : 20 kg → « barre seule » ; charge non décomposable → message explicite, jamais de décomposition partielle présentée comme exacte ; pas de calcul de plaques pour le lest des tractions ni les haltères.

### Décisions révisées
- **D2/D5 — format enrichi compatible.** Clés `targets` et `seances` et champs legacy conservés (`lines`, `tops`, `notes`, `approx`, `fail`). Ajout de `schemaVersion`, `id` (UUID), `sets[]`, `accessories[]`. Le seed non versionné est importé comme format historique ; une version future inconnue est refusée avant toute écriture. Les `lines` historiques ne sont pas converties en séries.
- **D6 — édition sans effet automatique sur les cibles.** Corriger ou supprimer une séance ancienne modifie l'historique et ses statistiques, jamais les cibles. Ajuster une cible reste une action explicite. Pas de recalcul automatique en V1.
- **D7 — accueil** : la séance du jour reste affichée tant qu'elle n'est pas terminée, puis la prochaine ; une séance manuelle A/B/C reste toujours possible. Date de séance (`YYYY-MM-DD`) séparée de l'instant technique.
- **D8 — accessibilité** : zones tactiles ≥ 44 px, RPE indiqué autrement que par la couleur seule, safe area et clavier ouvert gérés.
- **D9 — brouillon persistant.** Toute saisie (séries validées, notes, type, échéance du chrono) est écrite dans IndexedDB au fil de l'eau. Rechargement, fermeture, changement A/B/C ne perdent rien. La finalisation est une transaction séance + cibles + fermeture du brouillon, idempotente (UUID du brouillon, vérification d'état). Le seed n'est importé qu'une fois, avec un marqueur ; une base vidée volontairement ne le réimporte pas.
- **D10 — offline dès le squelette.** Service worker minimal et manifeste dans le premier squelette (CB-41 avancé), polices embarquées, mise à jour sans perte : jamais de rechargement automatique pendant une séance active.

### Réponses Q1–Q4
- **Q1** : 8,5 avec reps faites = maintien sans échec ; reps manquées = échec.
- **Q2** : accessoires structurés (charge × reps) pour tractions lestées +10, dips, rowing, DM, DI, presse, plus tractions PDC en reps. **Pas de progression automatique des accessoires en V1** tant qu'Ugo n'a pas donné les pas de charge disponibles (haltères, presse). Charge inconnue = « à renseigner ». C'est une réduction explicite de la spec, à confirmer par Ugo.
- **Q3** : chrono à échéance persistée, temps restant recalculé au retour au premier plan, son et vibration quand disponibles, écran allumé facultatif. Aucune promesse d'alarme écran verrouillé. **Ugo doit indiquer téléphone et navigateur.**
- **Q4** : mode pressé = exercices 3+ repliés et désactivés, réactivables, séries saisies jamais effacées. En C, le DI haltères est l'exercice 2 et reste visible.

### Critères d'acceptation révisés
- CB-41 : installation réelle sur le téléphone d'Ugo, lancement autonome, offline en mode avion, mise à jour sans perte. Plus de porte Lighthouse.
- CB-40 : égalité définie sur séances et cibles (identifiants et échecs compris) ; import bloqué si un brouillon est actif ; validation complète, récapitulatif, proposition d'export préalable, remplacement atomique ; tests sur JSON invalide et seed historique.
- CB-42 : Playwright pour le parcours applicatif ; recette manuelle sur le téléphone réel et l'URL de prod pour installation, offline et chrono.

### Organisation
- **M0 en trois PR** (CB-01 socle, CB-02 Vercel, CB-03 Linear) après un commit initial minimal sur `main` (README, PLAN, REVUE, handoff, `.gitignore`).
- **Propriété des fichiers** : Claude possède `src/domain/`, `src/db/`, `src/features/history/` ; Codex possède `src/features/session/`, `src/components/`, `src/pwa/`, `src/features/export/` (interface). `App.tsx`, styles globaux, configuration, `package.json` et lockfile : un seul propriétaire actif à la fois, réservé dans le ticket. Worktrees distincts.
- **Revue** : pas d'approbation GitHub native obligatoire (impossible sous un compte unique). Revue en commentaire signée, avec verdict explicite, SHA complet et classement P1/P2/P3. Zéro P1 ouvert pour fusionner ; toute nouvelle tête appelle une nouvelle revue.
- **Dépendances directes de M0** : react, react-dom, dexie, zod, tailwindcss + @tailwindcss/vite, vite, @vitejs/plugin-react, vite-plugin-pwa, typescript, vitest, @testing-library/react + jsdom, oxlint (linter fourni par le scaffold Vite, remplace ESLint), prettier, @playwright/test. Toute autre dépendance remonte à Ugo.
- **Séquence** : 12–13.09 M0 + CB-10 (contrats) + squelette PWA · 13–15.09 CB-11/12/30 ∥ CB-20/21/22 · 15–16.09 CB-31 + CB-23 + CB-40 · 17–18.09 CB-42 et recette téléphone · 19.09 marge · 20.09 16h séance C réelle.
- **Reportable si le délai se tend** : CB-13 (e1RM), graphiques, finitions. Non reportable : brouillon, export, cibles fiables, mode pressé, ajustement manuel.
