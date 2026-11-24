/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// T-S18-03: favicon con el isotipo de Nodologístico, generado por scripts/brand/build-favicons.py.
const ROOT = process.cwd()
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(join(ROOT, 'public', path))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('favicon', () => {
  it('index.html enlaza el ícono multitamaño, el PNG y el de iOS, todos del mismo origen', () => {
    expect(head).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />')
    expect(head).toContain('<link rel="icon" href="/favicon.png" type="image/png" sizes="192x192" />')
    expect(head).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  })

  it('los archivos existen con los tamaños declarados', () => {
    expect(pngSize('favicon.png')).toEqual([192, 192])
    expect(pngSize('apple-touch-icon.png')).toEqual([180, 180])
    const ico = readFileSync(join(ROOT, 'public', 'favicon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1) // tipo ícono
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256)
    expect(sizes).toEqual([16, 32, 48])
  })
})

// T-S18-05: los correos cargan el logo desde <FRONTEND_URL>/brand/logo-correo.png (config('mail.logo_url') en el backend).
// Caddy responde con el index.html de la SPA a una ruta inexistente, así que un archivo movido rompería la imagen sin 404.
describe('logo de los correos', () => {
  it('existe en public/brand con el nombre que usa la plantilla, a 2× de los 64 px con que se muestra', () => {
    const [width, height] = pngSize('brand/logo-correo.png')
    expect(height).toBe(128)
    expect(width).toBeGreaterThan(90)
    expect(width).toBeLessThan(130)
  })
})
