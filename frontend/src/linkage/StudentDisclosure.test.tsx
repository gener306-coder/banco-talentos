import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// Sprint 19, PR 2: ficha compartida con la empresa (T-S19-06), del lado de la institución y de la empresa.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const institutionUser = { id: 4, name: 'Coordinación dual', email: 'dual@utgolfo.edu.mx', role: 'INSTITUTION', institution: { id: 2, name: 'UT del Golfo' }, company: null }
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [] } }
const student = {
  id: 7, enrollment_number: 'MAT-0001', given_names: 'Ana Sofía', first_surname: 'García', second_surname: 'López',
  is_active: true, program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6,
  dual_available: true, state_code: '28', municipality: 'Reynosa', can_relocate: false,
  social_security: { insurance_type: 'IMSS', insurer_name: null, has_number: true, has_document: true },
}
const received = {
  id: 41, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', unread_count: 0, message: 'Nos interesa su perfil.',
  company: {
    name: 'ManuGolfo', municipality: 'Victoria', legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', sector_code: '54', state_code: '28',
    contact_name: 'Laura Méndez', contact_position: null, contact_email: 'dual@manugolfo.mx', contact_phone: null,
  },
  opportunity: {
    id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2, accepted_count: 1, period_number: 5,
    can_relocate: true, state_code: '28', municipality: 'Reynosa', description: 'Actividades.', skills: [], language_code: null, min_level: null, is_active: true,
  },
  student,
  responded_at: '2026-10-29T16:00:00Z', response_message: null, responded_by: { name: 'Coordinación dual' },
  termination: null, student_accepted_elsewhere: [], disclosure: null,
}
const shared = { fields: ['full_name', 'links'], disclosed_at: '2026-11-24T18:00:00Z', disclosed_by: { name: 'Coordinación dual' } }
const sent = {
  id: 41, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', message: 'Nos interesa su perfil.',
  opportunity: { id: 12, title: 'Tableros de producción', is_active: true },
  profile: { public_id: '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f', headline: 'Analista de datos', program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: 'Laura Méndez', contact_position: null, contact_email: 'dual@utgolfo.edu.mx', contact_phone: null },
  responded_at: '2026-10-29T16:00:00Z', response_message: null, termination: null, unread_count: 0, last_message_at: null,
}
const writes = () => apiMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

