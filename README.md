# Carnet de barre

Carnet de musculation personnel. Application web installable sur téléphone, qui fonctionne
sans réseau, et dont les données ne quittent l'appareil que par un export volontaire.

Production : <https://carnet-de-barre.vercel.app>

## Installer sur l'iPhone

**Depuis Safari, pas depuis Chrome.** iOS ne permet l'ajout à l'écran d'accueil que
depuis Safari ; Chrome ne propose pas l'option. L'application installée aura sa propre
base de données, séparée de celle du navigateur.

1. Ouvrir <https://carnet-de-barre.vercel.app> dans Safari.
2. Bouton Partager, puis « Sur l'écran d'accueil ».
3. Lancer l'app depuis l'icône. Le réseau n'est plus nécessaire ensuite.

## Après chaque séance : transmettre les données

Les données vivent **uniquement dans le navigateur du téléphone**. Ce n'est pas une
sauvegarde : un stockage purgé, un téléphone perdu, et l'historique disparaît. L'export
sert donc à deux choses à la fois, et c'est pour ça qu'il vaut la peine de le faire à
chaque fois.

1. Dans l'app, écran **Exporter**, taper « Copier mes séances ».
2. Coller dans la conversation Claude qui suit l'entraînement.
3. Claude s'en sert pour remplir l'événement Outlook de la séance suivante avec les
   cibles recalculées.

Si Safari refuse l'accès au presse-papiers, un fichier `carnet-de-barre-AAAA-MM-JJ.json`
est téléchargé à la place. Le conserver revient au même : c'est le même contenu.

### Restaurer

Écran **Exporter**, section Importer : coller un export, vérifier ce qu'il remplacerait,
puis confirmer. L'import **remplace tout** l'historique et les cibles ; il n'y a pas de
fusion. Il est refusé tant qu'une séance est en cours de saisie.

Le format d'origine du dossier de transmission (`handoff/.../data/seed.json`) reste
importable, ce qui permet de repartir de l'état de départ.

## Format d'échange

Un fichier versionné, qui conserve la forme historique à l'intérieur :

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-20T15:30:00.000Z",
  "targets": {
    "updatedAt": "2026-09-20",
    "squat": { "w": 77.5, "inc": 2.5, "reps": 4, "fail": null }
  },
  "seances": [
    { "id": "…", "date": "2026-09-20", "type": "C", "lines": ["…"], "tops": {}, "notes": "" }
  ]
}
```

Les `lines` et les `tops` sont ce que relit Claude ; les séries détaillées s'ajoutent
sans les remplacer. Un fichier produit par une version plus récente de l'app est refusé
avec un message explicite, jamais importé à moitié.

## Développement

```text
npm install
npm run dev            serveur de développement
npm run check          lint, format, types, tests, build — ce que la CI exécute
npm run test:watch     Vitest en continu
```

- `AGENTS.md` — règles pour les agents (Claude et Codex).
- `PLAN.md` — plan de développement et décisions.
- `REVUE-CODEX.md` — revue critique du plan par Codex.
- `handoff/carnet-de-barre-handoff/` — spécification produit, prototype et données de départ.
- `scripts/veille.sh` — veille de coordination GitHub entre agents.

Le chrono de récupération recalcule son temps depuis une échéance enregistrée et avertit par son
et vibration quand l’app est au premier plan. Les navigateurs mobiles ne garantissent pas d’alarme
quand l’écran est verrouillé ; l’option « Garder l’écran allumé » utilise Screen Wake Lock quand le
téléphone la propose.
