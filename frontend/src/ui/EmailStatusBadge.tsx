import { emailStateLabels } from './emailState'
import type { EmailState } from './emailState'

/** Etiqueta del estado del correo de acceso (T-S19-01), igual en Mi cuenta y en los listados de cuentas. */
export function EmailStatusBadge({ state }: { state: EmailState }) {
  return <span className={`email-badge ${state}`}>{emailStateLabels[state]}</span>
}
