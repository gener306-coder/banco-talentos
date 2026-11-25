/**
 * Estado del correo de acceso (T-S19-01 a T-S19-04). Mi cuenta y los listados de cuentas usan las mismas cuatro
 * etiquetas: la cuenta aún sin contraseña, un cambio por confirmar, el correo verificado o sin verificar.
 */
export type EmailState = 'pending-setup' | 'change-pending' | 'verified' | 'unverified'

export const emailStateLabels: Record<EmailState, string> = {
  'pending-setup': 'Pendiente de activar',
  'change-pending': 'Cambio pendiente',
  verified: 'Correo verificado',
  unverified: 'Sin verificar',
}

export function emailStateOf({ pendingSetup = false, pendingEmail = null, emailVerified }: { pendingSetup?: boolean; pendingEmail?: string | null; emailVerified: boolean }): EmailState {
  if (pendingSetup) return 'pending-setup'
  if (pendingEmail) return 'change-pending'
  return emailVerified ? 'verified' : 'unverified'
}
