/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest no procesa CSS (los imports devuelven texto vacío): las hojas se leen del disco.
const SRC = join(process.cwd(), 'src')
const files = (dir: string, extension: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name), extension) : entry.name.endsWith(extension) ? [join(dir, entry.name)] : [])
const sheets = files(SRC, '.css').map((path) => [relative(SRC, path), readFileSync(path, 'utf8')] as const)
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(?:black|white)(?![\w-])/gi

const index = sheets.find(([path]) => path === 'index.css')![1]
const LIGHT_BLOCK = /:root\s*\{([^}]*)\}\s*\/\* Fin de los tokens semánticos\. \*\//
const DARK_BLOCK = /:root\[data-theme='dark'\]\s*\{([^}]*)\}\s*\/\* Fin de los tokens del tema oscuro\. \*\//

/** Quita lo único que puede escribir valores de color: @theme y los bloques de tokens claro y oscuro de index.css. */
function withoutTokenDefinitions(path: string, css: string): string {
  if (path !== 'index.css') return css
  return css.replace(/@theme\s*\{[^}]*\}/, '').replace(LIGHT_BLOCK, '').replace(DARK_BLOCK, '')
}
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Tokens de un bloque: nombre → valor. */
function tokens(block: RegExp): Map<string, string> {
  const body = withoutComments(index.match(block)?.[1] ?? '')
  return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}

// Valores de @theme que el bloque oscuro reutiliza (los rellenos conservan el vino de marca).
const brand = new Map([...index.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, value]) => [`var(--color-${name})`, value]))
const hex = (value: string) => {
  const resolved = brand.get(value) ?? value
  const short = /^#([0-9a-f]{3})$/i.exec(resolved)
  return short ? `#${short[1].split('').map((c) => c + c).join('')}` : resolved
}

/** Contraste WCAG 2 entre dos colores HEX. */
function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex(color).slice(i, i + 2), 16) / 255)
      .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe('tokens semánticos de color', () => {
  it('lee todas las hojas de estilo', () => {
    expect(sheets.map(([path]) => path)).toEqual(expect.arrayContaining(['index.css', 'ui/ui.css', 'institutions/institutions.css']))
    expect(sheets.every(([, css]) => css.length > 0)).toBe(true)
  })

  it('define los tokens semánticos en index.css', () => {
    expect(index).toMatch(/--surface:[\s\S]*--danger-text:[\s\S]*\/\* Fin de los tokens semánticos\. \*\//)
  })

  it.each(sheets)('%s usa tokens en lugar de colores escritos a mano', (path, css) => {
    expect(withoutComments(withoutTokenDefinitions(path, css)).match(COLOR_LITERAL) ?? []).toEqual([])
  })

  it.each(sheets)('%s usa los tokens semánticos y no los colores de la marca directamente', (path, css) => {
    expect(withoutComments(withoutTokenDefinitions(path, css)).match(/var\(--color-[a-z0-9-]+\)/g) ?? []).toEqual([])
  })

  it('las vistas no fijan colores de la marca con utilidades de Tailwind, que ignorarían el tema oscuro', () => {
    const offenders = files(SRC, '.tsx').filter((path) => /\b(?:text|bg|border|ring|fill|stroke)-(?:brand|neutral|white|black)\b/.test(readFileSync(path, 'utf8')))
    expect(offenders.map((path) => relative(SRC, path))).toEqual([])
  })
})

describe('tema oscuro', () => {
  const light = tokens(LIGHT_BLOCK)
  const dark = tokens(DARK_BLOCK)

  it('redefine exactamente los mismos tokens que el tema claro', () => {
    expect(dark.size).toBeGreaterThan(0)
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort())
  })

  // Pares de primer plano y fondo con el umbral del proyecto (docs/design/identidad-visual.md, «Accesibilidad»).
  it.each([
    ['--text', '--surface', 4.5],
    ['--text', '--surface-muted', 4.5],
    ['--text-strong', '--surface', 4.5],
    ['--accent', '--surface', 4.5],
    ['--accent', '--surface-muted', 4.5],
    ['--accent-hover', '--surface', 4.5],
    ['--on-accent', '--accent-fill', 4.5],
    ['--on-accent', '--accent-fill-hover', 4.5],
    ['--danger-text', '--danger-surface', 4.5],
    ['--danger-text', '--surface', 4.5],
    ['--success-text', '--success-surface', 4.5],
    ['--status-off-text', '--status-off-surface', 4.5],
    ['--focus-ring', '--surface', 3],
    ['--border-strong', '--surface', 3],
  ] as const)('%s sobre %s alcanza %s:1', (foreground, background, minimum) => {
    expect(contrast(dark.get(foreground)!, dark.get(background)!)).toBeGreaterThanOrEqual(minimum)
  })

  it('el filete vino aclarado separa el botón vino del fondo oscuro (≥ 3:1)', () => {
    expect(contrast(dark.get('--accent')!, dark.get('--surface')!)).toBeGreaterThanOrEqual(3)
  })

})
