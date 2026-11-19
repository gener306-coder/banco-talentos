import { describe, expect, it } from 'vitest'
import { fieldLabel } from './api'

// HU-S14-04: nombres legibles de los campos que cambiaron, con respaldo seguro.
describe('fieldLabel', () => {
  it('traduce los campos del perfil y del contacto', () => {
    expect(fieldLabel('trade_name', 'company')).toBe('Nombre comercial')
    expect(fieldLabel('contact_position', 'company')).toBe('Puesto del contacto')
    expect(fieldLabel('sector_code', 'company')).toBe('Sector económico')
    expect(fieldLabel('cct', 'institution')).toBe('Clave de Centro de Trabajo')
  })

  it('distingue el nombre de una cuenta del nombre oficial de una institución', () => {
    expect(fieldLabel('name', 'user')).toBe('Nombre')
    expect(fieldLabel('name', 'institution')).toBe('Nombre oficial')
  })

  it('no expone el nombre técnico de un campo desconocido ni hereda propiedades del objeto', () => {
    expect(fieldLabel('password', 'user')).toBe('Otro dato')
    expect(fieldLabel('toString', 'company')).toBe('Otro dato')
  })
})
