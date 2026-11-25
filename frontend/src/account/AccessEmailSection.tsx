import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { cancelEmailChange, requestEmailChange, requestEmailVerification, resendEmailLink } from '../auth/api'
import type { EmailLinkDelivery, User } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { EmailStatusBadge } from '../ui/EmailStatusBadge'
import { emailStateOf } from '../ui/emailState'
import { PendingLabel } from '../ui/forms'
import { PasswordField } from '../ui/PasswordField'
import { Sheet } from '../ui/Sheet'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'

const messages: FailureMessages = {
  429: 'Hiciste demasiados intentos seguidos. Espera un minuto antes de volver a intentarlo.',
}

/** Espera entre envíos y vigencia del enlace, iguales a las del servidor (AccessEmailLink). */
const COOLDOWN_SECONDS = 60
const LINK_MINUTES = 60
const timeFormat = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })

/** Segundos que faltan para poder reenviar el enlace enviado en `sentAt`; se actualiza cada segundo. */
function useCooldown(sentAt: string | null): number {
  const remaining = () => sentAt ? Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(sentAt).getTime()) / 1000)) : 0
  const [seconds, setSeconds] = useState(remaining)
  useEffect(() => {
    const tick = () => setSeconds(sentAt ? Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(sentAt).getTime()) / 1000)) : 0)
    tick()
    if (!sentAt) return
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [sentAt])
  return seconds
}

function deliveryNotice(delivery: EmailLinkDelivery, address: string): string {
  return delivery === 'sent'
    ? `Enviamos el enlace a ${address}. Vence en ${LINK_MINUTES} minutos.`
    : 'No pudimos confirmar el envío del correo. Espera un minuto y usa “Reenviar enlace”.'
}

/** T-S19-03: correo nuevo y contraseña actual. El correo actual sigue activo hasta confirmar el enlace. */
function EmailChangeSheet({ open, onClose, onRequested }: { open: boolean; onClose: () => void; onRequested: (user: User, delivery: EmailLinkDelivery) => void }) {
  const titleId = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const mutation = useApiMutation(messages)
  const errors = mutation.failure?.errors
  const emailError = localError ?? errors?.email?.join(' ')
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    const value = email.trim()
    setLocalError(value ? null : 'Escribe el nuevo correo de acceso.')
    if (!value || !event.currentTarget.reportValidity()) return
    void mutation.submit(() => requestEmailChange({ email: value, current_password: password }), ({ user, delivery }) => {
      setEmail('')
      setPassword('')
      onRequested(user, delivery)
    })
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h3 id={titleId}>Cambiar correo de acceso</h3>
      <p>Te enviaremos un enlace al correo nuevo. Tu correo actual seguirá activo hasta que lo confirmes; el enlace vence en {LINK_MINUTES} minutos.</p>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-password-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        <div className="field">
          <label htmlFor="account-new-email">Nuevo correo de acceso</label>
          <input id="account-new-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email}
            disabled={mutation.pending} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'account-new-email-error' : undefined}
            onBlur={(event) => {
              const error = emailErrorOnBlur(event)
              setLocalError((current) => error ?? (current === INVALID_EMAIL ? null : current))
            }}
            onChange={(event) => setEmail(event.target.value)} />
          {emailError && <p className="field-error" id="account-new-email-error">{emailError}</p>}
        </div>
        <PasswordField id="account-email-password" label="Contraseña actual" value={password} onChange={setPassword}
          autoComplete="current-password" error={errors?.current_password} disabled={mutation.pending} />
        <button type="submit" disabled={mutation.pending || !email.trim() || !password}>
          <PendingLabel pending={mutation.pending} label="Enviar enlace de confirmación" pendingLabel="Enviando enlace…" />
        </button>
      </form>
    </Sheet>
  )
}

/**
 * Fila del correo de acceso en «Acceso y seguridad» (T-S19-01 a T-S19-04): el correo con su etiqueta, el cambio con
 * confirmación por enlace y, si el correo no está verificado, un aviso no bloqueante para verificarlo.
 */
