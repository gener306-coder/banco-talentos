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

// Valores de @theme (marca) y de Tailwind (blanco y neutros acromáticos en OKLCH) que usan los bloques de tokens.
const tailwindTheme = readFileSync(join(process.cwd(), 'node_modules/tailwindcss/theme.css'), 'utf8')
const palette = new Map<string, string>([
  ...[...index.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, value]) => [name, value] as [string, string]),
  ...[...tailwindTheme.matchAll(/--color-(white|neutral-\d+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()] as [string, string]),
])
const ui = sheets.find(([path]) => path === 'ui/ui.css')![1]
// Mezclas de ui.css que dependen del tema: --tint, --tint-hover y --fill.
const mixes = new Map([...ui.matchAll(/(--(?:tint|tint-hover|fill)):\s*(color-mix\([^;]+\));/g)].map(([, name, value]) => [name, value]))

type Rgba = [number, number, number, number]
const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const toGamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055

/** Convierte un valor de los bloques de tokens (HEX, rgb(), oklch acromático, var() o color-mix en sRGB) a RGBA 0–1. */
function resolve(theme: Map<string, string>, value: string): Rgba {
  const v = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).concat(1) as Rgba
  }
  if (v === 'transparent') return [0, 0, 0, 0]
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(v)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, Number(rgb[4])]
  const oklch = /^oklch\(([\d.]+)% 0 none\)$/.exec(v)
  if (oklch) { const g = toGamma((Number(oklch[1]) / 100) ** 3); return [g, g, g, 1] }
  const color = /^var\(--color-([a-z0-9-]+)\)$/.exec(v)
  if (color) return resolve(theme, palette.get(color[1])!)
  const token = /^var\((--[a-z0-9-]+)\)$/.exec(v)
  if (token) return resolve(theme, theme.get(token[1]) ?? mixes.get(token[1])!)
  const mix = /^color-mix\(in srgb, (.+) ([\d.]+)%, (.+)\)$/.exec(v)
  if (mix) {
    const [a, p, b] = [resolve(theme, mix[1]), Number(mix[2]) / 100, resolve(theme, mix[3])]
    const alpha = a[3] * p + b[3] * (1 - p)
    const channel = (i: number) => alpha === 0 ? 0 : (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha
    return [channel(0), channel(1), channel(2), alpha]
  }
  throw new Error(`Valor de color no reconocido: ${v}`)
}

/** Pinta capas de abajo hacia arriba (la primera debe ser opaca). */
const paint = (layers: Rgba[]) => layers.reduce((under, [r, g, b, a]) =>
  [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a), 1] as Rgba)

