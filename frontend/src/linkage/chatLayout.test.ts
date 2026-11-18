import { describe, expect, it } from 'vitest'
import { dayLabel, initials, layoutThread } from './chatLayout'
import type { Bubble } from './chatLayout'

// T-S13-07: agrupación del hilo por día y por remitente.
const now = new Date(2026, 10, 17, 18, 0)
const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).toISOString()
const bubble = (key: string, own: boolean, createdAt: string, extra: Partial<Bubble> = {}): Bubble =>
  ({ key, own, name: own ? 'Reclutadora' : 'UT del Golfo', createdAt, body: key, ...extra })
const positions = (bubbles: Bubble[]) => layoutThread(bubbles, now).map((day) => day.bubbles.map((item) => `${item.key}:${item.position}`))

describe('dayLabel', () => {
  it('nombra hoy, ayer y los demás días, con el año solo si es otro', () => {
    expect(dayLabel(new Date(2026, 10, 17, 8), now)).toBe('Hoy')
    expect(dayLabel(new Date(2026, 10, 16, 23, 59), now)).toBe('Ayer')
    expect(dayLabel(new Date(2026, 10, 12, 9), now)).toBe('12 nov')
    expect(dayLabel(new Date(2025, 11, 31, 9), now)).toBe('31 dic 2025')
  })

  it('reconoce «ayer» también al cambiar de mes', () => {
    expect(dayLabel(new Date(2026, 9, 31, 10), new Date(2026, 10, 1, 9))).toBe('Ayer')
  })
})

describe('initials', () => {
  it('toma las dos primeras palabras significativas de la organización', () => {
    expect(initials('UT del Golfo')).toBe('UG')
    expect(initials('Universidad Tecnológica de Victoria')).toBe('UT')
    expect(initials('Manufacturas del Golfo, S.A. de C.V.')).toBe('MG')
    expect(initials('ManuGolfo')).toBe('M')
    expect(initials('  ')).toBe('?')
  })
})

describe('layoutThread', () => {
  it('agrupa los mensajes consecutivos del mismo remitente con menos de 5 minutos entre sí', () => {
    expect(positions([
      bubble('a', true, at(17, 10, 0)), bubble('b', true, at(17, 10, 2)), bubble('c', true, at(17, 10, 6)),
      bubble('d', false, at(17, 10, 7)),
    ])).toEqual([['a:first', 'b:middle', 'c:last', 'd:single']])
  })

  it('corta el grupo si pasan 5 minutos o más, aunque sea el mismo remitente', () => {
    expect(positions([bubble('a', false, at(17, 9, 0)), bubble('b', false, at(17, 9, 5)), bubble('c', false, at(17, 9, 9))]))
      .toEqual([['a:single', 'b:first', 'c:last']])
  })

  it('separa por día con su etiqueta y no agrupa entre días', () => {
    const days = layoutThread([bubble('a', true, at(16, 23, 58)), bubble('b', true, at(17, 0, 1))], now)
    expect(days.map((day) => day.label)).toEqual(['Ayer', 'Hoy'])
    expect(days.map((day) => day.bubbles[0].position)).toEqual(['single', 'single'])
  })

  it('distingue cuentas distintas del mismo lado', () => {
    expect(positions([bubble('a', true, at(17, 10, 0)), bubble('b', true, at(17, 10, 1), { name: 'Recursos Humanos' })]))
      .toEqual([['a:single', 'b:single']])
  })

  it('nunca agrupa las burbujas de la solicitud con los mensajes del hilo', () => {
    expect(positions([
      bubble('pitch', true, at(17, 10, 0), { label: 'Mensaje de la solicitud' }), bubble('a', true, at(17, 10, 1)), bubble('b', true, at(17, 10, 2)),
    ])).toEqual([['pitch:single', 'a:first', 'b:last']])
  })

  it('devuelve un hilo vacío sin días', () => {
    expect(layoutThread([], now)).toEqual([])
  })
})
