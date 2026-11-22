import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { requestPasswordReset } from '../auth/api'
import { SimplifiedNotice } from '../legal/SimplifiedNotice'
import { ApiError } from '../lib/http'
import { PendingLabel } from '../ui/forms'
import { MailIcon } from '../ui/icons'

/**
 * «¿Olvidaste tu contraseña?» (HU-S16-03): pide el enlace de restablecimiento con el correo de acceso. Funciona sin
 * sesión, para los 4 roles. El mensaje de confirmación es el del servidor y es siempre el mismo, exista o no la cuenta.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const value = email.trim()
    if (!value) {
      setError('Escribe tu correo electrónico.')
      return
    }
    busy.current = true
    setPending(true)
    setError(null)
    try {
      setSent(await requestPasswordReset(value))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) setError(failure.errors.email?.join(' ') ?? 'Escribe un correo electrónico válido.')
      else if (failure instanceof ApiError && failure.status === 429) setError('Ya pediste varios enlaces. Espera un momento antes de volver a intentarlo.')
      else if (failure instanceof ApiError && failure.status === 0) setError('No pudimos conectar con el servidor. Inténtalo de nuevo.')
      else setError('No pudimos enviar la solicitud. Inténtalo de nuevo.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <section className="card password-setup" aria-labelledby="forgot-password-title">
      <h2 id="forgot-password-title">¿Olvidaste tu contraseña?</h2>
      {sent ? (
        <>
          <p role="status">{sent}</p>
          <p>El enlace vence en 60 minutos y solo puede usarse una vez.</p>
          <p><Link to="/login">Volver al inicio de sesión</Link></p>
        </>
      ) : (
        <>
          <p>Escribe el correo con el que inicias sesión y te enviaremos un enlace para crear una contraseña nueva.</p>
          {error && <p className="notice" role="alert" id="forgot-password-error">{error}</p>}
          <form onSubmit={(event) => { void submit(event) }} aria-busy={pending} noValidate>
            <label htmlFor="forgot-email">Correo electrónico</label>
            <div className="input-with-icon">
              <MailIcon />
              <input id="forgot-email" name="email" type="email" autoComplete="username" placeholder="nombre@ejemplo.com"
                required maxLength={254} value={email} disabled={pending} aria-invalid={Boolean(error)}
                aria-describedby={error ? 'forgot-password-error' : undefined}
                onChange={(event) => { setEmail(event.target.value); setError(null) }} />
            </div>
            <button type="submit" disabled={pending}>
              <PendingLabel pending={pending} label="Enviar enlace" pendingLabel="Enviando…" />
            </button>
          </form>
          <p className="login-forgot"><Link to="/login">Volver al inicio de sesión</Link></p>
        </>
      )}
      <SimplifiedNotice backLabel="Volver" />
    </section>
  )
}
