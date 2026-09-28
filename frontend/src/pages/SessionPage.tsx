import { roleLabels } from '../auth/api'
import { useAuth } from '../auth/useAuth'

export function SessionPage() {
  const { user, signOut, pending, message } = useAuth()
  if (!user) return null

  return (
    <section className="card" aria-labelledby="session-title">
      <h2 id="session-title">Sesión iniciada</h2>
      <dl>
        <dt>Nombre</dt><dd>{user.name}</dd>
        <dt>Correo electrónico</dt><dd>{user.email}</dd>
        <dt>Rol</dt><dd>{roleLabels[user.role]}</dd>
      </dl>
      {message && <p className="notice" role="alert">{message}</p>}
      <button type="button" disabled={pending} onClick={() => { void signOut() }}>
        {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
    </section>
  )
}