/** Contraste WCAG 2 entre dos colores opacos. */
function contrast(a: Rgba, b: Rgba): number {
  const luminance = ([r, g, bl]: Rgba) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(bl)
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

/** Contraste de un token de primer plano (con opacidad opcional) sobre una pila de fondos de un tema. */
function contrastOn(theme: Map<string, string>, foreground: string, backgrounds: string[], opacity = 1): number {
  const background = paint(backgrounds.map((value) => resolve(theme, value.startsWith('--') ? `var(${value})` : value)))
  const [r, g, b, a] = resolve(theme, `var(${foreground})`)
  return contrast(paint([background, [r, g, b, a * opacity]]), background)
}

/** Recorre una hoja sin comentarios: cada regla con los preludios que la contienen y cada declaración con su regla. */
function walk(css: string, onRule: (prelude: string, ancestors: string[]) => void, onDeclaration: (text: string, ancestors: string[]) => void) {
  const stack: string[] = []
  let buffer = ''
  for (const char of withoutComments(css)) {
    if (char === '{') { onRule(buffer.trim(), [...stack]); stack.push(buffer.trim()); buffer = '' }
    else if (char === ';' || char === '}') {
      if (buffer.trim()) onDeclaration(buffer.trim(), [...stack])
      if (char === '}') stack.pop()
      buffer = ''
    } else buffer += char
  }
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

const light = tokens(LIGHT_BLOCK)
const dark = tokens(DARK_BLOCK)
const themes = [['claro', light], ['oscuro', dark]] as const

describe('tema oscuro', () => {
  it('redefine exactamente los mismos tokens que el tema claro', () => {
    expect(dark.size).toBeGreaterThan(0)
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort())
  })

  it('el filete vino aclarado separa el botón vino del fondo oscuro (≥ 3:1)', () => {
    expect(contrastOn(dark, '--accent', ['--surface'])).toBeGreaterThanOrEqual(3)
  })
})

describe.each(themes)('contraste en el tema %s', (_name, theme) => {
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
    ['--on-media', '--media-backdrop', 4.5],
    ['--ink', '--surface', 4.5],
    ['--ink', '--surface-muted', 4.5],
    ['--on-danger', '--danger-border', 4.5],
    ['--on-inverse', '--inverse-surface', 4.5],
    ['--focus-ring', '--surface-muted', 3],
  ] as const)('%s sobre %s alcanza %s:1', (foreground, background, minimum) => {
    expect(contrastOn(theme, foreground, [background])).toBeGreaterThanOrEqual(minimum)
  })

  // Combinaciones con mezclas y opacidades de ui.css (T-S12-01): primer plano, pila de fondos, opacidad y umbral.
  it.each([
    ['pastilla, etiqueta y encabezado de tabla', '--accent', ['--surface', '--tint'], 1, 4.5],
    ['tarea del inicio sobre el fondo de la página', '--accent', ['--surface-muted', '--tint'], 1, 4.5],
    ['pastilla con el cursor', '--accent', ['--surface', '--tint-hover'], 1, 4.5],
    ['pastilla con el cursor sobre el fondo de la página', '--accent', ['--surface-muted', '--tint-hover'], 1, 4.5],
    ['etiqueta suave (.chip.soft)', '--accent-secondary-text', ['--surface', 'color-mix(in srgb, var(--accent-secondary) 18%, transparent)'], 1, 4.5],
    ['etiqueta suave con el cursor', '--accent-secondary-text', ['--surface', 'color-mix(in srgb, var(--accent-secondary) 26%, transparent)'], 1, 4.5],
    ['texto de un aviso informativo (.callout.info, T-S12-04)', '--text', ['--surface', '--tint'], 1, 4.5],
    ['texto secundario de la opción activa (.option-meta)', '--text', ['--surface', '--tint'], 0.9, 4.5],
    ['texto secundario de la opción con el cursor', '--text', ['--surface', '--fill'], 0.9, 4.5],
    ['ícono del campo (.input-with-icon)', '--text', ['--surface'], 0.7, 3],
    ['ícono para quitar una etiqueta (.chip-remove)', '--accent', ['--surface', '--tint'], 0.7, 3],
  ] as const)('%s: %s alcanza el umbral', (_label, foreground, backgrounds, opacity, minimum) => {
    expect(contrastOn(theme, foreground, [...backgrounds], opacity)).toBeGreaterThanOrEqual(minimum)
  })

  it('los títulos (--ink) nunca tienen menos contraste que el cuerpo (--text)', () => {
    expect(contrastOn(theme, '--ink', ['--surface'])).toBeGreaterThanOrEqual(contrastOn(theme, '--text', ['--surface']))
  })
})

describe('cascada, cursor y escala tipográfica (T-S12-01, T-S12-02)', () => {
  const styled = sheets.filter(([path]) => path !== 'layers.css')

  it.each(styled)('%s declara sus reglas dentro de una capa', (_path, css) => {
    const unlayered: string[] = []
    walk(css, (prelude, ancestors) => {
      if (!/^@(layer|theme)\b/.test(prelude) && !ancestors.some((a) => a.startsWith('@layer') || a.startsWith('@theme'))) unlayered.push(prelude)
    }, (text, ancestors) => {
      if (ancestors.length === 0 && !/^@(import|layer)\b/.test(text)) unlayered.push(text)
    })
    expect(unlayered).toEqual([])
  })

  it.each(styled)('%s solo aplica :hover con puntero (@media (hover: hover))', (_path, css) => {
    const offenders: string[] = []
    walk(css, (prelude, ancestors) => {
      if (prelude.includes(':hover') && !ancestors.some((a) => /@media[^{]*\(hover:\s*hover\)/.test(a))) offenders.push(prelude)
    }, () => {})
    expect(offenders).toEqual([])
  })

  it.each(styled)('%s toma los tamaños de letra de la escala --type-*', (_path, css) => {
    const offenders: string[] = []
    walk(css, () => {}, (text) => {
      const size = /^font-size:\s*(.+)$/.exec(text)?.[1]
      if (size && !/^var\(--type-[a-z0-9]+\)$/.test(size) && !size.startsWith('clamp(')) offenders.push(size)
    })
    expect(offenders).toEqual([])
  })
})
