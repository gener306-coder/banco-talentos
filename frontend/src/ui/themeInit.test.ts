/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// T-S17-03: la CSP del servidor solo admite script-src 'self'. El tema se fija antes del primer pintado con un archivo
// estático, no con un script en línea.
const ROOT = process.cwd()
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const source = readFileSync(join(ROOT, 'public', 'theme-init.js'), 'utf8')

function runThemeInit(stored: string | null | Error, systemDark = false) {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    if (stored instanceof Error) throw stored
    return stored
  })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: systemDark && query === '(prefers-color-scheme: dark)' }))
  delete document.documentElement.dataset.theme
  new Function(source)()
  return document.documentElement.dataset.theme
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('script inicial de tema', () => {
  it('index.html no tiene scripts en línea', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [, attributes, body] of scripts) {
      expect(attributes).toMatch(/\bsrc="\/[^"]+"/)
      expect(body.trim()).toBe('')
    }
  })

  it('carga theme-init.js en <head>, como script clásico y antes de la aplicación', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
    expect(head).toContain('<script src="/theme-init.js"></script>')
    expect(head).not.toMatch(/theme-init\.js"[^>]*\b(type="module"|async|defer)\b/)
    expect(html.indexOf('/theme-init.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })

  it.each([
    [null, false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['otro', true, 'light'],
  ] as const)('con la preferencia %s y el sistema oscuro=%s fija data-theme=%s', (stored, systemDark, expected) => {
    expect(runThemeInit(stored, systemDark)).toBe(expected)
  })

  it('usa el tema claro si el almacenamiento está bloqueado', () => {
    expect(runThemeInit(new DOMException('bloqueado', 'SecurityError'), true)).toBe('light')
  })
})
