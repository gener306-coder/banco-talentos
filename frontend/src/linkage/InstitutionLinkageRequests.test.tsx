import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  responded_at: null,
  response_message: null,
  responded_by: null,
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
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
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
    // HU-S7-02: sin solicitudes no hay nada que exportar.
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument()
  })
})

describe('exportación CSV HU-S7-02', () => {
  it('descarga todas las solicitudes con el filtro de estado vigente (CA-02, CA-04)', async () => {
    const createObjectURL = vi.fn(() => 'blob:solicitudes')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const names: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    const csv = () => new Response(new Blob(['\uFEFFFolio'], { type: 'text/csv' }))
    apiMock.mockResolvedValueOnce(page([pending], { last_page: 2, total: 21 }))
      .mockResolvedValueOnce(csv())
      .mockResolvedValueOnce(page([accepted]))
      .mockResolvedValueOnce(csv())
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'Descargar CSV' }))
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(apiMock.mock.calls[1][0]).toBe('/api/institution/linkage-requests/export.csv')

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'ACEPTADA' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar CSV' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
    expect(apiMock.mock.calls[3][0]).toBe('/api/institution/linkage-requests/export.csv?status=ACEPTADA')
    expect(names.every((name) => /^solicitudes-vinculacion-\d{4}-\d{2}-\d{2}\.csv$/.test(name))).toBe(true)
    click.mockRestore()
  })

  it('avisa si la descarga falla sin perder la bandeja (CA-04)', async () => {
    apiMock.mockResolvedValueOnce(page([pending]))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar CSV' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Solicitudes de vinculación recibidas' })).toBeInTheDocument()
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

describe('respuesta institucional HU-S6-02', () => {
  const patches = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
  const answered = {
    ...detail, status: 'ACEPTADA', responded_at: '2026-10-29T16:00:00Z', response_message: 'Coordinemos la entrevista.',
    responded_by: { name: 'Coordinación dual' },
  }

  it.each([
    ['Aceptar solicitud', '¿Aceptar la solicitud?', 'ACEPTADA', 'Solicitud aceptada correctamente.', 'Aceptada'],
    ['Rechazar solicitud', '¿Rechazar la solicitud?', 'RECHAZADA', 'Solicitud rechazada correctamente.', 'Rechazada'],
  ])('%s tras confirmar, con el mensaje opcional, y muestra la respuesta (CA-01, CA-05)', async (action, title, status, done, label) => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ data: { ...answered, status } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    fireEvent.change(within(section).getByLabelText('Mensaje para la empresa (opcional)'), { target: { value: '  Coordinemos la entrevista.  ' } })

    // Cancelar el diálogo no envía nada.
    fireEvent.click(within(section).getByRole('button', { name: action }))
    let dialog = await screen.findByRole('alertdialog', { name: title })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(patches()).toHaveLength(0)

    fireEvent.click(within(section).getByRole('button', { name: action }))
    dialog = await screen.findByRole('alertdialog', { name: title })
    fireEvent.click(within(dialog).getByRole('button', { name: action }))
    const result = await screen.findByRole('region', { name: 'Respuesta' })
    expect(patches()).toHaveLength(1)
    expect(patches()[0][0]).toBe('/api/institution/linkage-requests/41/decision')
    expect(JSON.parse(patches()[0][1]?.body as string)).toEqual({ status, response_message: 'Coordinemos la entrevista.' })
    expect(within(result).getByRole('status')).toHaveTextContent(done)
    expect(result).toHaveTextContent(label)
    expect(result).toHaveTextContent('Coordinación dual')
    expect(result).toHaveTextContent('Coordinemos la entrevista.')
    expect(screen.queryByRole('region', { name: 'Responder solicitud' })).not.toBeInTheDocument()
  })

  it('envía null sin mensaje y rechaza datos de contacto antes de enviar', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail })).mockResolvedValueOnce(Response.json({ data: answered }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    const field = within(section).getByLabelText('Mensaje para la empresa (opcional)')
    fireEvent.change(field, { target: { value: 'Escribe a rh@escuela.mx' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Aceptar solicitud' }))
    expect(field).toHaveAccessibleDescription(/No incluyas enlaces, correos ni teléfonos/)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Aceptar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aceptar solicitud' }))
    await screen.findByRole('region', { name: 'Respuesta' })
    expect(JSON.parse(patches()[0][1]?.body as string)).toEqual({ status: 'ACEPTADA', response_message: null })
  })

  it('explica cuando la solicitud ya no estaba pendiente y permite actualizarla (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: { status: ['Solo puedes responder solicitudes pendientes.'] } }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ data: { ...detail, status: 'CANCELADA' } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    fireEvent.click(within(section).getByRole('button', { name: 'Rechazar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Rechazar solicitud' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('Solo puedes responder solicitudes pendientes.')
    fireEvent.click(within(section).getByRole('button', { name: 'Actualizar solicitud' }))
    expect(await screen.findByText('La empresa canceló la solicitud antes de que se respondiera.')).toBeInTheDocument()
  })

  it('muestra la respuesta registrada al abrir una solicitud ya respondida (CA-05)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: answered }))
    renderApp('/institution/linkage-requests/41')
    const result = await screen.findByRole('region', { name: 'Respuesta' })
    expect(result).toHaveTextContent('Aceptada')
    expect(result).toHaveTextContent('29 de octubre de 2026')
    expect(result).toHaveTextContent('Coordinación dual')
    expect(screen.queryByRole('button', { name: 'Aceptar solicitud' })).not.toBeInTheDocument()
  })
})
