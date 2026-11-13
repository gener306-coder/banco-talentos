import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { composeLinks } from './composeLinks'
import { CheckIcon, CopyIcon, ExternalIcon, MailIcon } from './icons'

const GAP = 6
const EDGE = 8

type Copy = { state: 'copied' | 'failed'; at: DOMRect } | null

/**
 * Menú del ícono de correo de una celda (T-S12-06). `mailto:` falla sin cliente de correo configurado, así que el ícono
 * abre un menú con «Copiar correo», Gmail, Outlook y la app del sistema. Sigue la mecánica del menú de cuenta
 * (ui/AccountMenu.tsx): se cierra con Esc, con un clic fuera o al elegir, y devuelve el foco al botón. Además es un
 * menú ARIA (flechas, Inicio y Fin) y vive en un portal con posición fija, para que el desplazamiento horizontal de la
 * tabla no lo recorte. Sin dependencias: React, createPortal y la API del portapapeles.
 */
export function EmailMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState<Copy>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const links = composeLinks(email)

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }, [])

  // Bajo el ícono, alineado a su izquierda y dentro de la ventana; arriba si no cabe abajo. Se mide ya montado y se
  // coloca antes de pintar (oculto hasta entonces por CSS: .email-menu sin data-placed).
  useLayoutEffect(() => {
    const panel = menu.current
    if (!open || !trigger.current || !panel) return
    const anchor = trigger.current.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = panel
    const below = anchor.bottom + GAP
    const top = below + height > window.innerHeight - EDGE && anchor.top - GAP - height > EDGE ? anchor.top - GAP - height : below
    panel.style.top = `${top}px`
    panel.style.left = `${Math.min(Math.max(anchor.left, EDGE), window.innerWidth - width - EDGE)}px`
    panel.dataset.placed = ''
    panel.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close(false)
    }
    // Una posición fija no sigue a la celda: el menú se cierra si la página o la tabla se desplazan.
    function onViewportChange(event: Event) {
      if (!menu.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [open, close])

  // El aviso de copiado se retira solo.
  useEffect(() => {
    if (!copy) return
    const timer = setTimeout(() => setCopy(null), 2200)
    return () => clearTimeout(timer)
  }, [copy])

  function onMenuKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const move = (next: number) => { event.preventDefault(); items[(next + items.length) % items.length]?.focus() }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'Tab') close(false)
  }

  async function copyEmail() {
    const at = trigger.current?.getBoundingClientRect() ?? new DOMRect()
    try {
      if (!navigator.clipboard) throw new Error('Portapapeles no disponible')
      await navigator.clipboard.writeText(email)
      setCopy({ state: 'copied', at })
      close(true)
    } catch {
      // Sin permiso de portapapeles: el correo queda seleccionado en el menú para copiarlo a mano.
      setCopy({ state: 'failed', at })
      const address = menu.current?.querySelector('.email-menu-address')
      if (address) window.getSelection()?.selectAllChildren(address)
    }
  }

  return (
    <>
      <button ref={trigger} type="button" aria-label={`Escribir a ${email}`} title={email}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}>
        <MailIcon />
      </button>
      {open && createPortal(
        <div ref={menu} id={menuId} className="email-menu" role="menu" aria-label={`Correo ${email}`} onKeyDown={onMenuKey}>
          <p className="email-menu-address" aria-hidden="true">{email}</p>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => { void copyEmail() }}><CopyIcon />Copiar correo</button>
          <a role="menuitem" tabIndex={-1} href={links.gmail} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
            <ExternalIcon />Abrir en Gmail
          </a>
          <a role="menuitem" tabIndex={-1} href={links.outlook} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
            <ExternalIcon />Abrir en Outlook
          </a>
          <a role="menuitem" tabIndex={-1} href={links.system} onClick={() => close(false)}><MailIcon />Abrir en app del sistema</a>
        </div>,
        document.body,
      )}
      {copy && createPortal(
        <p className={`cell-toast ${copy.state}`} role="status" style={{ top: copy.at.bottom + GAP, left: Math.max(copy.at.left, EDGE) }}>
          {copy.state === 'copied' ? <><CheckIcon />Correo copiado</> : 'No se pudo copiar: el correo quedó seleccionado.'}
        </p>,
        document.body,
      )}
    </>
  )
}
