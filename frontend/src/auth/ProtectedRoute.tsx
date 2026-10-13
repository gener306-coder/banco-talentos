import { Link, Navigate, Outlet } from 'react-router'
import type { Role } from './api'
import { useAuth } from './useAuth'

export function ProtectedRoute({ role, deniedMessage = 'No tienes permiso para acceder a la gestión de instituciones.' }: {
  role?: Role
  deniedMessage?: string
}) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) {
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
