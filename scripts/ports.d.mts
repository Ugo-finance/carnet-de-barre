/**
 * Déclarations pour `ports.mjs` — CB-81.
 *
 * Le module reste du JavaScript simple **exprès** : les scripts shell le lisent avec un
 * `node -e` d'une ligne, sans passer par un transpileur. Un fichier de déclarations coûte
 * moins que la dépendance qu'imposerait un `.ts` appelé depuis bash.
 */
export declare const racine: string
export declare const PORT_APERCU: number
export declare const PORT_DEV: number
export declare function expliquer(): string
