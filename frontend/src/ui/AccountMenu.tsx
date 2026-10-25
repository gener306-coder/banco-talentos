import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { roleLabels } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { initialsOf, organizationOf } from '../auth/user'

/**
 * Menú de cuenta del encabezado (tarea transversal «Inicio por rol»): identidad de la sesión y «Cerrar sesión»,
 * disponibles en todas las vistas. El panel solo se monta mientras está abierto; se cierra con Esc, con un clic fuera
 * o al navegar, y devuelve el foco al botón.
 */
export function AccountMenu() {
  const { user, pending, message, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()

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
        <span aria-hidden="true">{initialsOf(user.name)}</span>
      </button>
      {open && (
        <div className="account-panel" id={panelId} role="region" aria-label="Cuenta">
          <p className="account-name">{user.name}</p>
          <p className="account-detail">{user.email}</p>
          <p className="account-detail">{roleLabels[user.role]}{organization && ` · ${organization}`}</p>
          {message && <p className="notice" role="alert">{message}</p>}
          <button type="button" className="secondary" disabled={pending} onClick={() => { void signOut() }}>
            {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      )}
    </div>
  )
}
