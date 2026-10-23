import { describe, expect, it } from 'vitest'
import { ECONOMIC_SECTORS, isValidPhone, isValidRfc, normalizeRfc, sectorName } from './catalogs'

describe('catálogos de empresas HU-S4-02', () => {
  it('copia los 20 sectores SCIAN del backend, con la notación de los sectores compuestos (CA-04)', () => {
    expect(ECONOMIC_SECTORS.map((sector) => sector.code)).toEqual([
      '11', '21', '22', '23', '31-33', '43', '46', '48-49', '51', '52', '53', '54', '55', '56', '61', '62', '71', '72', '81', '93',
    ])
    expect(sectorName('31-33')).toBe('Industrias manufactureras')
  })

  it.each(['MGO150320AB1', 'HEGL850101AB3', 'ÑAM000229XY9', 'A&B991231ZZ0'])('acepta el RFC %s (CA-03)', (rfc) => {
    expect(isValidRfc(rfc)).toBe(true)
  })

  it.each(['MGO150320AB', 'MGOX150320AB12', 'MGO151320AB1', 'MGO150230AB1', 'MG-150320AB1', 'XAXX010101000', 'XEXX010101000', 'mgo150320ab1'])(
    'rechaza el RFC %s', (rfc) => {
      expect(isValidRfc(rfc)).toBe(false)
    })

  it('normaliza el RFC a mayúsculas sin espacios', () => {
    expect(normalizeRfc('  mgo150320ab1 ')).toBe('MGO150320AB1')
  })

  it('valida el teléfono con 10 a 15 dígitos', () => {
    expect(isValidPhone('+52 (899) 123-4567')).toBe(true)
    expect(isValidPhone('899 123 45')).toBe(false)
    expect(isValidPhone('899-CALL-NOW')).toBe(false)
  })
})
