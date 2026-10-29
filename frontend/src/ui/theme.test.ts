import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getThemePreference, setThemePreference, THEME_STORAGE_KEY, useThemePreference, watchTheme } from './theme'

let systemDark = false
const mediaListeners = new Set<() => void>()

beforeEach(() => {
  systemDark = false
  mediaListeners.clear()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query === '(prefers-color-scheme: dark)' && systemDark },
    media: query,
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  }))
})
afterEach(() => vi.unstubAllGlobals())

const theme = () => document.documentElement.dataset.theme

describe('modo oscuro: preferencia de tema', () => {
  it('sigue al sistema por defecto', () => {
    expect(getThemePreference()).toBe('system')
    applyTheme()
    expect(theme()).toBe('light')
    systemDark = true
    applyTheme()
    expect(theme()).toBe('dark')
  })

  it('guarda una elección explícita y la borra al volver a «Sistema»', () => {
    systemDark = true
    setThemePreference('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(theme()).toBe('light')

    setThemePreference('dark')
    expect(theme()).toBe('dark')

    setThemePreference('system')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(theme()).toBe('dark')
  })

  it('con «Sistema» reacciona al cambio del sistema operativo; con una elección explícita, no', () => {
    const stop = watchTheme()
    expect(theme()).toBe('light')
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

  it('sin almacenamiento disponible sigue al sistema y no falla', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    systemDark = true
    expect(getThemePreference()).toBe('system')
    expect(() => setThemePreference('light')).not.toThrow()
    expect(theme()).toBe('light')
    vi.restoreAllMocks()
  })

  it('el hook expone la preferencia y la actualiza', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current[0]).toBe('system')
    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')
    expect(theme()).toBe('dark')
  })
})
