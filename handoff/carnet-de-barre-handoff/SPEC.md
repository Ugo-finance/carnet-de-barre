# Carnet de barre — Spécification produit

App de suivi d'entraînement **personnelle** (un seul utilisateur : Ugo), type GymDay mais avec une meilleure UX et adaptée à SON programme uniquement. Pas de catalogue d'exercices générique, pas de multi-programmes, pas de comptes : l'app connaît le programme et fait tout le travail de tête.

## Pourquoi

Le suivi vivait dans des conversations Claude non persistantes → données perdues. Un premier prototype (artifact Claude, `prototype/carnet-de-barre.html`) fonctionne mais n'est pas une vraie webapp mobile. Objectif : une PWA installable sur téléphone, utilisée 3×/semaine à la salle.

## Les 6 exigences (par ordre d'importance)

1. **Zéro réflexion sur les charges.** À l'ouverture, l'app affiche la séance du jour avec les poids exacts à mettre : top set, backoffs, accessoires — calculés par le moteur de progression (règles ci-dessous). Afficher aussi le **chargement de la barre par côté** (barre 20 kg).
2. **Tracking des perfs.** Log rapide en cours de séance (poids × reps @RPE, pré-rempli avec la cible, steppers ±2,5). Historique complet, évolution des top sets par lift, PRs, e1RM optionnel.
3. **Chrono de récupération.** Lancé (ou proposé) après validation d'une série : 2–3 min après top sets/backoffs, 60–90 s en superset. Décompte visible, vibration/son à la fin, fonctionne écran verrouillé si possible.
4. **Notes de fin de séance** optionnelles (sensations, durée, matériel, salle).
5. **Export facile vers Claude.** Un bouton « Exporter » → bloc texte/JSON copiable (ou fichier .json) contenant les séances, pour coller dans une conversation Claude. Format d'export : le même que `data/seed.json`.
6. **Édition facile.** Corriger une séance passée, ajuster manuellement une cible (le moteur repart de là).

## Le programme (données du domaine — à coder en dur ou en config)

**Rotation hebdo (heure de Zurich)** : dimanche 16h = **C**, mardi 19h = **A**, jeudi 19h = **B**.

| Séance | Contenu |
|---|---|
| **A — Squat + Bench volume** | 1. Squat : top set 1×4 @RPE 8 + 2 backoffs ×5 à −10 % · 2. Bench volume : 3×8 (cible `benchVol`) · 3. SS tractions lestées +10 3×8 / dips +10 3×8–10 · 4. Opt. curls / élévations latérales 2×10–12 |
| **B — Bench lourd + Dos** | 1. Bench : top set 1×4 @RPE 8 + 2 backoffs ×5 à −10 % · 2. Tractions lestées (prise large) : top set 1×4–5 @RPE 8 + backoffs +7,5 kg ×6 ×2 · 3. SS rowing haltères 22,5–24 kg / DM haltères 20 kg, 3×8–10 · 4. Opt. face pulls, abdos roulette |
| **C — Deadlift + Haut du corps** | 1. Deadlift : top set 1×3 @RPE 8 + 2 backoffs ×4 à −10 % · 2. DI haltères 20 kg 3×8–10 · 3. SS presse 45° 2×10–12 / tractions PDC 2×AMRAP−2 · 4. Opt. élévations latérales |

Version pressée : exercices 1–2 seulement (~30 min) — prévoir un toggle.

## Moteur de progression (règles exactes)

Incréments : squat/bench/tractions **+2,5 kg**, deadlift **+5 kg**. Reps cibles du top set : squat 4, bench 4, deadlift 3, tractions 4(–5).

- **Succès** (reps cibles atteintes ET RPE ≤ 8) → cible = poids réalisé + incrément.
- **Échec** (RPE ≥ 9 OU reps manquées) : 1er échec → retenter le même poids la prochaine fois ; **2e échec au même poids → reset à −7,5 %** arrondi à 2,5 kg.
- RPE non noté mais reps faites → maintien de la cible.
- **Backoffs** = −10 % du top set arrondi à 2,5 kg (exception : tractions, backoffs fixes à +7,5 kg ×6 ×2).
- **Bench volume (3×8)** : double progression — 3×8 complètes à la cible → +2,5 kg.
- Accessoires : double progression (haut de fourchette de reps → +charge).
- Barre 20 kg ; plaques par côté à décomposer dans [25, 20, 15, 10, 5, 2,5, 1,25].
- Repos : 2–3 min lifts lourds, 60–90 s supersets.

## Cibles actuelles (au 12.09.2026 — état de départ de l'app)

| Lift | Cible | Contexte |
|---|---|---|
| Squat | 75 ×4 @8 | reset après 2× 80×4 @9 |
| Bench | 70 ×4 @8 | reset après 2× 75×3 |
| Deadlift | 92,5 ×3 @8 | 87,5 @8 le 06.09 |
| Tractions | +15 (prise large) | +20 prise étroite = pic |
| Bench volume | 60 ×8 ×3 | |

Historique complet (11 séances, 22.07 → 10.09.2026) dans `data/seed.json` — l'app doit démarrer pré-remplie avec.

## UX (ce qui doit être mieux que GymDay)

- Mobile-first (~400 px), une main, gros chiffres (mono, tabular-nums), thème sombre par défaut (séances le soir).
- Écran d'accueil = la séance du jour, prête à logger. Zéro navigation pour l'usage nominal.
- Valider une série = 1 tap (valeurs pré-remplies) → chrono de récup démarre.
- RPE en chips (7 / 7,5 / 8 / 8,5 / 9 / 9,5), code couleur (≤8 vert, 8,5 ambre, ≥9 rouge).
- Après enregistrement : afficher les cibles recalculées de la prochaine séance (« Jeudi : bench 72,5 »).
- Sélecteur A/B/C pour logger une séance hors rotation (ça arrive).

## Tech (suggestions, pas des contraintes)

- PWA : manifest + service worker, **offline-first** (le réseau de la salle est mauvais) ; installable sur l'écran d'accueil iOS/Android.
- Persistance locale (IndexedDB/localStorage) + export/import JSON. Backend optionnel : Supabase dispo si une sync multi-appareils est voulue — sinon s'en passer, c'est mono-utilisateur.
- Le prototype `prototype/carnet-de-barre.html` contient déjà le moteur de progression, le calcul des plaques et le rendu des 3 séances en vanilla JS — réutilisable tel quel comme point de départ.

## Contexte d'intégration existant (à ne pas casser)

- Une tâche planifiée Claude (dim/mar/jeu ~22h, Europe/Zurich) remplit l'événement Outlook de la séance suivante avec les cibles. Elle lit aujourd'hui la base de l'artifact prototype. Quand la vraie app remplacera le prototype, l'export JSON collé à Claude (ou une table Supabase lisible) devra la re-alimenter.
- Les séances sont dans le calendrier Outlook pro : dim 16h, mar 19h, jeu 19h.
