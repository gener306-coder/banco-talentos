import { Link } from 'react-router'
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
        {user.institution && <><dt>Institución vinculada</dt><dd>{user.institution.name}</dd></>}
        {user.company && <><dt>Empresa vinculada</dt><dd>{user.company.name}</dd></>}
      </dl>
      {message && <p className="notice" role="alert">{message}</p>}
      {user.role === 'ADMIN' && (
        <nav aria-label="Administración">
          <Link to="/institutions">Instituciones</Link>
          <Link to="/secretary-accounts">Cuentas de la Secretaría</Link>
        </nav>
      )}
      {user.role === 'SECRETARY' && (
        <nav aria-label="Secretaría de Economía">
          <Link to="/companies">Empresas</Link>
          <Link to="/secretary-accounts">Cuentas de la Secretaría</Link>
        </nav>
      )}
      {user.role === 'COMPANY' && user.company && (
        <nav aria-label="Empresa"><Link to="/talent">Buscar talento</Link></nav>
      )}
      {user.role === 'INSTITUTION' && user.institution && (
        <nav aria-label="Institución"><Link to="/students">Alumnos</Link></nav>
      )}
      <button type="button" disabled={pending} onClick={() => { void signOut() }}>
        {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
    </section>
  )
}