export function AccessEmailSection({ user, notify }: { user: User; notify: (message: string) => void }) {
  const { updateUser } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const mutation = useApiMutation(messages)
  const cooldown = useCooldown(user.emailLinkSentAt)
  const state = emailStateOf({ pendingEmail: user.pendingEmail, emailVerified: user.emailVerified })
  const failure = mutation.failure ? (mutation.failure.errors.email?.join(' ') ?? mutation.failure.message) : null
  const expiresAt = user.emailLinkSentAt ? timeFormat.format(new Date(new Date(user.emailLinkSentAt).getTime() + LINK_MINUTES * 60_000)) : null

  function send(action: () => Promise<{ user: User; delivery: EmailLinkDelivery }>, address: string) {
    void mutation.submit(action, ({ user: updated, delivery }) => {
      updateUser(updated)
      notify(deliveryNotice(delivery, address))
    })
  }

  function cancel() {
    void mutation.submit(cancelEmailChange, (updated) => {
      updateUser(updated)
      notify('Cambio de correo cancelado. Sigues entrando con tu correo actual.')
    })
  }

  const resendLabel = cooldown > 0 ? `Reenviar enlace (${cooldown} s)` : 'Reenviar enlace'

  return (
    <>
      <div className="account-row">
        <div className="account-row-main">
          <p className="account-row-label">Correo de acceso</p>
          <p className="account-row-value account-email-value">{user.email}<EmailStatusBadge state={state} /></p>
          <p className="account-row-note">Con él inicias sesión y recibes los enlaces para restablecer tu contraseña.</p>
        </div>
        {!user.pendingEmail && (
          <button type="button" className="secondary account-row-action" onClick={() => setSheetOpen(true)}>Cambiar correo</button>
        )}
      </div>

      {user.pendingEmail && (
        <section className="account-email-pending" aria-labelledby="account-email-pending-title">
          <h4 id="account-email-pending-title">Confirmación de correo pendiente</h4>
          <p>Enviamos un enlace a <strong>{user.pendingEmail}</strong>{expiresAt && <> (vence a las {expiresAt})</>}. Sigues entrando con {user.email} hasta que lo confirmes.</p>
          {failure && <p className="field-error" role="alert">{failure}</p>}
          <div className="actions" aria-busy={mutation.pending}>
            <button type="button" className="secondary" disabled={mutation.pending || cooldown > 0}
              onClick={() => send(resendEmailLink, user.pendingEmail ?? '')}>{resendLabel}</button>
            <button type="button" className="secondary" disabled={mutation.pending} onClick={cancel}>Cancelar cambio</button>
          </div>
        </section>
      )}

      {!user.pendingEmail && !user.emailVerified && (
        <section className="account-email-pending is-quiet" aria-labelledby="account-email-verify-title">
          <h4 id="account-email-verify-title">Verifica tu correo de acceso</h4>
          <p>Así garantizas que podrás restablecer tu contraseña si la olvidas.
            {user.emailLinkSentAt && expiresAt && <> Enviamos un enlace a {user.email} (vence a las {expiresAt}).</>}</p>
          {failure && <p className="field-error" role="alert">{failure}</p>}
          <div className="actions" aria-busy={mutation.pending}>
            {user.emailLinkSentAt
              ? <button type="button" className="secondary" disabled={mutation.pending || cooldown > 0} onClick={() => send(resendEmailLink, user.email)}>{resendLabel}</button>
              : <button type="button" className="secondary" disabled={mutation.pending} onClick={() => send(requestEmailVerification, user.email)}>
                <PendingLabel pending={mutation.pending} label="Enviar enlace de verificación" pendingLabel="Enviando enlace…" />
              </button>}
          </div>
        </section>
      )}

      <EmailChangeSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
        onRequested={(updated, delivery) => {
          setSheetOpen(false)
          updateUser(updated)
          notify(deliveryNotice(delivery, updated.pendingEmail ?? ''))
        }} />
    </>
  )
}
