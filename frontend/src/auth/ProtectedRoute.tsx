import { Link, Navigate, Outlet } from 'react-router'
import type { Role } from './api'
import { useAuth } from './useAuth'

export function ProtectedRoute({ role, deniedMessage = 'No tienes permiso para acceder a la gestión de instituciones.' }: {
  /** Rol o roles que pueden acceder; sin valor, cualquier sesión activa. */
  role?: Role | readonly Role[]
  deniedMessage?: string
}) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && !(typeof role === 'string' ? [role] : role).includes(user.role)) {
    return (
      <section className="card" aria-labelledby="access-denied-title">
        <h2 id="access-denied-title">Acceso denegado</h2>
        <p role="alert">{deniedMessage}</p>
        <Link to="/">Volver al inicio</Link>
      </section>
    )
  }
  return <Outlet />
}
