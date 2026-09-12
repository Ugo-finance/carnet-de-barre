# Carnet de barre — dossier de transmission Claude Code

Construire une **PWA mobile de suivi d'entraînement personnelle** pour Ugo (un seul utilisateur), à partir de ce dossier.

## Contenu

| Fichier | Rôle |
|---|---|
| `SPEC.md` | **À lire en premier.** Spécification complète : objectifs, programme, moteur de progression, UX, exigences. |
| `prototype/carnet-de-barre.html` | Prototype fonctionnel (artifact Claude, single-file). Contient le moteur de progression, le calcul des plaques par côté, le rendu des 3 séances, l'historique. Sa couche de persistance (`claude.use("db")`) ne fonctionne que sur claude.ai → à remplacer par IndexedDB/localStorage + export JSON. Tout le reste est réutilisable. |
| `data/seed.json` | Les 11 séances réelles (22.07 → 10.09.2026) + cibles actuelles. L'app doit démarrer pré-remplie avec ces données. Ce format est aussi le format d'export/import. |

## Définition du fini

L'app est bonne quand, à la salle, Ugo : ouvre l'app → voit les poids exacts à mettre (avec plaques par côté) → valide chaque série en un tap → le chrono de récup tourne tout seul → à la fin, note optionnelle, et les cibles de la prochaine séance sont recalculées. Plus un bouton export JSON pour transmettre les données à Claude.
