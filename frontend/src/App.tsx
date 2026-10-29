import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AuditEventsPage } from './audit/AuditEventsPage'
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
import { CompaniesPage } from './companies/CompaniesPage'
import { CompanyCreatePage } from './companies/CompanyCreatePage'
import { CompanyDetailPage } from './companies/CompanyDetailPage'
import { CompanyEditPage } from './companies/CompanyEditPage'
import { SECRETARY_ACCOUNT_MANAGERS } from './secretary/api'
import { SecretaryAccountsPage } from './secretary/SecretaryAccountsPage'
import { InstitutionLinkageRequestDetailPage } from './linkage/InstitutionLinkageRequestDetailPage'
import { InstitutionLinkageRequestsPage } from './linkage/InstitutionLinkageRequestsPage'
import { LinkageRequestsPage } from './linkage/LinkageRequestsPage'
import { REPORT_VIEWERS } from './reports/api'
import { ReportsPage } from './reports/ReportsPage'
import { OpportunitiesPage } from './opportunities/OpportunitiesPage'
import { OpportunityCreatePage } from './opportunities/OpportunityCreatePage'
import { OpportunityDetailPage } from './opportunities/OpportunityDetailPage'
import { OpportunityEditPage } from './opportunities/OpportunityEditPage'
import { TalentProfilePage } from './talent/TalentProfilePage'
import { TalentSearchPage } from './talent/TalentSearchPage'
import { StudentCvPage } from './students/StudentCvPage'
import { StudentDetailPage } from './students/StudentDetailPage'
import { StudentsPage } from './students/StudentsPage'
import { AccountMenu } from './ui/AccountMenu'
import { prefersReducedMotion } from './ui/modal'

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
      <Route element={<ProtectedRoute role="ADMIN" deniedMessage="No tienes permiso para consultar la bitácora." />}>
        <Route path="/audit-events" element={<AuditEventsPage />} />
      </Route>
      <Route element={<ProtectedRoute role={SECRETARY_ACCOUNT_MANAGERS} deniedMessage="No tienes permiso para gestionar las cuentas de la Secretaría." />}>
        <Route path="/secretary-accounts" element={<SecretaryAccountsPage />} />
      </Route>
      <Route element={<ProtectedRoute role={REPORT_VIEWERS} deniedMessage="No tienes permiso para consultar el reporte ejecutivo." />}>
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
      <Route element={<ProtectedRoute role="SECRETARY" deniedMessage="No tienes permiso para gestionar empresas." />}>
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/new" element={<CompanyCreatePage />} />
        <Route path="/companies/:id" element={<CompanyDetailPage />} />
        <Route path="/companies/:id/edit" element={<CompanyEditPage />} />
      </Route>
      <Route element={<ProtectedRoute role="COMPANY" deniedMessage="No tienes permiso para buscar talento." />}>
        <Route path="/talent" element={<TalentSearchPage />} />
        <Route path="/talent/:publicId" element={<TalentProfilePage />} />
      </Route>
      <Route element={<ProtectedRoute role="COMPANY" deniedMessage="No tienes permiso para gestionar oportunidades." />}>
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/opportunities/new" element={<OpportunityCreatePage />} />
        <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
        <Route path="/opportunities/:id/edit" element={<OpportunityEditPage />} />
      </Route>
      <Route element={<ProtectedRoute role="COMPANY" deniedMessage="No tienes permiso para consultar solicitudes de vinculación." />}>
        <Route path="/linkage-requests" element={<LinkageRequestsPage />} />
      </Route>
      <Route element={<ProtectedRoute role="INSTITUTION" deniedMessage="No tienes permiso para acceder al padrón de alumnos." />}>
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/students/:id/cv" element={<StudentCvPage />} />
      </Route>
      <Route element={<ProtectedRoute role="INSTITUTION" deniedMessage="No tienes permiso para consultar solicitudes de vinculación." />}>
        <Route path="/institution/linkage-requests" element={<InstitutionLinkageRequestsPage />} />
        <Route path="/institution/linkage-requests/:id" element={<InstitutionLinkageRequestDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Resorte críticamente amortiguado (ver --spring en ui/ui.css).
const SPRING_EASING = 'linear(0, 0.075, 0.227, 0.39, 0.536, 0.656, 0.75, 0.821, 0.873, 0.911, 0.938, 0.957, 0.971, 0.98, 0.986, 0.991, 0.994, 0.996, 0.997, 0.998, 1)'
const depth = (path: string) => path.split('/').filter(Boolean).length

/**
 * Consistencia espacial: al profundizar (listado → detalle) la vista entra desde la derecha y al
 * volver, desde la izquierda. Se anima el contenedor sin desmontarlo, para no repetir la sesión.
 */
function useRouteTransition(element: RefObject<HTMLElement | null>, pathname: string) {
  const previous = useRef(pathname)
  useLayoutEffect(() => {
    const from = previous.current
    previous.current = pathname
    const node = element.current
    if (from === pathname || !node || typeof node.animate !== 'function') return
    const reduced = prefersReducedMotion()
    const offset = Math.sign(depth(pathname) - depth(from)) * 24
    const frames = reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${offset}px)` }, { opacity: 1, transform: 'none' }]
    try {
      node.animate(frames, { duration: reduced ? 160 : 500, easing: reduced ? 'ease' : SPRING_EASING })
    } catch {
      node.animate(frames, { duration: 300, easing: 'ease-out' })
    }
  }, [element, pathname])
}

/** El borde suave bajo el encabezado solo aparece cuando hay contenido debajo. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return scrolled
}

/**
 * Pantallas de acceso con una sola tarjeta: usan el ancho angosto. Todas las demás vistas, incluido el inicio,
 * son anchas por defecto (docs/design/identidad-visual.md, «Tamaños y retícula»).
 */
const NARROW_PATHS = ['/login', '/set-initial-password', '/reset-password']

/** Enlaces de contraseña: funcionan sin sesión y no montan el proveedor de sesión. */
const PASSWORD_PATHS = ['/set-initial-password', '/reset-password']

function App() {
  const { pathname } = useLocation()
  const wide = !NARROW_PATHS.includes(pathname)
  const withSession = !PASSWORD_PATHS.includes(pathname)
  const main = useRef<HTMLElement>(null)
  const scrolled = useScrolled()
  useRouteTransition(main, pathname)

  const shell = (
    <>
      <header className="app-bar" data-scrolled={scrolled}>
        <div className={`app-bar-inner${wide ? ' wide' : ''}`}>
          {/* En /login el logotipo se muestra en el formulario; se evita duplicarlo. */}
          {pathname !== '/login' && (
            <span className="brand-plate shrink-0">
              <img src="/brand/logo.png" alt="Nodologístico" width={404} height={480} className="h-11 w-auto min-[481px]:h-14" />
            </span>
          )}
          <div>
            <p className="eyebrow">Educación Dual</p>
            <h1>Banco de Talentos</h1>
          </div>
          {/* Coemblema institucional: a la derecha, con la misma altura que el logotipo principal. Los logotipos van en
              una pastilla que solo se ve en el tema oscuro, para seguir sobre fondo claro. */}
          <span className="app-bar-partner">
            <span className="brand-plate">
              <img src="/brand/sec-economia.png" alt="Secretaría de Economía" width={1920} height={414} className="h-[1.6rem] w-auto min-[481px]:h-11" />
            </span>
          </span>
          {/* Menú de cuenta: identidad y «Cerrar sesión» en todas las vistas con sesión. */}
          {withSession && <AccountMenu />}
        </div>
      </header>
      <main ref={main} className={wide ? 'page-wide' : undefined}>
        <Routes>
          <Route path="/set-initial-password" element={<SetInitialPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<AuthRoutes />} />
        </Routes>
      </main>
    </>
  )

  // El proveedor envuelve encabezado y contenido para que el menú de cuenta comparta la sesión.
  return withSession ? <AuthProvider>{shell}</AuthProvider> : shell
}

export default App
