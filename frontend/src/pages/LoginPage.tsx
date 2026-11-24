import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PendingLabel } from '../ui/forms'
import { BrandLogo } from '../ui/BrandLogo'
import { MailIcon } from '../ui/icons'
import { PasswordField } from '../ui/PasswordField'
import { SimplifiedNotice } from '../legal/SimplifiedNotice'

export function LoginPage() {
  const { user, signIn, pending, message } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (user) return <Navigate to="/" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    try {
      await signIn(email.trim(), password)
    } finally {
      // Vaciar el campo también lo vuelve a ocultar (PasswordField).
      setPassword('')
    }
  }

  return (
    <section className="card" aria-labelledby="login-title">
      <BrandLogo className="mx-auto mb-6 block h-36 w-auto" />
      <h2 id="login-title">Iniciar sesión</h2>
      <p>Ingresa con tu cuenta del sistema.</p>
      {message && <p className="notice" role="alert">{message}</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="email">Correo electrónico</label>
        <div className="input-with-icon">
          <MailIcon />
          <input id="email" name="email" type="email" autoComplete="username" placeholder="nombre@ejemplo.com"
            required maxLength={254} value={email} disabled={pending}
            onChange={(event) => setEmail(event.target.value)} />
        </div>
        <PasswordField id="password" name="password" label="Contraseña" autoComplete="current-password"
          placeholder="Ingresa tu contraseña" value={password} onChange={setPassword} disabled={pending} />
        <button type="submit" disabled={pending}>
          <PendingLabel pending={pending} label="Iniciar sesión" pendingLabel="Iniciando sesión…" />
        </button>
      </form>
      {/* HU-S16-03: recuperación de contraseña de autoservicio. */}
      <p className="login-forgot"><Link to="/forgot-password">¿Olvidaste tu contraseña?</Link></p>
      <SimplifiedNotice backLabel="Volver al inicio de sesión" />
    </section>
  )
}
