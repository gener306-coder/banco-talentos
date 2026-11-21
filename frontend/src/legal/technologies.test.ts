/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { browserTechnologies } from './technologies'

// HU-S15-02, CA-04: la política de cookies es verificable. Si un archivo empieza a usar almacenamiento del navegador,
// BroadcastChannel, service workers o cookies desde JavaScript, debe declararse en technologies.ts.
const ROOT = process.cwd()
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'test' ? [] : files(path)
  return /\.(tsx?|js)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
})
const USAGE = /\b(localStorage|sessionStorage|indexedDB|BroadcastChannel|document\.cookie|navigator\.serviceWorker|caches\.)/
const sources = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'public')), join(ROOT, 'index.html')]
  .filter((path) => !path.endsWith(join('legal', 'technologies.ts')))

describe('inventario de tecnologías del navegador', () => {
  it('declara cada archivo que usa almacenamiento, canales, service workers o cookies', () => {
    const declared = new Set(browserTechnologies.flatMap((technology) => technology.files))
    const users = sources.filter((path) => USAGE.test(readFileSync(path, 'utf8'))).map((path) => relative(ROOT, path))
    expect(users.filter((path) => !declared.has(path))).toEqual([])
  })

  it('cada archivo declarado existe y todavía usa la tecnología', () => {
    for (const path of new Set(browserTechnologies.flatMap((technology) => technology.files))) {
      expect(readFileSync(join(ROOT, path), 'utf8'), path).toMatch(USAGE)
    }
  })

  it('el service worker no guarda páginas ni recibe notificaciones push', () => {
    const worker = readFileSync(join(ROOT, 'public', 'notifications-sw.js'), 'utf8')
    expect(worker).not.toMatch(/addEventListener\(\s*['"](fetch|push)['"]/)
  })

  it('no hay terceros: index.html no carga recursos de otros dominios', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html).not.toMatch(/(src|href)=["']https?:\/\//)
  })
})
