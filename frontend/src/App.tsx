import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/LoginPage'
import { SessionPage } from './pages/SessionPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SetInitialPasswordPage } from './pages/SetInitialPasswordPage'
import { InstitutionsPage } from './institutions/InstitutionsPage'
import { InstitutionCreatePage } from './institutions/InstitutionCreatePage'
import { InstitutionDetailPage } from './institutions/InstitutionDetailPage'
import { InstitutionEditPage } from './institutions/InstitutionEditPage'

function AuthRoutes() {
  const { status, message, pending, restore, signOut } = useAuth()

  if (status === 'loading') {
    return <p role="status">Comprobando sesión…</p>
  }

  if (status === 'error' || status === 'forbidden') {
    return (
      <section className="card" aria-labelledby="session-error-title">
        <h2 id="session-error-title">{status === 'forbidden' ? 'Acceso denegado' : 'No pudimos comprobar tu sesión'}</h2>
        {message && <p className="notice" role="alert">{message}</p>}
        <div className="actions">
          <button type="button" disabled={pending} onClick={() => { void restore() }}>Reintentar</button>
          {status === 'forbidden' && (
            <button type="button" className="secondary" disabled={pending} onClick={() => { void signOut() }}>
              {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<SessionPage />} />
      </Route>
      <Route element={<ProtectedRoute role="ADMIN" />}>
        <Route path="/institutions" element={<InstitutionsPage />} />
        <Route path="/institutions/new" element={<InstitutionCreatePage />} />
        <Route path="/institutions/:id" element={<InstitutionDetailPage />} />
        <Route path="/institutions/:id/edit" element={<InstitutionEditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  const { pathname } = useLocation()
  return (
    <main className={pathname.startsWith('/institutions') ? 'institutions-shell' : undefined}>
      <header className="flex items-center gap-4">
        {/* En /login el logotipo se muestra en el formulario; se evita duplicarlo. */}
        {pathname !== '/login' && (
          <img src="/brand/logo.png" alt="Nodologístico" width={697} height={783} className="h-14 w-auto shrink-0" />
        )}
        <div>
          <p className="eyebrow text-brand-neutral">Educación Dual</p>
          <h1 className="text-brand-primary">Banco de Talentos</h1>
        </div>
      </header>
      <Routes>
        <Route path="/set-initial-password" element={<SetInitialPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<AuthProvider><AuthRoutes /></AuthProvider>} />
      </Routes>
    </main>
  )
}

export default App
