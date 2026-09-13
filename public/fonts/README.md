# Polices embarquées

Les polices sont servies depuis le bundle PWA, sans appel réseau à Google Fonts. Les fichiers ont
été récupérés le 13.09.2026 depuis les versions WOFF2 servies par Google Fonts ; les licences viennent
du [dépôt officiel google/fonts](https://github.com/google/fonts/tree/main/ofl).

| Famille | Fichier | Graisses | Source | Licence |
|---|---|---:|---|---|
| Anton | `anton/anton-latin-400.woff2` | 400 | Google Fonts, Anton v27 | SIL Open Font License 1.1 (`anton/OFL.txt`) |
| Archivo | `archivo/archivo-latin-400-700.woff2` | 400–700 variable | Google Fonts, Archivo v25 | SIL Open Font License 1.1 (`archivo/OFL.txt`) |
| IBM Plex Mono | `ibm-plex-mono/ibm-plex-mono-latin-{500,600,700}.woff2` | 500, 600, 700 | Google Fonts, IBM Plex Mono v20 | SIL Open Font License 1.1 (`ibm-plex-mono/OFL.txt`) |

Les fichiers ne couvrent que le sous-ensemble latin. Il contient les lettres accentuées et les symboles employés par l'interface française. Les fallbacks CSS restent déclarés pour tout caractère absent.
