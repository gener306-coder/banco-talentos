import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
let unreadConversations = 0
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
  opportunity: { id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2, accepted_count: 0 },
  student,
  unread_count: 0,
}
const accepted = { ...pending, id: 40, status: 'ACEPTADA', company: { name: 'Aceros del Norte', municipality: null } }
const detail = {
  ...pending,
  message: 'Nos interesa su perfil.',
  company: {
    name: 'ManuGolfo', municipality: 'Victoria', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', trade_name: 'ManuGolfo',
    sector_code: '54', state_code: '28', contact_name: 'Laura Méndez', contact_position: 'Recursos Humanos', contact_email: 'dual@manugolfo.mx', contact_phone: '(833) 123-4567',
  },
  opportunity: {
    id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2, accepted_count: 0, period_number: 5,
    can_relocate: true, state_code: '28', municipality: 'Reynosa', description: 'Actividades del proyecto.',
    skills: [{ name: 'Python', kind: 'technical' }], language_code: 'en', min_level: 3, is_active: true,
  },
  student: {
    ...student, dual_available: true, state_code: '28', municipality: 'Reynosa', can_relocate: false,
    social_security: { insurance_type: 'IMSS', insurer_name: null, has_number: true, has_document: true },
  },
  responded_at: null,
  response_message: null,
  responded_by: null,
  termination: null,
  student_accepted_elsewhere: [],
}
const page = (items: unknown[], meta = {}) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20, ...meta } })

function renderApp(path = '/institution/linkage-requests') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

beforeEach(() => {
  user = institutionUser
  apiMock.mockReset()
  fetchMock.mockReset()
  unreadConversations = 0
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    // Aviso de conversaciones sin leer del menú (HU-S13-04): ajeno a estas pruebas salvo donde se indique.
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: unreadConversations } })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    // Conversación de la solicitud aceptada (HU-S13-03): hilo vacío; su comportamiento se prueba en LinkageConversation.test.tsx.
    if (typeof path === 'string' && path.includes('/messages')) {
      return Response.json({ data: [], meta: { has_more: false, can_write: true, last_read_message_id: null } })
    }
    return apiMock(path, init)
  })
  // T-S14-19: el carrusel de Historias del Dual también pide la galería en el inicio de la Secretaría y de la institución;
  // se responde aparte para que no consuma las respuestas en orden de fetchMock.
  vi.stubGlobal('fetch', (path: RequestInfo | URL, options?: RequestInit) => String(path).startsWith('/api/promotional-videos')
    ? Promise.resolve(Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })) : fetchMock(path, options))
})
afterEach(() => vi.unstubAllGlobals())

