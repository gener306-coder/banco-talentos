import type { OpportunityOption } from '../opportunities/api'
import type { LinkageStatus } from './api'

/** Estados que impiden volver a solicitar el mismo perfil para la misma oportunidad (T-S12-07). */
export type BlockingStatus = Extract<LinkageStatus, 'PENDIENTE_INSTITUCION' | 'ACEPTADA' | 'RECHAZADA'>

/** Motivo breve junto a una oportunidad que ya no se puede elegir. */
export const blockingLabels: Record<BlockingStatus, string> = {
  PENDIENTE_INSTITUCION: 'Pendiente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
}

// Si una oportunidad tiene varias solicitudes, manda la más fuerte: aceptada, luego pendiente, luego rechazada.
const STRENGTH: Record<LinkageStatus, number> = { ACEPTADA: 3, PENDIENTE_INSTITUCION: 2, RECHAZADA: 1, CANCELADA: 0 }

export interface OpportunityAvailability {
  option: OpportunityOption
  /** null: se puede elegir (sin solicitud o solo canceladas). */
  blockedBy: BlockingStatus | null
}

/**
 * Qué oportunidades activas de la empresa siguen disponibles para solicitar un perfil (T-S12-07). Refleja la regla del
 * backend, que es por oportunidad: una solicitud pendiente, aceptada o rechazada bloquea solo su oportunidad, y una
 * cancelada no bloquea (la empresa la retiró). El backend sigue siendo la última palabra.
 */
export function linkageAvailability(options: readonly OpportunityOption[], sent: readonly { status: LinkageStatus; opportunity: { id: number } }[]) {
  const strongest = new Map<number, LinkageStatus>()
  for (const { status, opportunity } of sent) {
    const current = strongest.get(opportunity.id)
    if (current === undefined || STRENGTH[status] > STRENGTH[current]) strongest.set(opportunity.id, status)
  }
  const items: OpportunityAvailability[] = options.map((option) => {
    const status = strongest.get(option.id)
    return { option, blockedBy: status === undefined || status === 'CANCELADA' ? null : status }
  })
  return { items, eligible: items.filter((item) => item.blockedBy === null).length }
}
