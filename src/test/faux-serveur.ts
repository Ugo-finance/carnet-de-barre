/**
 * Le faux serveur des tests de sauvegarde — CB-79d, partagé depuis CB-79e.
 *
 * Il reproduit la sémantique de `appliquer_sauvegarde` telle que les tests SQL la
 * garantissent : création seulement depuis la révision 0, idempotence par opération,
 * révision contrôlée. Ce qu'il sait faire en plus, et que le vrai ne fait pas sur
 * commande : **perdre sa réponse après avoir écrit**.
 */

import type { CarnetComparable } from '../db/exchange.ts'
import type { LectureDistante } from '../domain/sauvegarde.ts'
import type { EcritureDistante, ResultatEcriture, Transport } from '../sync/transport.ts'

export class FauxServeur implements Transport {
  revision: number | null = null
  derniere: string | null = null
  carnet: CarnetComparable | null = null
  ecritures = 0
  /** Écrit, puis fait comme si la réponse s'était perdue. */
  perdreLaReponse = false
  /** Coupe le réseau : aucune requête n'arrive. */
  horsLigne = false
  /** Ce qui se passe en face entre notre lecture et notre écriture. */
  avantEcriture: (() => void) | null = null

  async lire(): Promise<LectureDistante> {
    if (this.horsLigne) throw new Error('réseau coupé')
    if (this.revision === null) return { etat: 'absente' }
    return { etat: 'lue', revision: this.revision, operation: this.derniere }
  }

  async ecrire(e: EcritureDistante): Promise<ResultatEcriture> {
    if (this.horsLigne) throw new Error('réseau coupé')
    this.avantEcriture?.()
    this.avantEcriture = null
    if (this.revision === null) {
      if (e.revisionAttendue !== 0) return { motif: 'revision-perimee', revision: null }
      this.revision = 0
    }
    if (this.derniere === e.operation) return { motif: 'deja-applique', revision: this.revision }
    if (this.revision !== e.revisionAttendue) {
      return { motif: 'revision-perimee', revision: this.revision }
    }
    this.revision += 1
    this.derniere = e.operation
    this.carnet = structuredClone(e.carnet)
    this.ecritures += 1
    if (this.perdreLaReponse) {
      this.perdreLaReponse = false
      throw new Error('réponse perdue')
    }
    return { motif: 'applique', revision: this.revision }
  }

  /** Le projet distant est vidé : plus aucun carnet en face. */
  vider(): void {
    this.revision = null
    this.derniere = null
    this.carnet = null
  }

  /** Un autre appareil écrit. */
  ecritureTierce(): void {
    this.revision = (this.revision ?? 0) + 1
    this.derniere = 'macbook:1'
  }
}