describe('bandeja institucional HU-S6-01', () => {
  it('ofrece la bandeja a INSTITUTION desde el inicio y la niega a otros roles (CA-01, CA-06)', async () => {
    const view = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Solicitudes de vinculación' })).toHaveAttribute('href', '/institution/linkage-requests')
    view.unmount()

    user = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [] } }
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
    // T-S8-15: la fila solo identifica al alumno; la carrera y el periodo quedan en el detalle.
    expect(row).toHaveTextContent('MAT-0001')
    expect(row).not.toHaveTextContent('Ingeniería en Datos')
    expect(row).not.toHaveTextContent('6.º semestre')
    expect(row).toHaveTextContent('Tableros de producción')
    expect(row).toHaveTextContent('Victoria')
    expect(row).toHaveTextContent('Pendiente de la institución')
    expect(within(row).getByRole('link', { name: 'Ver la solicitud de ManuGolfo para García López, Ana Sofía' })).toHaveAttribute('href', '/institution/linkage-requests/41')
    // T-S13-10: sin columna Acciones; el detalle es una flecha y el alumno, una pastilla a su expediente.
    expect(within(row).getByRole('link', { name: 'Ver la solicitud de ManuGolfo para García López, Ana Sofía' })).toHaveClass('row-open')
    expect(within(within(row).getByRole('rowheader')).getByRole('link', { name: 'Ver expediente de García López, Ana Sofía' })).toHaveAttribute('href', '/students/7')
    expect(within(table).queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument()
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
    expect(await screen.findByText('Ninguna solicitud coincide con la búsqueda o los filtros.')).toBeInTheDocument()
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
    // El Blob de jsdom no tiene .stream(), que necesita el Response de Node: el cuerpo va como texto con su tipo.
    const csv = () => new Response('\uFEFFFolio', { headers: { 'Content-Type': 'text/csv' } })
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
  it('llega desde el aviso del inicio filtrada por pendientes (T-S8-08)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }))
    renderApp('/institution/linkage-requests?status=PENDIENTE_INSTITUCION')
    expect(await screen.findByLabelText('Estado')).toHaveValue('PENDIENTE_INSTITUCION')
    await waitFor(() => expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests?page=1&status=PENDIENTE_INSTITUCION'))
  })

  it('ignora un estado desconocido en la URL', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }))
    renderApp('/institution/linkage-requests?status=INVENTADO')
    expect(await screen.findByLabelText('Estado')).toHaveValue('')
    await waitFor(() => expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests?page=1'))
  })

  it('muestra la identidad con enlace al expediente, la oportunidad y el contacto de la empresa (CA-05, CA-06)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
    renderApp('/institution/linkage-requests/41')
    const studentSection = await screen.findByRole('region', { name: 'Alumno solicitado' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests/41')
    expect(studentSection).toHaveTextContent('Ana Sofía García López')
    expect(studentSection).toHaveTextContent('MAT-0001')
    expect(within(studentSection).getByRole('link', { name: /Ver expediente del alumno/ })).toHaveAttribute('href', '/students/7')
    // T-S13-14: el mensaje de la empresa se lee en la conversación, no en el detalle.
    expect(screen.queryByText('Nos interesa su perfil.')).not.toBeInTheDocument()

    const security = screen.getByRole('region', { name: 'Seguro del alumno' })
    expect(security).toHaveTextContent('Capturado')
    expect(security).toHaveTextContent('Cargado')
    expect(within(security).queryByRole('note')).not.toBeInTheDocument()

    const opportunity = screen.getByRole('region', { name: 'Oportunidad' })
    expect(opportunity).toHaveTextContent('Actividades del proyecto.')
    expect(opportunity).toHaveTextContent('5.º o posterior, semestre o cuatrimestre')
    expect(opportunity).toHaveTextContent('0 de 2 lugares cubiertos')
    expect(within(opportunity).getByRole('list', { name: 'Habilidades requeridas' })).toHaveTextContent('Python')

    const company = screen.getByRole('region', { name: 'Empresa y contacto del programa dual' })
    expect(company).toHaveTextContent('Manufacturas del Golfo, S.A. de C.V.')
    expect(company).toHaveTextContent('Laura Méndez')
    expect(company).toHaveTextContent('Recursos Humanos')
    // T-S12-06: el correo se muestra y su ícono abre el menú (copiar, Gmail, Outlook o la app), sin mailto: directo.
    expect(company).toHaveTextContent('dual@manugolfo.mx')
    fireEvent.click(within(company).getByRole('button', { name: 'Escribir a dual@manugolfo.mx' }))
    const menu = await screen.findByRole('menu', { name: 'Correo dual@manugolfo.mx' })
    expect(within(menu).getByRole('menuitem', { name: 'Abrir en app del sistema' })).toHaveAttribute('href', 'mailto:dual@manugolfo.mx')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(within(company).getByRole('link', { name: '(833) 123-4567' })).toHaveAttribute('href', 'tel:8331234567')
  })

  it('avisa si faltan el número y el comprobante, con enlace al expediente (T-S8-07)', async () => {
    const socialSecurity = { insurance_type: 'IMSS', insurer_name: null, has_number: false, has_document: false }
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, student: { ...detail.student, social_security: socialSecurity } } }))
    renderApp('/institution/linkage-requests/41')
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('Al alumno le falta el número del seguro o el comprobante de vigencia.')
    // T-S12-04: aviso de pendiente con su acción en pastilla; el expediente regresa a esta solicitud.
    expect(note).toHaveClass('callout', 'pending')
    expect(within(note).getByRole('link', { name: 'Completar expediente' })).toHaveAttribute('href', '/students/7')
    expect(screen.getByRole('region', { name: 'Seguro del alumno' })).toHaveTextContent('Tipo de seguroSin capturar')
  })

  it.each([
    [{ insurance_type: 'IMSS', insurer_name: null, has_number: false, has_document: true }, 'IMSS'],
    [{ insurance_type: 'IMSS', insurer_name: null, has_number: true, has_document: false }, 'IMSS'],
    [{ insurance_type: 'OTHER', insurer_name: 'Seguros del Golfo', has_number: false, has_document: true }, 'Otro seguro: Seguros del Golfo'],
    [{ insurance_type: 'OTHER', insurer_name: 'Seguros del Golfo', has_number: true, has_document: false }, 'Otro seguro: Seguros del Golfo'],
  ])('considera completo el seguro con el número o el comprobante (T-S8-07)', async (socialSecurity, label) => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, student: { ...detail.student, social_security: socialSecurity } } }))
    renderApp('/institution/linkage-requests/41')
    const region = await screen.findByRole('region', { name: 'Seguro del alumno' })
    expect(region).toHaveTextContent(label)
    expect(within(region).queryByRole('note')).not.toBeInTheDocument()
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
    // T-S13-14: el mensaje de la respuesta abre la conversación; el resumen no lo repite.
    expect(result).not.toHaveTextContent('Coordinemos la entrevista.')
    expect(screen.queryByRole('region', { name: 'Responder solicitud' })).not.toBeInTheDocument()

    // HU-S13-06: la conversación vive en su vista; el detalle la ofrece en cualquier estado y no la carga.
    expect(screen.getByRole('link', { name: 'Abrir conversación' })).toHaveAttribute('href', '/institution/linkage-requests/41/chat')
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('/api/institution/linkage-requests/41/messages')
  })

  it('el ícono de la bandeja abre la conversación con regreso a la bandeja (HU-S13-06 CA-04)', async () => {
    apiMock.mockResolvedValueOnce(page([pending]))
    renderApp('/institution/linkage-requests?status=PENDIENTE_INSTITUCION')
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación recibidas' })
    expect(within(table).getByRole('link', { name: /^Abrir la conversación con ManuGolfo sobre / }))
      .toHaveAttribute('href', '/institution/linkage-requests/41/chat')
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

  it('con el cupo lleno no deja aceptar, explica por qué y sigue permitiendo rechazar (T-S14-11)', async () => {
    const full = { ...detail, opportunity: { ...detail.opportunity, vacancies: 2, accepted_count: 2 } }
    apiMock.mockResolvedValueOnce(Response.json({ data: full }))
      .mockResolvedValueOnce(Response.json({ data: { ...full, status: 'RECHAZADA', responded_at: '2026-10-29T16:00:00Z', responded_by: { name: 'Coordinación dual' } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    expect(screen.getByRole('region', { name: 'Oportunidad' })).toHaveTextContent('2 de 2 lugares cubiertosCupo lleno')
    const accept = within(section).getByRole('button', { name: 'Aceptar solicitud' })
    expect(accept).toBeDisabled()
    expect(accept).toHaveAccessibleDescription(/ya cubrió sus lugares \(2 de 2 lugares cubiertos\)/)
    fireEvent.click(within(section).getByRole('button', { name: 'Rechazar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Rechazar solicitud' }))
    expect(await screen.findByRole('region', { name: 'Respuesta' })).toHaveTextContent('Rechazada')
  })

  it('si otra institución cubrió el último lugar mientras decidía, muestra el aviso del servidor y permite actualizar (T-S14-11)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: { status: ['La oportunidad ya cubrió sus 2 lugares. Puedes rechazar la solicitud.'] } }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ data: { ...detail, opportunity: { ...detail.opportunity, accepted_count: 2 } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    fireEvent.click(within(section).getByRole('button', { name: 'Aceptar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aceptar solicitud' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('La oportunidad ya cubrió sus 2 lugares.')
    fireEvent.click(within(section).getByRole('button', { name: 'Actualizar solicitud' }))
    // La vista se vuelve a cargar: se busca la sección de nuevo.
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Responder solicitud' })).getByRole('button', { name: 'Aceptar solicitud' })).toBeDisabled())
  })

  it('con la oportunidad inactiva no deja aceptar, explica por qué y sigue permitiendo rechazar (auditoría QA #6)', async () => {
    const inactive = { ...detail, opportunity: { ...detail.opportunity, is_active: false } }
    apiMock.mockResolvedValueOnce(Response.json({ data: inactive }))
      .mockResolvedValueOnce(Response.json({ data: { ...inactive, status: 'RECHAZADA', responded_at: '2026-10-29T16:00:00Z', responded_by: { name: 'Coordinación dual' } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    const accept = within(section).getByRole('button', { name: 'Aceptar solicitud' })
    expect(accept).toBeDisabled()
    expect(accept).toHaveAccessibleDescription('La empresa inactivó esta oportunidad. Ya no puedes aceptar esta solicitud; puedes rechazarla con un mensaje para la empresa.')
    const reject = within(section).getByRole('button', { name: 'Rechazar solicitud' })
    expect(reject).toBeEnabled()
    fireEvent.click(reject)
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Rechazar solicitud' }))
    expect(await screen.findByRole('region', { name: 'Respuesta' })).toHaveTextContent('Rechazada')
  })

  it('sin el perfil mínimo no deja aceptar, enlaza a Mi cuenta y sigue permitiendo rechazar (HU-S16-08)', async () => {
    user = { ...institutionUser, institution: { id: 2, name: null, missing: ['name', 'cct'], onboarding: 'done' } }
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    const accept = within(section).getByRole('button', { name: 'Aceptar solicitud' })
    expect(accept).toBeDisabled()
    expect(accept).toHaveAccessibleDescription(/Completa el nombre oficial, el CCT y el nombre y correo del responsable/)
    expect(within(section).getByRole('link', { name: 'Completar perfil' })).toHaveAttribute('href', '/account#organization')
    expect(within(section).getByRole('button', { name: 'Rechazar solicitud' })).toBeEnabled()
  })

  it('si el servidor rechaza la aceptación por el perfil incompleto, lo explica en lugar del error genérico (HU-S16-08)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ message: 'Completa…', code: 'INSTITUTION_PROFILE_INCOMPLETE', missing: ['cct'] }, { status: 422 }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    fireEvent.click(within(section).getByRole('button', { name: 'Aceptar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aceptar solicitud' }))
    expect(await within(section).findByRole('note', { name: 'Perfil de la institución incompleto' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Aceptar solicitud' })).toBeDisabled()
  })

  it('si la empresa inactivó la oportunidad mientras decidía, muestra el aviso del servidor y permite actualizar (auditoría QA #6)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: { status: ['La oportunidad fue inactivada por la empresa. Puedes rechazar la solicitud.'] } }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ data: { ...detail, opportunity: { ...detail.opportunity, is_active: false } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    fireEvent.click(within(section).getByRole('button', { name: 'Aceptar solicitud' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aceptar solicitud' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('La oportunidad fue inactivada por la empresa. Puedes rechazar la solicitud.')
    fireEvent.click(within(section).getByRole('button', { name: 'Actualizar solicitud' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Responder solicitud' })).getByRole('button', { name: 'Aceptar solicitud' })).toBeDisabled())
    expect(screen.getByRole('region', { name: 'Oportunidad' })).toHaveTextContent('INACTIVA')
  })

  it('avisa si el alumno ya tiene otras vinculaciones aceptadas, sin impedir responder (T-S14-12)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, student_accepted_elsewhere: [{ id: 77, company: 'Taller Norteño', opportunity: 'Soldadura', responded_at: '2026-10-20T10:00:00Z' }] } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Responder solicitud' })
    const note = within(section).getByRole('note', { name: 'Otras vinculaciones aceptadas del alumno' })
    expect(note).toHaveTextContent('Este alumno ya tiene una vinculación aceptada:')
    expect(note).toHaveTextContent('Taller Norteño · Soldadura')
    expect(within(section).getByRole('button', { name: 'Aceptar solicitud' })).toBeEnabled()
  })

  it('da de baja una vinculación aceptada con su motivo y muestra la baja registrada (T-S14-13)', async () => {
    const accepted = { ...detail, status: 'ACEPTADA', responded_at: '2026-10-29T16:00:00Z', response_message: null, responded_by: { name: 'Coordinación dual' } }
    apiMock.mockResolvedValueOnce(Response.json({ data: accepted }))
      .mockResolvedValueOnce(Response.json({ data: { ...accepted, status: 'BAJA', termination: { at: '2026-11-02T10:00:00Z', party: 'INSTITUTION', reason: 'Cambió de programa.', by: { name: 'Coordinación dual' } } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Baja de la vinculación' })
    fireEvent.click(within(section).getByRole('button', { name: 'Dar de baja' }))
    const sheet = await screen.findByRole('dialog', { name: 'Dar de baja la vinculación' })
    // Sin motivo, ni con datos de contacto, no se envía.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dar de baja' }))
    expect(await within(sheet).findByText('Escribe el motivo de la baja.')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Motivo de la baja'), { target: { value: 'Escríbeme a dual@ut.mx' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dar de baja' }))
    expect(await within(sheet).findByText(/No incluyas enlaces, correos ni teléfonos/)).toBeInTheDocument()
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)

    fireEvent.change(within(sheet).getByLabelText('Motivo de la baja'), { target: { value: '  Cambió de programa.  ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dar de baja' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Baja de la vinculación' })).toHaveTextContent('Cambió de programa.'))
    const result = screen.getByRole('region', { name: 'Baja de la vinculación' })
    expect(result).toHaveTextContent('Tu institución (Coordinación dual)')
    expect(result).toHaveTextContent('El lugar de la oportunidad quedó libre')
    const [path, init] = apiMock.mock.calls.filter(([, call]) => call?.method === 'PATCH')[0]
    expect([path, JSON.parse(init?.body as string)]).toEqual(['/api/institution/linkage-requests/41/termination', { reason: 'Cambió de programa.' }])
  })

  it('una baja registrada por la empresa se muestra sin la cuenta que la registró (T-S14-13)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, status: 'BAJA', responded_at: '2026-10-29T16:00:00Z', responded_by: { name: 'Coordinación dual' },
      termination: { at: '2026-11-02T10:00:00Z', party: 'COMPANY', reason: 'El alumno no se presentó.', by: null } } }))
    renderApp('/institution/linkage-requests/41')
    const section = await screen.findByRole('region', { name: 'Baja de la vinculación' })
    expect(section).toHaveTextContent('La empresa')
    expect(section).toHaveTextContent('El alumno no se presentó.')
    expect(within(section).queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
  })

  it('la nota de privacidad afirma que la empresa no conoce al alumno solo mientras no hay vinculación (HU-S15-04)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: detail }))
    const view = renderApp('/institution/linkage-requests/41')
    const pendingStudent = await screen.findByRole('region', { name: 'Alumno solicitado' })
    expect(pendingStudent).toHaveTextContent('La identidad del alumno es de uso exclusivo de tu institución; la empresa no la conoce.')
    view.unmount()

    for (const status of ['ACEPTADA', 'BAJA']) {
      apiMock.mockResolvedValueOnce(Response.json({ data: { ...detail, status, responded_at: '2026-10-29T16:00:00Z', responded_by: { name: 'Coordinación dual' },
        termination: status === 'BAJA' ? { at: '2026-11-02T10:00:00Z', party: 'COMPANY', reason: 'El alumno no se presentó.', by: null } : null } }))
      const linked = renderApp('/institution/linkage-requests/41')
      const student = await screen.findByRole('region', { name: 'Alumno solicitado' })
      expect(student).toHaveTextContent('comparte por la conversación solo los datos necesarios y con el consentimiento del alumno')
      expect(student).not.toHaveTextContent('la empresa no la conoce')
      linked.unmount()
    }
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

describe('bandeja de la institución en la URL (T-S12-05)', () => {
  it('reconstruye filtro y página desde la URL y el detalle regresa a esa misma vista', async () => {
    apiMock.mockResolvedValueOnce(page([pending], { current_page: 2, last_page: 2, total: 21 }))
      .mockResolvedValueOnce(Response.json({ data: detail }))
    renderApp('/institution/linkage-requests?status=PENDIENTE_INSTITUCION&page=2')
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación recibidas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests?page=2&status=PENDIENTE_INSTITUCION')
    expect(screen.getByLabelText('Estado')).toHaveValue('PENDIENTE_INSTITUCION')

    fireEvent.click(within(table).getByRole('rowheader'))
    expect(await screen.findByRole('link', { name: 'Volver a solicitudes' }))
      .toHaveAttribute('href', '/institution/linkage-requests?status=PENDIENTE_INSTITUCION&page=2')
    // T-S13-14: la navegación no repite «Solicitudes de vinculación» cuando el regreso ya lleva a la bandeja.
    const nav = screen.getByRole('navigation', { name: 'Navegación de solicitudes' })
    expect(within(nav).queryByRole('link', { name: /^Solicitudes de vinculación/ })).not.toBeInTheDocument()
    // T-S13-17: sin enlaces a otras secciones; el único regreso es el de la bandeja.
    expect(within(nav).getAllByRole('link')).toHaveLength(1)
  })
})

