import { PendingLabel } from './forms'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { roleLabels } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { organizationOf } from '../auth/user'
import { ChevronRightIcon, CheckIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from './icons'
import { UserAvatar } from './UserAvatar'
import { useThemePreference } from './theme'
import type { ThemePreference } from './theme'

/** Temas en el orden en que se piensan: el claro (predeterminado), el oscuro y el del sistema. */
const THEMES: readonly { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Claro', icon: <SunIcon /> },
  { value: 'dark', label: 'Oscuro', icon: <MoonIcon /> },
  { value: 'system', label: 'Sistema', icon: <MonitorIcon /> },
]

/**
 * Miniatura de cada tema (T-S14-06): una ventana de la aplicación con su encabezado, una tarjeta y el acento de la
 * marca, pintada con los colores fijos de ese tema; «Sistema» muestra las dos mitades.
 */
function ThemePreview({ value }: { value: ThemePreference }) {
  return (
    <span className={`theme-preview ${value}`} aria-hidden="true">
      <span className="theme-preview-bar" />
      <span className="theme-preview-card"><span className="theme-preview-line" /><span className="theme-preview-line short" /></span>
    </span>
  )
}

/**
 * Menú de cuenta del encabezado (tarea transversal «Inicio por rol»): identidad de la sesión, el tema (modo oscuro) y
 * «Cerrar sesión», disponibles en todas las vistas. El panel solo se monta mientras está abierto; se cierra con Esc, con un clic fuera
 * o al navegar, y devuelve el foco al botón.
 */
export function AccountMenu() {
  const { user, pending, message, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()
  const [theme, setTheme] = useThemePreference()

  // Navegar cierra el menú (por ejemplo, tras cerrar sesión o al seguir un enlace).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!user) return null
  const organization = organizationOf(user)

  return (
    <div className="account-menu" ref={root}>
      <button ref={trigger} type="button" className="account-trigger" aria-label={`Cuenta de ${user.name}`}
        aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <UserAvatar name={user.name} size="sm" />
      </button>
      {open && (
        <div className="account-panel" id={panelId} role="region" aria-label="Cuenta">
          <div className="account-panel-identity">
            <UserAvatar name={user.name} size="md" />
            <div className="account-panel-who">
              <p className="account-name">{user.name}</p>
              {/* M3 (HU-S14-02): con el nombre provisional, el nombre ya es el correo; no se repite. */}
              {user.name !== user.email && <p className="account-detail">{user.email}</p>}
            </div>
          </div>
          <p className="account-panel-context">
            <span className="account-role-chip">{roleLabels[user.role]}</span>
            {organization && <span className="account-organization">{organization}</span>}
          </p>
          <div className="account-panel-section">
            {/* HU-S14-01: Mi cuenta, para todos los roles. */}
            <Link className="account-link" to="/account" onClick={() => setOpen(false)}>
              <span className="account-link-icon"><UserIcon /></span>
              <span className="account-link-text">Mi cuenta<span className="account-link-hint">Perfil y seguridad</span></span>
              <ChevronRightIcon />
            </Link>
          </div>
          <fieldset className="account-panel-section account-theme">
            <legend>Tema</legend>
            <div className="theme-options">
              {THEMES.map((option) => (
                <label key={option.value} className="theme-option">
                  <input type="radio" name={`${panelId}-theme`} value={option.value} checked={theme === option.value}
                    onChange={(event) => {
                      // El tema nuevo se revela desde el mosaico elegido.
                      const box = event.currentTarget.parentElement?.getBoundingClientRect()
                      setTheme(option.value, box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : undefined)
                    }} />
                  <ThemePreview value={option.value} />
                  <span className="theme-option-label">{option.icon}{option.label}</span>
                  <span className="theme-option-check" aria-hidden="true"><CheckIcon /></span>
                </label>
              ))}
            </div>
          </fieldset>
          {message && <p className="notice" role="alert">{message}</p>}
          {/* «Cerrar sesión» queda al final, separado, como acción terminal. */}
          <div className="account-panel-section">
            <button type="button" className="account-signout" disabled={pending} onClick={() => { void signOut() }}>
              <LogOutIcon /><PendingLabel pending={pending} label="Cerrar sesión" pendingLabel="Cerrando sesión…" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
