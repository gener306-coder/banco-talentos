import { describe, expect, it } from 'vitest'
import { backState } from './backLink'

describe('regreso contextual (T-S12-04, T-S12-05)', () => {
  it('apunta a la vista de origen con su búsqueda, filtros y página', () => {
    expect(backState('Volver a empresas', { pathname: '/companies', search: '?q=golfo&page=2', state: null }))
      .toEqual({ back: { to: '/companies?q=golfo&page=2', label: 'Volver a empresas' } })
  })

  it('conserva el regreso del origen para recuperarlo al volver, sin arrastrar avisos', () => {
    const inbox = { to: '/institution/linkage-requests?status=PENDIENTE_INSTITUCION&page=2', label: 'Volver a solicitudes' }
    const fromDetail = backState('Volver a la solicitud', { pathname: '/institution/linkage-requests/41', search: '', state: { back: inbox, notice: 'Solicitud aceptada.' } })
    expect(fromDetail).toEqual({ back: { to: '/institution/linkage-requests/41', label: 'Volver a la solicitud', state: { back: inbox } } })
  })

  it('no conserva un regreso de origen inválido', () => {
    const state = { back: { to: '//sitio-ajeno.test', label: 'Volver' } }
    expect(backState('Volver a la solicitud', { pathname: '/institution/linkage-requests/41', search: '', state }).back).not.toHaveProperty('state')
  })
})
