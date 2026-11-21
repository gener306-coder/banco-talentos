import { describe, expect, it } from 'vitest'
import { byRegime, dataProtectionLaw, footerOwner, formatLegalDate, legalConfig, missingLegalFields } from './legalConfig'
import { completeLegalConfig } from './testing'

describe('configuración legal HU-S15-01 y T-S15-02', () => {
  it('es publicable por defecto: responsable operativo y datos jurídicos opcionales vacíos', () => {
    expect(legalConfig.controller.name).toBe('Administración del Banco de Talentos')
    expect(legalConfig.programName).toBe('Banco de Talentos – Educación Dual')
    expect(legalConfig.regime).toBeNull()
    expect(legalConfig.processors).toEqual([])
    expect(JSON.stringify(legalConfig)).not.toMatch(/Pendiente de definir/i)
  })

  it('missingLegalFields lista los datos jurídicos vacíos, solo para revisiones internas', () => {
    expect(missingLegalFields()).toEqual([
      'regime', 'controller.address', 'dataProtection.channelName', 'dataProtection.email', 'dataProtection.responseTerm',
      'authority.name', 'jurisdiction.governingLaw', 'jurisdiction.courts', 'processors',
    ])
    expect(missingLegalFields(completeLegalConfig)).toEqual([])
  })

  it('elige el texto y el marco según el régimen', () => {
    const variants = { public_entity: 'público', private_entity: 'particular', pending: 'pendiente' }
    expect(byRegime({ regime: 'public_entity' }, variants)).toBe('público')
    expect(byRegime({ regime: 'private_entity' }, variants)).toBe('particular')
    expect(byRegime({ regime: null }, variants)).toBe('pendiente')
    expect(dataProtectionLaw({ regime: 'public_entity' })).toContain('Sujetos Obligados')
    expect(dataProtectionLaw({ regime: 'private_entity' })).toContain('Particulares')
    expect(dataProtectionLaw({ regime: null })).toBe('los principios y la legislación vigentes en México en materia de protección de datos personales')
  })

  it('el footer no repite el programa si no hay un nombre corto distinto', () => {
    expect(footerOwner()).toBe('Banco de Talentos – Educación Dual')
    expect(footerOwner({ ...legalConfig, controller: { ...legalConfig.controller, shortName: 'Banco de Talentos – Educación Dual' } })).toBe('Banco de Talentos – Educación Dual')
    expect(footerOwner(completeLegalConfig)).toBe('Operadora Dual · Banco de Talentos – Educación Dual')
  })

  it('escribe la fecha en español sin desfase por zona horaria', () => {
    expect(formatLegalDate('2026-11-20')).toBe('20 de noviembre de 2026')
  })
})
