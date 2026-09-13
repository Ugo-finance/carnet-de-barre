# 02 — Refonte UX validée : les 7 pages

Référence visuelle : `maquette-ux.html` (v7, validée par Ugo). La maquette montre l'intention, pas du code à porter tel quel — les règles dures d'AGENTS.md (zones ≥ 44 px, RPE pas seulement par couleur, safe area, `prefers-reduced-motion`) restent acquises. Les boutons « Démo A/B/C » au-dessus du téléphone de l'écran 02 sont un contrôle de démo : **dans l'app, aucun sélecteur en séance**.

## Direction

La séance se lit **debout, entre deux séries**. Thème sombre unique (les séances sont le soir — déjà la position de la spec). Le langage visuel, c'est la salle : les couleurs des **plaques calibrées** (25 rouge, 20 bleu, 15 jaune, 10 vert, 5 blanc, 2,5 rouge foncé, 1,25 chrome) servent de code partout — barre dessinée, badges A/B/C, ligne décorative. Texture discrète de moletage de barre sur les fonds d'en-tête. Un seul élément accentué par écran : le bouton Démarrer à l'accueil, le top set en séance, la carte record au récap.

### Tokens

- Fond `#141210`, surface `#1d1a17`, surface-2 `#262119`, trait `#332e27`
- Texte `#f2efe8`, secondaire `#9a9388`, éteint `#6b655b`
- Accent `#e23b30` (rouge plaque 25) ; ok `#3fa65b` ; alerte `#e9b62d`
- Titres display : **Anton** (majuscules) ; texte : **Archivo** ; tous les chiffres : **IBM Plex Mono**, `tabular-nums`

## Navigation

