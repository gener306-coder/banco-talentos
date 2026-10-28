import { linkageStatusLabel } from './api'
import type { LinkageStatus as Status } from './api'
import './linkage.css'

const variants: Record<Status, string> = {
  PENDIENTE_INSTITUCION: 'pending', ACEPTADA: 'accepted', RECHAZADA: 'rejected', CANCELADA: 'cancelled',
}

/** Estado de una solicitud con su texto: el color nunca es el único indicador. */
export function LinkageStatus({ status }: { status: Status }) {
  return <span className={`linkage-status ${variants[status]}`}>{linkageStatusLabel(status)}</span>
}
