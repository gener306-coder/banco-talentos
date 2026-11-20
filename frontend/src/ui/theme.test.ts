import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getThemePreference, setThemePreference, THEME_STORAGE_KEY, useThemePreference, watchTheme } from './theme'

let systemDark = false
let reduceMotion = false
const mediaListeners = new Set<() => void>()

beforeEach(() => {
  systemDark = false
  reduceMotion = false
  mediaListeners.clear()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return (query === '(prefers-color-scheme: dark)' && systemDark) || (query === '(prefers-reduced-motion: reduce)' && reduceMotion) },
    media: query,
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  }))
})
afterEach(() => vi.unstubAllGlobals())

const theme = () => document.documentElement.dataset.theme

describe('modo oscuro: preferencia de tema', () => {
  it('usa el tema claro por defecto, aunque el sistema esté en oscuro (T-S14-06)', () => {
    systemDark = true
    expect(getThemePreference()).toBe('light')
    applyTheme()
    expect(theme()).toBe('light')
  })

  it('guarda cada elección, también «Sistema», que sigue al sistema operativo', () => {
    systemDark = true
    setThemePreference('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(theme()).toBe('light')

    setThemePreference('dark')
    expect(theme()).toBe('dark')

    setThemePreference('system')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
    expect(getThemePreference()).toBe('system')
    expect(theme()).toBe('dark')
  })

  it('con «Sistema» reacciona al cambio del sistema operativo; con una elección explícita, no', () => {
    const stop = watchTheme()
    expect(theme()).toBe('light')
    setThemePreference('system')
    systemDark = true
    mediaListeners.forEach((listener) => listener())
    expect(theme()).toBe('dark')

    setThemePreference('light')
    systemDark = false
    mediaListeners.forEach((listener) => listener())
    systemDark = true
    mediaListeners.forEach((listener) => listener())
    expect(theme()).toBe('light')
    stop()
    expect(mediaListeners.size).toBe(0)
  })

  it('aplica la elección hecha en otra pestaña', () => {
    const stop = watchTheme()
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }))
    expect(theme()).toBe('dark')
    stop()
  })

  it('sin almacenamiento disponible usa el tema claro y no falla', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    systemDark = true
    expect(getThemePreference()).toBe('light')
    expect(() => setThemePreference('light')).not.toThrow()
    expect(theme()).toBe('light')
    vi.restoreAllMocks()
  })

  it('el hook expone la preferencia y la actualiza', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current[0]).toBe('light')
    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')
    expect(theme()).toBe('dark')
  })
})

describe('animación del cambio de tema (T-S14-06)', () => {
  beforeEach(() => { document.documentElement.dataset.theme = 'light' })

  it('revela el tema nuevo en un círculo desde el control pulsado con View Transitions', async () => {
    const animate = vi.fn()
    document.documentElement.animate = animate
    const start = vi.fn((update: () => void) => { update(); return { ready: Promise.resolve() } })
    Object.assign(document, { startViewTransition: start })
    setThemePreference('dark', { x: 100, y: 40 })
    expect(start).toHaveBeenCalledTimes(1)
    expect(theme()).toBe('dark')
    await Promise.resolve()
    await Promise.resolve()
    expect(animate).toHaveBeenCalledWith(
      { clipPath: [expect.stringContaining('circle(0px at 100px 40px)'), expect.stringMatching(/^circle\(\d+(\.\d+)?px at 100px 40px\)$/)] },
      expect.objectContaining({ pseudoElement: '::view-transition-new(root)' }),
    )
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('sin View Transitions funde los colores un instante', () => {
    vi.useFakeTimers()
    setThemePreference('dark')
    expect(document.documentElement).toHaveClass('theme-fading')
    vi.advanceTimersByTime(500)
    expect(document.documentElement).not.toHaveClass('theme-fading')
    vi.useRealTimers()
  })

  it('con movimiento reducido, o si el tema visible no cambia, se aplica sin animación', () => {
    reduceMotion = true
    setThemePreference('dark')
    expect(theme()).toBe('dark')
    expect(document.documentElement).not.toHaveClass('theme-fading')
    reduceMotion = false
    setThemePreference('dark')
    expect(document.documentElement).not.toHaveClass('theme-fading')
  })
})

