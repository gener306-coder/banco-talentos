import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const institutionUser = { id: 4, name: 'Coordinación dual', email: 'dual@utgolfo.edu.mx', role: 'INSTITUTION', institution: { id: 2, name: 'UT del Golfo' }, company: null }
const student = {
  id: 7, enrollment_number: 'MAT-0001', given_names: 'Ana Sofía', first_surname: 'García', second_surname: 'López',
  is_active: true, program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6,
}
const pending = {
  id: 41, status: 'PENDIENTE_INSTITUCION', created_at: '2026-10-28T10:00:00Z',
  company: { name: 'ManuGolfo', municipality: 'Victoria' },
  opportunity: { id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2 },
  student,
}
const accepted = { ...pending, id: 40, status: 'ACEPTADA', company: { name: 'Aceros del Norte', municipality: null } }
const detail = {
  ...pending,
  message: 'Nos interesa su perfil.',
  company: {
    name: 'ManuGolfo', municipality: 'Victoria', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', trade_name: 'ManuGolfo',
    sector_code: '54', state_code: '28', contact_name: 'Laura Méndez', contact_email: 'dual@manugolfo.mx', contact_phone: '(833) 123-4567',
  },
  opportunity: {
    id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2, period_type: 'semester', period_number: 5,
    can_relocate: true, state_code: '28', municipality: 'Reynosa', description: 'Actividades del proyecto.',
    skills: [{ name: 'Python', kind: 'technical' }], language_code: 'en', min_level: 3, is_active: true,
  },
  student: {
    ...student, dual_available: true, state_code: '28', municipality: 'Reynosa', can_relocate: false,
    social_security: { has_nss: true, has_document: true },
  },
}
const page = (items: unknown[], meta = {}) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20, ...meta } })

function renderApp(path = '/institution/linkage-requests') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

beforeEach(() => {
  user = institutionUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('bandeja institucional HU-S6-01', () => {
  it('ofrece la bandeja a INSTITUTION desde el inicio y la niega a otros roles (CA-01, CA-06)', async () => {
    const view = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Solicitudes de vinculación' })).toHaveAttribute('href', '/institution/linkage-requests')
    view.unmount()

    user = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
    renderApp('/institution/linkage-requests/41')
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar solicitudes de vinculación.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista alumno, empresa, oportunidad, fecha, estado y enlace al detalle (CA-04, CA-06)', async () => {
    apiMock.mockResolvedValueOnce(page([pending, accepted]))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación recibidas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests?page=1')
    const row = within(table).getByRole('row', { name: /ManuGolfo/ })
    expect(within(row).getByRole('rowheader')).toHaveTextContent('García López, Ana Sofía')
    expect(row).toHaveTextContent('MAT-0001 · Ingeniería en Datos · 6.º semestre')
    expect(row).toHaveTextContent('Tableros de producción')
    expect(row).toHaveTextContent('Victoria')
    expect(row).toHaveTextContent('Pendiente de la institución')
    expect(within(row).getByRole('link', { name: 'Ver la solicitud de ManuGolfo para García López, Ana Sofía' })).toHaveAttribute('href', '/institution/linkage-requests/41')
    expect(within(table).getByRole('row', { name: /Aceros del Norte/ })).toHaveTextContent('Aceptada')
  })

  it('filtra por estado y pagina (CA-03)', async () => {
    apiMock.mockResolvedValueOnce(page([pending], { last_page: 2, total: 21 }))
      .mockResolvedValueOnce(page([pending], { current_page: 2, last_page: 2, total: 21 }))
      .mockResolvedValueOnce(page([]))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /Siguiente/ }))
    expect(await screen.findByText('Página 2 de 2 · 21 solicitudes')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/institution/linkage-requests?page=2')

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'RECHAZADA' } })
    expect(await screen.findByText('Ninguna solicitud con ese estado.')).toBeInTheDocument()
    expect(apiMock.mock.calls[2][0]).toBe('/api/institution/linkage-requests?page=1&status=RECHAZADA')
  })

  it('explica la bandeja vacía', async () => {
    apiMock.mockResolvedValueOnce(page([]))
    renderApp()
    expect(await screen.findByText('Aún no has recibido solicitudes.')).toBeInTheDocument()
  })
})

describe('detalle de solicitud HU-S6-01', () => {
  it('muestra la identidad con enlace al expediente, la oportunidad y el contacto de la empresa (CA-05, CA-06)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
    renderApp('/institution/linkage-requests/41')
    const studentSection = await screen.findByRole('region', { name: 'Alumno solicitado' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests/41')
    expect(studentSection).toHaveTextContent('Ana Sofía García López')
    expect(studentSection).toHaveTextContent('MAT-0001')
    expect(within(studentSection).getByRole('link', { name: /Ver expediente del alumno/ })).toHaveAttribute('href', '/students/7')
    expect(screen.getByText('Nos interesa su perfil.')).toBeInTheDocument()

    const security = screen.getByRole('region', { name: 'Seguro Facultativo (IMSS)' })
    expect(security).toHaveTextContent('Capturado')
    expect(security).toHaveTextContent('Cargado')
    expect(within(security).queryByRole('note')).not.toBeInTheDocument()

    const opportunity = screen.getByRole('region', { name: 'Oportunidad' })
    expect(opportunity).toHaveTextContent('Actividades del proyecto.')
    expect(opportunity).toHaveTextContent('5.º semestre o posterior')
    expect(within(opportunity).getByRole('list', { name: 'Habilidades requeridas' })).toHaveTextContent('Python')

    const company = screen.getByRole('region', { name: 'Empresa y contacto del programa dual' })
    expect(company).toHaveTextContent('Manufacturas del Golfo, S.A. de C.V.')
    expect(company).toHaveTextContent('Laura Méndez')
    expect(within(company).getByRole('link', { name: 'dual@manugolfo.mx' })).toHaveAttribute('href', 'mailto:dual@manugolfo.mx')
    expect(within(company).getByRole('link', { name: '(833) 123-4567' })).toHaveAttribute('href', 'tel:8331234567')
  })

  it.each([
    [{ has_nss: false, has_document: true }, 'Al alumno le falta el NSS.'],
    [{ has_nss: true, has_document: false }, 'Al alumno le falta el comprobante de vigencia del IMSS.'],
    [{ has_nss: false, has_document: false }, 'Al alumno le falta el NSS y el comprobante de vigencia del IMSS.'],
  ])('avisa lo que falta del Seguro Facultativo con enlace al expediente (CA-06)', async (socialSecurity, text) => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, student: { ...detail.student, social_security: socialSecurity } } }))
    renderApp('/institution/linkage-requests/41')
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(text)
    expect(within(note).getByRole('link', { name: 'expediente' })).toHaveAttribute('href', '/students/7')
  })

  it('responde a una solicitud ajena o inexistente con el 404 del servidor (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'La solicitud no existe.' }, { status: 404 }))
    renderApp('/institution/linkage-requests/999')
    expect(await screen.findByText('No encontramos esta solicitud')).toBeInTheDocument()
    expect(screen.getByText('La solicitud no existe.')).toBeInTheDocument()
  })
})
