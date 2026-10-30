import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PendingLabel } from '../ui/forms'
import { BrandLogo } from '../ui/BrandLogo'
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from '../ui/icons'

export function LoginPage() {
  const { user, signIn, pending, message } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    try {
      await signIn(email.trim(), password)
    } finally {
      setPassword('')
      setShowPassword(false)
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
        <label htmlFor="password">Contraseña</label>
        <div className="input-with-icon has-action">
          <LockIcon />
          <input id="password" name="password" type={showPassword ? 'text' : 'password'}
            autoComplete="current-password" placeholder="Ingresa tu contraseña"
            required value={password} disabled={pending}
            onChange={(event) => setPassword(event.target.value)} />
          <button type="button" className="plain input-action" aria-label="Mostrar contraseña"
            aria-pressed={showPassword} aria-controls="password" disabled={pending}
            onClick={() => setShowPassword((shown) => !shown)}>
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <button type="submit" disabled={pending}>
          <PendingLabel pending={pending} label="Iniciar sesión" pendingLabel="Iniciando sesión…" />
        </button>
      </form>
    </section>
  )
}
