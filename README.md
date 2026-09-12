# Carnet de barre

PWA mobile de carnet de musculation, mono-utilisateur, offline-first, déployée sur Vercel.

```text
npm install
npm run dev
npm run check
```

- `AGENTS.md` — règles pour les agents (Claude et Codex).
- `PLAN.md` — plan de développement et décisions (v2 du 12.09.2026).
- `REVUE-CODEX.md` — revue critique du plan par Codex.
- `handoff/carnet-de-barre-handoff/` — spécification produit, prototype et données de départ.
- `scripts/veille.sh` — veille de coordination GitHub entre agents.

Le chrono de récupération recalcule son temps depuis une échéance enregistrée et avertit par son
et vibration quand l’app est au premier plan. Les navigateurs mobiles ne garantissent pas d’alarme
quand l’écran est verrouillé ; l’option « Garder l’écran allumé » utilise Screen Wake Lock quand le
téléphone la propose.