Barre d'onglets Séance · Historique · Progression · Réglages, visible **uniquement hors séance**. L'usage nominal (arriver, s'entraîner, finir) ne demande aucune navigation. L'édition d'une séance passée est un écran poussé depuis l'historique (pas d'onglet). Le sélecteur A/B/C hors rotation vit derrière l'onglet Séance.

## 01 — Accueil = la séance du jour

- Eyebrow « Bloc 2 · Semaine 1/8 » + 8 carrés (les semaines du bloc, celle en cours clignote).
- Titre géant « Séance C », sous-titre jour · contenu · durée estimée.
- Carte « Cibles du jour » : une ligne par exercice — nom, tendance en dessous (`↗ +5 sem. dern.`, `↗ 3×12 → +2`), charge en mono à droite.
- Deux chips : « ⚡ Pressé · ~30 min » (bascule mode pressé) et « Échauffement · ~6 min ».
- Bouton « Démarrer la séance » avec le **premier geste** en sous-texte (« charger la barre à 60 kg, 20/côté »).

## 02 — En séance : mode focus, une série à la fois

La séance est **une file de séries** (échauffement → top set → backoffs → volume → accessoires/supersets → optionnels, l'ordre du programme) et l'écran ne montre que la série courante :

- En tête : « Série 4/16 » + barre de progression fine + temps écoulé ; en dessous « Exercice 1/5 ». Rien d'autre.
- **Une seule carte** : tag du rôle (Échauffement / Top set / Backoff / Volume / Accessoire / Optionnel), badge bleu « SS · <partenaire> » en superset, nom + n° de série, charge en ~54 px mono, « Par côté : 25 + 10 + 1,25 » et **barre dessinée avec ses plaques** pour les charges à la barre (y compris « Barre seule »), « +10 lest » pour lest/dips, « PDC » au poids de corps.
- Saisie selon le rôle : chips RPE 7→9 sur les top sets uniquement (vert ≤ 8, ambre 8,5, rouge 9) ; stepper de répétitions − / + sur volume et accessoires, avec jauge (une cellule par série, verte au haut de fourchette) et phrase d'état (« Les 3 séries à 12 → 26 kg/h, retour à 3×8 ») ; rien sur échauffement et backoffs.
- **Valider = 1 tap → la carte suivante arrive seule** (transition ~350 ms). Chrono lancé pour les séries de travail (150 s lourd, 60–90 s superset), rien sur les paliers d'échauffement (repos libre). Le libellé du chrono annonce la suite.
- Ligne « Ensuite » sous la carte : la seule trace du reste de la séance.
- Optionnels : mêmes cartes, avec un bouton pointillé « Sauter — optionnel ».
- Chrono : anneau SVG + temps mono + Passer ; vibration à la fin, marche écran verrouillé (exigence spec existante). Toujours affiché (état vide « — ») pour éviter les sauts de layout.
- Balayage arrière pour corriger la série précédente.
- Contenu exact des trois files (61 séries, échauffements compris) : voir la maquette, séances A (23), B (22), C (16).

## 03 — Fin de séance

- « Séance validée », puis la **carte record** (fond doré, reflet balayé) : e1RM en 38 px + sparkline des top sets du bloc (trait 2 px accent, aire légère, point du jour souligné, extrêmes étiquetés une seule fois).
- Trois tuiles : durée, tonnage, séries.
- « Prochaines cibles » : exercice → nouvelle charge, flèche verte si montée, accessoires compris.
- Pied : la prochaine séance (« Mardi · Séance A — Squat 75 ×4 @8 »). Notes de séance : champ replié ici.

## 04 — Historique

- Liste groupée par semaine (« Cette semaine · 3 séances »), badge A/B/C aux couleurs de plaque (A bleu, B jaune, C rouge).
- Par séance : jour + horaires, résumé compact en notation du carnet (« Deadlift 92,5×3 @8 · Incliné 24 »), durée à droite. Séance échouée marquée ✗.
- Un tap déplie le détail complet (libellé Archivo à gauche, séries en mono alignées à droite).
- « Modifier » depuis le détail → écran 05-bis d'édition.

## 05 — Progression (cibles & ajustement)

- Un lift par ligne : nom (chip PR seulement s'il y en a un), méta en dessous (cible actuelle, contexte : « reset après 2× 75×3 », « pic +20 étroite »), sparkline du bloc à droite. Un tap ouvre le détail.
- **Ajustement manuel (CB-33) = bottom sheet** : stepper au pas du matériel, avertissement explicite (« Le moteur repartira de cette valeur. L'échec mémorisé sera effacé. »), bouton Enregistrer. Jamais caché dans un menu.

## 05-bis — Édition d'une séance passée

- Écran poussé depuis l'historique, chip « Correction ». Une ligne par série, groupées par exercice : rôle (Top set en rouge), perf en mono, bouton Modifier ; champ en édition encadré bleu ; série sautée barrée avec « Rétablir ».
- Bandeau d'avertissement permanent : « Corriger une séance passée ne recalcule jamais les cibles (D6). Pour changer une cible : Progression → Ajuster. »

## 06 — Export & réglages

- Bloc « Export vers Claude » : un bouton « Copier l'export JSON » (même format que `data/seed.json`), mini-aperçu du JSON, « Importer un JSON » en dessous.
- Bloc séance : toggles vibration, son de chrono, écran allumé pendant le chrono, mode pressé par défaut.
- Bloc matériel (constantes de la salle) : barre 20 kg ; chariot presse 45° 75,7 kg (« hors charge saisie — tonnage seulement ») ; pas haltères 2 kg / barre 2,5 kg.
- Pied : « Données locales sur cet appareil · dernière sauvegarde … ».

## Micro-interactions

Vibration à la validation ; enfoncement des boutons (`scale .94–.97`) ; carte qui glisse à l'arrivée (~350 ms) ; plaques qui glissent sur la barre ; `:focus-visible` bleu plaque 20 ; toutes les animations coupées sous `prefers-reduced-motion`.

## Données de la maquette

Cibles et calculs = état réel du 12–13.09 (92,5 / backoffs 82,5 / incliné 24, paliers d'échauffement arrondis au chargeable). Sparklines, tonnage, e1RM, horaires = illustratifs ; l'historique réel vit dans `data/seed.json`.
