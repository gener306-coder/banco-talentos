import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PendingLabel } from '../ui/forms'

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
      setPassword('')
    }
  }

  return (
    <section className="card" aria-labelledby="login-title">
      <div className="brand-plate mx-auto mb-6 w-fit">
        <img src="/brand/logo.png" alt="Nodologístico" width={697} height={783} className="block h-32 w-auto" />
      </div>
      <h2 id="login-title">Iniciar sesión</h2>
      <p>Ingresa con tu cuenta del sistema.</p>
      {message && <p className="notice" role="alert">{message}</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="username"
          required maxLength={254} value={email} disabled={pending}
          onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password"
          required value={password} disabled={pending}
          onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={pending}>
          <PendingLabel pending={pending} label="Iniciar sesión" pendingLabel="Iniciando sesión…" />
        </button>
      </form>
    </section>
  )
}
