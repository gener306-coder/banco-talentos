import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tema claro u oscuro (docs/design/identidad-visual.md, «Modo oscuro»). Por defecto es el claro (T-S14-06); «Sistema»
 * sigue la preferencia del sistema operativo. La elección se guarda solo en este navegador. El tema se aplica como data-theme en <html>, que activa el
 * bloque de tokens oscuros de index.css. public/theme-init.js aplica el mismo cálculo antes del primer pintado.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'bt-theme'
const SYSTEM_DARK = '(prefers-color-scheme: dark)'
const listeners = new Set<() => void>()

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  } catch {
    // Almacenamiento bloqueado (navegación privada estricta): el tema claro por defecto.
    return 'light'
  }
}

const systemPrefersDark = () => typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_DARK).matches

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  return preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(preference)
  // La barra del navegador móvil toma el fondo de la aplicación del tema activo.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const background = getComputedStyle(root).getPropertyValue('--surface-muted').trim()
  if (meta && background) meta.content = background
}

/** Punto desde el que se revela el tema nuevo (el control pulsado), en coordenadas de la ventana. */
export interface ThemeOrigin { x: number; y: number }

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * T-S14-06: cambiar de tema se anima. Con View Transitions, el tema nuevo se revela en un círculo que crece desde el
 * control pulsado; sin ellas, colores y fondos se funden durante un instante. Con movimiento reducido, o si el tema que
 * se ve no cambia (p. ej. de Claro a Sistema con el sistema en claro), se aplica sin animación.
 */
function transition(apply: () => void, next: 'light' | 'dark', origin?: ThemeOrigin): void {
  const root = document.documentElement
  if (reducedMotion() || root.dataset.theme === next) return apply()
  const start = (document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }).startViewTransition
  if (typeof start !== 'function') {
    root.classList.add('theme-fading')
    apply()
    window.setTimeout(() => root.classList.remove('theme-fading'), 450)
    return
  }
  const view = start.call(document, apply)
  const x = origin?.x ?? window.innerWidth - 32
  const y = origin?.y ?? 32
  // El radio alcanza la esquina más lejana de la ventana desde el origen.
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  view.ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' })
  }).catch(() => { /* La transición se omitió: el tema ya está aplicado. */ })
}

export function setThemePreference(preference: ThemePreference, origin?: ThemeOrigin): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Sin almacenamiento la elección dura hasta recargar.
  }
  transition(() => applyTheme(preference), resolveTheme(preference), origin)
  listeners.forEach((listener) => listener())
}

/**
 * Mantiene el tema al día: con «Sistema», sigue los cambios del sistema operativo; si otra pestaña cambia la
 * elección, la aplica aquí. Devuelve la función que retira los oyentes.
 */
export function watchTheme(): () => void {
  applyTheme()
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_DARK) : null
  const onSystemChange = () => { if (getThemePreference() === 'system') applyTheme('system') }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    applyTheme()
    listeners.forEach((listener) => listener())
  }
  media?.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  return () => {
    media?.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Preferencia actual y su setter, para el selector del menú de cuenta. */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference, origin?: ThemeOrigin) => void] {
  const preference = useSyncExternalStore(subscribe, getThemePreference, () => 'light' as const)
  return [preference, useCallback((next: ThemePreference, origin?: ThemeOrigin) => setThemePreference(next, origin), [])]
}

function readResolvedTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function subscribeResolved(listener: () => void) {
  // data-theme cambia por el selector, por el sistema o por otra pestaña: se observa el atributo, la fuente de verdad.
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/** Tema que se está mostrando ahora mismo, para elegir recursos como el logotipo (HU-S8-03). */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeResolved, readResolvedTheme, () => 'light' as const)
}
