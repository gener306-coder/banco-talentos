/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest no procesa CSS (los imports devuelven texto vacío): las hojas se leen del disco.
const SRC = join(process.cwd(), 'src')
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.css') ? [join(dir, entry.name)] : [])
const sheets = files(SRC).map((path) => [relative(SRC, path), readFileSync(path, 'utf8')] as const)
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(?:black|white)(?![\w-])/gi

/** Quita lo único que puede escribir valores de color: @theme y el bloque de tokens semánticos de index.css. */
function withoutTokenDefinitions(path: string, css: string): string {
  if (path !== 'index.css') return css
  return css
    .replace(/@theme\s*\{[^}]*\}/, '')
    .replace(/:root\s*\{[^}]*\}\s*\/\* Fin de los tokens semánticos\. \*\//, '')
}
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('tokens semánticos de color', () => {
  it('lee todas las hojas de estilo', () => {
    expect(sheets.map(([path]) => path)).toEqual(expect.arrayContaining(['index.css', 'ui/ui.css', 'institutions/institutions.css']))
    expect(sheets.every(([, css]) => css.length > 0)).toBe(true)
  })

  it('define los tokens semánticos en index.css', () => {
    const index = sheets.find(([path]) => path === 'index.css')![1]
    expect(index).toMatch(/--surface:[\s\S]*--danger-text:[\s\S]*\/\* Fin de los tokens semánticos\. \*\//)
  })

  it.each(sheets)('%s usa tokens en lugar de colores escritos a mano', (path, css) => {
    expect(withoutComments(withoutTokenDefinitions(path, css)).match(COLOR_LITERAL) ?? []).toEqual([])
  })

  it.each(sheets)('%s usa los tokens semánticos y no los colores de la marca directamente', (path, css) => {
    expect(withoutComments(withoutTokenDefinitions(path, css)).match(/var\(--color-[a-z0-9-]+\)/g) ?? []).toEqual([])
  })
})
