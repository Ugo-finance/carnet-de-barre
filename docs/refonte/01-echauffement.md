# 03 — L'échauffement entre dans l'app

> Document d'origine, validé par Ugo le 13.09.2026. Trois valeurs ont été corrigées
> depuis — palier haut du soulevé de terre, son rappel dans le bloc replié, et le libellé
> du plancher. Le motif est dans `00-contrat.md`, qui fait foi en cas de désaccord.

Aujourd'hui rien n'existe : Ugo improvise ses montées en charge. L'app doit les calculer depuis la cible du jour et les afficher au-dessus du top set.

## Règles de calcul

Paliers en % de la cible du jour, arrondis au chargeable (`WEIGHT_STEP_BY_LOAD_KIND` : 2,5 kg barre/lest, 2 kg haltère), affichés avec le chargement par côté comme le top set.

| Lift | Paliers |
|---|---|
| Squat, bench (et bench volume s'il ouvre la séance à froid) | barre à vide ×8 → ~50 % ×5 → ~70 % ×3 → ~87 % ×1 |
| Soulevé de terre — jamais à vide, plancher 60 kg (20 kg par côté : hauteur de disque) | ~60 % ×5 → ~78 % ×3 → ~90 % ×1 |
| Tractions lestées | poids de corps ×5 → ~50 % du lest ×2 |
| Accessoires | 1×8 à ~60 % pour le **premier exercice d'un pattern froid** uniquement (ex. incliné en séance C : 14 kg/h avant les 24) ; rien pour ce qui vient en superset après du travail lourd |

Exemples aux cibles actuelles : bench 70 → 20×8, 35×5, 50×3, 60×1. Deadlift 92,5 → 60×5, 72,5×3, 82,5×1. Tractions +15 → PDC×5, +7,5×2. Sous 60 kg de cible barre, le palier ~87 % saute. En séance A, les tractions +10 servent elles-mêmes d'échauffement du pattern tirage.

## Règles moteur / données

- Nouveau rôle de série `warmup`, séries préremplies comme les autres (statut `planned` → `validated` en un tap).
- **Exclues de tout** : jamais dans `tops`, jamais dans `lines` du résumé, jamais dans `applyProgression`. Présentes dans `sets` de l'export avec leur rôle (évolution additive du schéma, `schemaVersion` incrémenté).
- Pas de chrono automatique après un palier ; repos libre.
- Recalculées si la cible du top set change (ajustement manuel en séance) tant qu'elles sont `planned` — même mécanique que les backoffs dans `useDraftEditor`.
- Mode pressé : l'échauffement des exercices 1–2 reste visible.

## UI (voir maquette, écran 02)

Bloc « Échauffement » au-dessus du top set : paliers cochables avec % et charge ; une fois tous validés, le bloc se replie en une ligne « ✓ Échauffement 3/3 · 60×5 · 72,5×3 · 82,5×1 ». L'accueil annonce « Échauffement · 3 paliers · ~6 min » et le bouton Démarrer donne le premier geste (« charger la barre à 60 kg, 20/côté »).
