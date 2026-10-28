import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { OPPORTUNITY_CONTACT_MESSAGE } from '../opportunities/OpportunityForm'
import { createLinkageRequest } from './api'

const fetchMock = vi.fn<typeof fetch>()
const linkageMock = vi.fn<typeof fetch>()
let options: unknown[]
const user = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const profile = {
  public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6,
  institution: 'UT del Golfo', state_code: '28', municipality: 'Matamoros', distance_km: 80,
  skills: [{ name: 'Python', kind: 'technical' }], languages: [], verified_certifications: 0, dual_available: true, can_relocate: false,
  certifications: [], projects: [],
}
const created = {
  id: 41, status: 'PENDIENTE_INSTITUCION', student_public_id: publicId, opportunity: { id: 12, title: 'Automatización de línea' },
  message: 'Nos interesa su perfil.', created_at: '2026-10-28T10:00:00Z',
}

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
const posts = () => linkageMock.mock.calls.filter(([, init]) => init?.method === 'POST')

beforeEach(() => {
  options = [{ id: 12, title: 'Automatización de línea', program: 'Mecatrónica', municipality: 'Reynosa' }, { id: 13, title: 'Calidad', program: 'Industrial', municipality: null }]
  linkageMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (path === `/api/talent/${publicId}`) return Response.json({ data: profile })
    if (path === '/api/opportunities/options') return Response.json({ data: options })
    return linkageMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function openSheet() {
  render(<MemoryRouter initialEntries={[`/talent/${publicId}`]}><App /><Location /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar vinculación' }))
  return screen.findByRole('dialog', { name: 'Solicitar vinculación' })
}

describe('solicitud de vinculación HU-S5-04', () => {
  it('no consulta las oportunidades hasta abrir la hoja', async () => {
    render(<MemoryRouter initialEntries={[`/talent/${publicId}`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Solicitar vinculación' })
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/opportunities/options')).toBe(false)
  })

  it('elige una oportunidad activa, envía la solicitud directa y confirma (CA-02, CA-04, CA-06)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ data: created }, { status: 201 }))
    const sheet = await openSheet()
    expect(within(sheet).getByText(/llega directamente a la institución del alumno/)).toBeInTheDocument()
    const select = await within(sheet).findByLabelText('Oportunidad')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Selecciona…', 'Automatización de línea · Reynosa', 'Calidad'])
    fireEvent.change(select, { target: { value: '12' } })
    fireEvent.change(within(sheet).getByLabelText('Mensaje para la institución (opcional)'), { target: { value: '  Nos interesa su perfil. ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))

    expect(await within(sheet).findByRole('status')).toHaveTextContent('Solicitud enviada a la institución del alumno para «Automatización de línea». Queda pendiente de su respuesta.')
    expect(posts()[0][0]).toBe('/api/linkage-requests')
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ student_public_id: publicId, opportunity_id: 12, message: 'Nos interesa su perfil.' })
    expect(select).toHaveValue('')
    expect(within(sheet).getByLabelText('Mensaje para la institución (opcional)')).toHaveValue('')
  })

  it('sin oportunidades activas ofrece registrar una (CA-06)', async () => {
    options = []
    const sheet = await openSheet()
    expect(await within(sheet).findByText(/aún no tiene oportunidades activas/)).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Registrar una oportunidad' })).toHaveAttribute('href', '/opportunities/new')
    expect(within(sheet).queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument()
  })

  it('valida en línea y no envía con errores (CA-02)', async () => {
    const sheet = await openSheet()
    const message = await within(sheet).findByLabelText('Mensaje para la institución (opcional)')
    fireEvent.change(message, { target: { value: 'Escríbenos a rh@manugolfo.mx' } })
    fireEvent.blur(message)
    expect(message).toHaveAccessibleDescription(new RegExp(OPPORTUNITY_CONTACT_MESSAGE.slice(0, 30)))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    expect(within(sheet).getByLabelText('Oportunidad')).toHaveAccessibleDescription('Elige una de tus oportunidades activas.')
    expect(posts()).toHaveLength(0)
  })

  it('muestra junto a la oportunidad el rechazo del servidor por duplicada o inactiva (CA-03)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: {
      opportunity_id: ['Ya enviaste una solicitud para este perfil en esa oportunidad.'],
    } }, { status: 422 }))
    const sheet = await openSheet()
    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '12' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(within(sheet).getByLabelText('Oportunidad')).toHaveAccessibleDescription('Ya enviaste una solicitud para este perfil en esa oportunidad.'))
  })

  it('informa que el perfil ya no está disponible (CA-03)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ message: 'El perfil no existe.' }, { status: 404 }))
    const sheet = await openSheet()
    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '13' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('El perfil no existe.')
  })

  it('el cliente conserva solo los campos del contrato (CA-05)', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    linkageMock.mockResolvedValueOnce(Response.json({ data: { ...created, student_id: 7, institution_id: 2 } }, { status: 201 }))
    const result = await createLinkageRequest({ student_public_id: publicId, opportunity_id: 12, message: null })
    expect(result).not.toHaveProperty('student_id')
    expect(result).not.toHaveProperty('institution_id')
    expect(result.student_public_id).toBe(publicId)
  })
})
