import { EmailStatusBadge } from '../ui/EmailStatusBadge'
import { emailStateOf } from '../ui/emailState'
import type { SetupAccount } from './api'

/**
 * Correo de una fila del listado de cuentas con su etiqueta (T-S19-01): «Pendiente de activar» mientras no establece su
 * contraseña y, después, verificado o sin verificar. Sin etiqueta si la respuesta no trae la verificación.
 */
export function AccountEmailCell({ account }: { account: SetupAccount }) {
  const state = account.status === 'pending' ? 'pending-setup'
    : account.email_verified === null ? null : emailStateOf({ emailVerified: account.email_verified })
  return <span className="email-cell">{account.email}{state && <EmailStatusBadge state={state} />}</span>
}
