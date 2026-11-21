import { describe, expect, it } from 'vitest'
import { byRegime, dataProtectionLaw, formatLegalDate, legalConfig, missingLegalFields, PENDING } from './legalConfig'
import type { LegalConfig } from './legalConfig'

const complete: LegalConfig = {
  regime: 'private_entity',
  controller: { name: 'Operadora Dual, S.A. de C.V.', shortName: 'Operadora Dual', address: 'Av. Reforma 1, Ciudad de México', website: null },
  dataProtection: { channelName: 'Área de datos personales', email: 'privacidad@example.test', phone: null, address: null, hours: null, responseTerm: '20 días hábiles' },
  authority: { name: 'Secretaría Anticorrupción y Buen Gobierno', website: null },
  jurisdiction: { governingLaw: 'las leyes federales de México', courts: 'los tribunales de la Ciudad de México' },
  processors: [{ name: 'Correo', purpose: 'Avisos.', location: 'México' }],
  version: '1.0',
  lastUpdated: '2026-11-20',
}

describe('configuración legal HU-S15-01', () => {
  it('nace con el régimen pendiente y lista cada dato por definir (D1)', () => {
    expect(legalConfig.regime).toBeNull()
    const missing = missingLegalFields()
    expect(missing).toEqual(expect.arrayContaining(['regime', 'controller.name', 'dataProtection.email', 'authority.name', 'jurisdiction.courts', 'processors[0].location']))
  })

  it('una configuración completa no tiene pendientes', () => {
    expect(missingLegalFields(complete)).toEqual([])
    expect(missingLegalFields({ ...complete, controller: { ...complete.controller, address: PENDING } })).toEqual(['controller.address'])
  })

  it('elige el texto y la ley según el régimen', () => {
    const variants = { public_entity: 'público', private_entity: 'particular', pending: 'pendiente' }
    expect(byRegime({ regime: 'public_entity' }, variants)).toBe('público')
    expect(byRegime({ regime: 'private_entity' }, variants)).toBe('particular')
    expect(byRegime({ regime: null }, variants)).toBe('pendiente')
    expect(dataProtectionLaw({ regime: 'public_entity' })).toContain('Sujetos Obligados')
    expect(dataProtectionLaw({ regime: 'private_entity' })).toContain('Particulares')
  })

  it('escribe la fecha en español sin desfase por zona horaria', () => {
    expect(formatLegalDate('2026-11-20')).toBe('20 de noviembre de 2026')
  })
})
