/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// HU-S15-01, CA-08: el INAI se extinguió con la reforma de 2025; ningún texto de la interfaz lo menciona.
const SRC = join(process.cwd(), 'src')
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return files(path)
  return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
})
const FORBIDDEN = /\bINAI\b|Instituto Nacional de Transparencia/i

describe('autoridad garante vigente', () => {
  it.each(files(SRC).map((path) => [relative(SRC, path), path]))('%s no menciona al INAI', (_name, path) => {
    expect(readFileSync(path, 'utf8')).not.toMatch(FORBIDDEN)
  })
})
