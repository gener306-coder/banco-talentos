import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tema claro u oscuro (docs/design/identidad-visual.md, «Modo oscuro»). Por defecto sigue la preferencia del sistema;
 * la elección explícita se guarda solo en este navegador. El tema se aplica como data-theme en <html>, que activa el
 * bloque de tokens oscuros de index.css. index.html aplica el mismo cálculo antes del primer pintado.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'bt-theme'
const SYSTEM_DARK = '(prefers-color-scheme: dark)'
const listeners = new Set<() => void>()

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Almacenamiento bloqueado (navegación privada estricta): se sigue al sistema.
    return 'system'
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

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Sin almacenamiento la elección dura hasta recargar.
  }
  applyTheme(preference)
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
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as const)
  return [preference, useCallback((next: ThemePreference) => setThemePreference(next), [])]
}
