import { describe, expect, it } from 'vitest'
import { linkageAvailability } from './availability'

const option = (id: number, title: string) => ({ id, title, program: 'Ingeniería', municipality: null })
const sent = (id: number, status: 'PENDIENTE_INSTITUCION' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA') => ({ status, opportunity: { id } })

describe('disponibilidad de oportunidades para solicitar un perfil (T-S12-07)', () => {
  const options = [option(1, 'Automatización'), option(2, 'Calidad'), option(3, 'Mantenimiento')]

  it('sin solicitudes, todas las oportunidades activas se pueden elegir', () => {
    expect(linkageAvailability(options, [])).toMatchObject({ eligible: 3 })
  })

  it('pendiente, aceptada y rechazada bloquean solo su oportunidad', () => {
    const result = linkageAvailability(options, [sent(1, 'PENDIENTE_INSTITUCION'), sent(2, 'ACEPTADA')])
    expect(result.items.map((item) => item.blockedBy)).toEqual(['PENDIENTE_INSTITUCION', 'ACEPTADA', null])
    expect(result.eligible).toBe(1)
    expect(linkageAvailability(options, [sent(3, 'RECHAZADA')]).items[2].blockedBy).toBe('RECHAZADA')
  })

  it('una cancelada no bloquea: la empresa puede volver a solicitar esa oportunidad', () => {
    expect(linkageAvailability(options, [sent(1, 'CANCELADA')]).items[0].blockedBy).toBeNull()
  })

  it('con varias solicitudes para la misma oportunidad manda la más fuerte', () => {
    expect(linkageAvailability(options, [sent(1, 'CANCELADA'), sent(1, 'RECHAZADA')]).items[0].blockedBy).toBe('RECHAZADA')
    expect(linkageAvailability(options, [sent(1, 'RECHAZADA'), sent(1, 'PENDIENTE_INSTITUCION')]).items[0].blockedBy).toBe('PENDIENTE_INSTITUCION')
  })

  it('ignora solicitudes de oportunidades que ya no están activas', () => {
    expect(linkageAvailability(options, [sent(9, 'PENDIENTE_INSTITUCION')])).toMatchObject({ eligible: 3 })
  })
})
