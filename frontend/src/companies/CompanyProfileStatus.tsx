import type { CompanyProfileStatus as Status } from './api'

const labels: Record<Status, string> = {
  pending_access: 'Acceso pendiente',
  incomplete: 'Perfil incompleto',
  complete: 'Perfil completo',
}

// Mismos colores de estado que .institution-status: pendiente, apagado y activo.
const tones: Record<Status, string> = { pending_access: 'pending', incomplete: 'inactive', complete: 'active' }

/** HU-S14-02 CA-03: dónde va la empresa invitada, de crear su contraseña a completar su perfil. */
export function CompanyProfileStatus({ status }: { status: Status }) {
  return <span className={`institution-status ${tones[status]}`}>{labels[status]}</span>
}
