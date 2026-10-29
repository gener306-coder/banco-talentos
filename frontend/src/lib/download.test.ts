import { describe, expect, it } from 'vitest'
import { csvName } from './download'

describe('csvName (HU-S7-02)', () => {
  it('completa el prefijo con la fecha local en formato AAAA-MM-DD', () => {
    expect(csvName('reporte-educacion-dual', new Date(2026, 0, 5, 23, 30))).toBe('reporte-educacion-dual-2026-01-05.csv')
  })
})
