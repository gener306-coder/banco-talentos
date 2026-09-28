import { Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/LoginPage'
import { SessionPage } from './pages/SessionPage'

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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <main>
      <header>
        <p className="eyebrow">Educación Dual</p>
        <h1>Banco de Talentos</h1>
      </header>
      <AuthProvider><AuthRoutes /></AuthProvider>
    </main>
  )
}

export default App
