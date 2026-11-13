/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// T-S12-04: en los textos de la interfaz, los nombres y las etiquetas van en negritas (<strong>, .notice-subject) y las
// citas literales y los ejemplos, entre “ ”. Las comillas angulares solo quedan en los comentarios del código.
const SRC = join(process.cwd(), 'src')
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'test' ? [] : files(path)
  return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
})

/** Quita comentarios de bloque, de JSX y de línea (sin confundir «https://» con un comentario). */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('textos de la interfaz', () => {
  it.each(files(SRC).map((path) => [relative(SRC, path), path]))('%s no usa comillas angulares para referenciar textos', (_name, path) => {
    const offenders = withoutComments(readFileSync(path, 'utf8')).split('\n').filter((line) => /[«»]/.test(line)).map((line) => line.trim())
    expect(offenders).toEqual([])
  })
})