beforeEach(() => {
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (typeof path === 'string' && path.includes('/messages')) return Response.json({ data: [], meta: { has_more: false, can_write: true, last_read_message_id: null } })
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('institución: compartir la ficha', () => {
  beforeEach(() => { user = institutionUser })

  it('en una solicitud pendiente explica que podrá compartirse tras aceptar, sin botón', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...received, status: 'PENDIENTE_INSTITUCION', responded_at: null, responded_by: null } }))
    render(<MemoryRouter initialEntries={['/institution/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha compartida con la empresa' })
    expect(section).toHaveTextContent('Cuando aceptes la solicitud podrás compartir con la empresa una ficha ampliada del alumno')
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()
  })

  it('comparte los grupos elegidos con el consentimiento y muestra la ficha compartida', async () => {
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/institution/linkage-requests/41') return Response.json({ data: received })
      if (path === '/api/institution/linkage-requests/41/disclosure' && init?.method === 'POST') return Response.json({ data: shared }, { status: 201 })
      return new Response(null, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/institution/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha compartida con la empresa' })
    expect(within(section).getByText('Ficha privada')).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Compartir ficha con la empresa' }))

    const sheet = await screen.findByRole('dialog', { name: 'Compartir ficha con la empresa' })
    expect(sheet).toHaveTextContent('La matrícula, los datos y el comprobante del seguro (IMSS u otro) y los campos internos del expediente siguen siendo privados.')
    expect(sheet).toHaveTextContent('Puedes dejar de compartir la ficha en cualquier momento.')
    const submit = within(sheet).getByRole('button', { name: 'Compartir ficha' })
    fireEvent.click(within(sheet).getByLabelText('Nombre completo'))
    fireEvent.click(within(sheet).getByLabelText('Enlaces y portafolio'))
    // Sin el consentimiento no se puede enviar.
    expect(submit).toBeDisabled()
    fireEvent.click(within(sheet).getByLabelText('Cuento con el consentimiento del alumno o de su tutor para compartir estos datos con la empresa.'))
    fireEvent.click(submit)

    expect(await screen.findByText('Compartiste la ficha con la empresa. Le avisamos por correo.')).toBeInTheDocument()
    const [path, init] = writes()[0]
    expect(path).toBe('/api/institution/linkage-requests/41/disclosure')
    expect(JSON.parse(init?.body as string)).toEqual({ fields: ['full_name', 'links'], consent: true })
    await waitFor(() => expect(within(section).getByText('Ficha compartida')).toBeInTheDocument())
    expect(section).toHaveTextContent('Nombre completo, Enlaces y portafolio')
    expect(within(section).getByRole('button', { name: 'Dejar de compartir' })).toBeInTheDocument()
  })

  it('deja de compartir tras confirmar que la vinculación y los mensajes siguen', async () => {
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/institution/linkage-requests/41') return Response.json({ data: { ...received, disclosure: shared } })
      if (path === '/api/institution/linkage-requests/41/disclosure/revoke' && init?.method === 'PATCH') return Response.json({ data: null })
      return new Response(null, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/institution/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha compartida con la empresa' })
    expect(section).toHaveTextContent('Ficha compartida desde el 24 de noviembre de 2026 por Coordinación dual.')
    fireEvent.click(within(section).getByRole('button', { name: 'Dejar de compartir' }))

    const dialog = await screen.findByRole('alertdialog', { name: '¿Dejar de compartir la ficha?' })
    expect(dialog).toHaveTextContent('La empresa pierde el acceso a la ficha de inmediato. La vinculación aceptada y los mensajes siguen activos.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dejar de compartir' }))

    expect(await screen.findByText('Dejaste de compartir la ficha. La empresa ya no tiene acceso.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/institution/linkage-requests/41/disclosure/revoke')
    await waitFor(() => expect(within(section).getByText('Ficha privada')).toBeInTheDocument())
  })
})

describe('empresa: ficha profesional', () => {
  beforeEach(() => { user = companyUser })

  it('sin ficha compartida muestra el bloque neutro y no la pide al servidor', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...sent, shared_profile_at: null } }))
    render(<MemoryRouter initialEntries={['/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha profesional' })
    expect(section).toHaveTextContent('Ficha profesional no disponible. La institución aún no ha compartido la ficha ampliada de este alumno. Si necesitas revisar su portafolio o certificaciones, solicítalo desde el apartado de mensajes.')
    expect(apiMock.mock.calls.map(([path]) => path)).not.toContain('/api/linkage-requests/41/disclosure')
  })

  it('muestra solo los grupos compartidos, con enlaces seguros y el pie de confidencialidad', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/linkage-requests/41') return Response.json({ data: { ...sent, shared_profile_at: shared.disclosed_at } })
      if (path === '/api/linkage-requests/41/disclosure') {
        return Response.json({ data: {
          fields: ['full_name', 'links'], disclosed_at: shared.disclosed_at, full_name: 'Ana Sofía García López',
          links: [{ kind: 'github', url: 'https://github.com/anasofia' }, { kind: 'other', url: 'javascript:alert(1)' }],
        } })
      }
      return new Response(null, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha profesional compartida' })
    expect(await within(section).findByText('Ana Sofía García López')).toBeInTheDocument()
    expect(section).toHaveTextContent('Compartida el 24 de noviembre de 2026.')
    expect(section).toHaveTextContent('Información compartida exclusivamente para fines de evaluación en Educación Dual.')
    const link = within(section).getByRole('link', { name: 'https://github.com/anasofia' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
    expect(within(section).queryByText(/javascript:/)).not.toBeInTheDocument()
    expect(section).not.toHaveTextContent('Credenciales de certificaciones')
  })

  it('si la institución dejó de compartirla, vuelve al bloque neutro', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/linkage-requests/41') return Response.json({ data: { ...sent, shared_profile_at: shared.disclosed_at } })
      return Response.json({ message: 'La ficha no está disponible.' }, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/linkage-requests/41']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Ficha profesional compartida' })
    expect(await within(section).findByText(/Ficha profesional no disponible\./)).toBeInTheDocument()
  })
})
