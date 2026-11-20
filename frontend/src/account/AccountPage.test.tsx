import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// HU-S14-01: Mi cuenta. Nombre y contraseña de la persona de la sesión, para todos los roles; rediseño de lectura
// primero y edición bajo demanda (T-S14-03).
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [] } }
const adminUser = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
const secretaryUser = { id: 2, name: 'Analista Económica', email: 'analista@economia.test', role: 'SECRETARY', institution: null, company: null }
const institutionUser = { id: 3, name: 'Laura Méndez', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
const institutionProfile = {
  type: 'institution', name: 'Universidad Tecnológica del Golfo', cct: '28EUT0001A', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@ut.test', contact_phone: null,
}
let profile: Record<string, unknown>
const companyProfile = {
  type: 'company', name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', rfc: 'MGO150320AB1', sector_code: '54', trade_name: 'ManuGolfo',
  state_code: '28', municipality_code: '28041', municipality: 'Tampico', contact_name: 'Lucía Herrera', contact_position: null, contact_email: 'dual@manugolfo.test', contact_phone: null,
  missing: [],
}
const writes = () => apiMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

beforeEach(() => {
  user = companyUser
  profile = companyProfile
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me' && (!init?.method || init.method === 'GET')) return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/organization/profile' && (!init?.method || init.method === 'GET')) return Response.json({ data: profile })
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) return Response.json({ data: [{ code: '28041', name: 'Tampico' }] })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

/** T-S14-04: las confirmaciones salen en el aviso breve (Snackbar), fuera de las tarjetas. */
async function expectSnackbar(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('.snackbar')).toHaveAttribute('role', 'status')
}


describe('menú de cuenta', () => {
  it('ofrece Mi cuenta a cualquier rol y lleva a /account', async () => {
    user = adminUser
    render(<MemoryRouter initialEntries={['/']}><App /><Location /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Cuenta|Administración/ }))
    const panel = screen.getByRole('region', { name: 'Cuenta' })
    fireEvent.click(within(panel).getByRole('link', { name: /^Mi cuenta/ }))
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/account')
    expect(await screen.findByRole('region', { name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
  })
})

describe('Mi cuenta', () => {
  it('presenta la identidad con el avatar de iniciales, el rol y la organización, y el acceso en solo lectura', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    expect(within(identity).getByRole('heading', { level: 2, name: 'Reclutadora' })).toBeInTheDocument()
    expect(identity.querySelector('.user-avatar.lg')).toHaveTextContent('RE')
    expect(identity).toHaveTextContent('Empresa · ManuGolfo')
    expect(identity).toHaveTextContent('rh@manugolfo.test')
    // El mismo avatar en el menú de cuenta.
    expect(screen.getByRole('button', { name: 'Cuenta de Reclutadora' }).querySelector('.user-avatar.sm')).toHaveTextContent('RE')

    const security = screen.getByRole('region', { name: 'Acceso y seguridad' })
    expect(security).toHaveTextContent('Correo de acceso')
    expect(security).toHaveTextContent('Para cambiarlo, escribe a la Secretaría de Economía.')
    expect(security).toHaveTextContent('Al cambiarla se cierran tus sesiones en otros dispositivos.')
    expect(within(security).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('con el nombre provisional pide agregar un nombre en lugar de repetir el correo', async () => {
    user = { ...companyUser, name: 'op@norteno.test', email: 'op@norteno.test' }
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    expect(within(identity).getByRole('heading', { level: 2, name: 'Agrega tu nombre' })).toBeInTheDocument()
    expect(within(identity).getAllByText('op@norteno.test')).toHaveLength(1)
    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    expect(within(identity).getByLabelText('Tu nombre')).toHaveValue('')
  })

  it('edita el nombre en su sitio con el lápiz: guarda con Enter, muestra el error del servidor y el menú lo refleja', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { name: ['El nombre admite hasta 120 caracteres.'] } }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ user: { ...companyUser, name: 'Lucía Herrera' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    const field = within(identity).getByLabelText('Tu nombre')
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Reclutadora')

    fireEvent.change(field, { target: { value: 'x'.repeat(121) } })
    fireEvent.submit(field)
    expect(await within(identity).findByText('El nombre admite hasta 120 caracteres.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(field, { target: { value: '  Lucía Herrera ' } })
    fireEvent.click(within(identity).getByRole('button', { name: 'Guardar' }))
    await expectSnackbar('Nombre actualizado.')
    expect(within(identity).getByRole('heading', { level: 2, name: 'Lucía Herrera' })).toBeInTheDocument()
    expect(within(identity).queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    const [path, init] = writes()[1]
    expect([path, init?.method, JSON.parse(String(init?.body))]).toEqual(['/api/me', 'PATCH', { name: 'Lucía Herrera' }])
    expect(screen.getByRole('button', { name: 'Cuenta de Lucía Herrera' })).toHaveTextContent('LH')
  })

  it('cancela la edición del nombre con Escape o con el botón, sin guardar', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    fireEvent.change(within(identity).getByLabelText('Tu nombre'), { target: { value: 'Otro' } })
    fireEvent.keyDown(within(identity).getByLabelText('Tu nombre'), { key: 'Escape' })
    expect(within(identity).getByRole('heading', { level: 2, name: 'Reclutadora' })).toBeInTheDocument()

    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    fireEvent.click(within(identity).getByRole('button', { name: 'Cancelar' }))
    expect(within(identity).getByRole('heading', { level: 2, name: 'Reclutadora' })).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('cambia la contraseña en una hoja con la actual, valida la confirmación y muestra los errores del servidor', async () => {
    let respond: (value: Response) => void = () => undefined
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { current_password: ['La contraseña actual no es correcta.'] } }, { status: 422 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cambiar contraseña' })
    const fill = (current: string, next: string, confirm: string) => {
      fireEvent.change(within(sheet).getByLabelText('Contraseña actual'), { target: { value: current } })
      fireEvent.change(within(sheet).getByLabelText('Contraseña nueva'), { target: { value: next } })
      fireEvent.change(within(sheet).getByLabelText('Confirma la contraseña nueva'), { target: { value: confirm } })
    }

    fill('Actual-2026!', 'Nueva-Larga-2026', 'Otra-Distinta-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(within(sheet).getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)

    fill('Equivocada-1', 'Nueva-Larga-2026', 'Nueva-Larga-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByText('La contraseña actual no es correcta.')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Contraseña actual')).toHaveAttribute('aria-invalid', 'true')

    // Mostrar u ocultar.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mostrar contraseña nueva' }))
    expect(within(sheet).getByLabelText('Contraseña nueva')).toHaveAttribute('type', 'text')

    fill('Actual-2026!', 'Nueva-Larga-2026', 'Nueva-Larga-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByRole('button', { name: 'Guardando contraseña…' })).toBeDisabled()
    const [path, init] = writes()[1]
    expect([path, init?.method, JSON.parse(String(init?.body))]).toEqual(['/api/me/password', 'PUT',
      { current_password: 'Actual-2026!', password: 'Nueva-Larga-2026', password_confirmation: 'Nueva-Larga-2026' }])

    await act(async () => { respond(new Response(null, { status: 204 })) })
    await expectSnackbar('Contraseña actualizada. Cerramos tus sesiones en otros dispositivos.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cambiar contraseña' })).not.toBeInTheDocument())
  })

  it('explica el límite de intentos', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Too Many Attempts.' }, { status: 429 }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cambiar contraseña' })
    for (const [label, value] of [['Contraseña actual', 'Actual-2026!'], ['Contraseña nueva', 'Nueva-Larga-2026'], ['Confirma la contraseña nueva', 'Nueva-Larga-2026']]) {
      fireEvent.change(within(sheet).getByLabelText(label), { target: { value } })
    }
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Hiciste demasiados intentos seguidos.')
  })
})

describe('perfil de la organización: lectura primero y edición en su sitio (T-S14-03)', () => {
  it('la empresa ve su ficha, edita en la misma tarjeta y vuelve a la lectura al guardar', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...companyProfile, contact_position: 'Recursos Humanos' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(card).toHaveTextContent('Perfil completo')
    expect(card).toHaveTextContent('Manufacturas del Golfo, S.A. de C.V.')
    expect(card).toHaveTextContent('Tampico, Tamaulipas')
    expect(within(card).getAllByText('Sin capturar')).toHaveLength(2)
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    fireEvent.change(within(card).getByLabelText('Puesto en la empresa (opcional)'), { target: { value: 'Recursos Humanos' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()
    expect(card).toHaveTextContent('Recursos Humanos')
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })

  it('con Soy yo, renombrarse en Tu perfil no se revierte al guardar después el perfil de la empresa (corrección T-S14-09)', async () => {
    const selfProfile = { ...companyProfile, contact_name: 'Reclutadora', contact_email: 'rh@manugolfo.test' }
    profile = selfProfile
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/me' && init?.method === 'PATCH') {
        // El servidor renombra la cuenta y, como el contacto es la misma persona, también el contacto.
        profile = { ...selfProfile, contact_name: 'Lucía Herrera' }
        return Response.json({ user: { ...companyUser, name: 'Lucía Herrera' } })
      }
      if (path === '/api/organization/profile' && init?.method === 'PUT') {
        return Response.json({ data: { ...profile, ...JSON.parse(String(init.body)), account_name: undefined, missing: [] } })
      }
      return new Response(null, { status: 500 })
    })
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(await within(card).findByText('Reclutadora')).toBeInTheDocument()

    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    fireEvent.change(within(identity).getByLabelText('Tu nombre'), { target: { value: 'Lucía Herrera' } })
    fireEvent.click(within(identity).getByRole('button', { name: 'Guardar' }))
    await expectSnackbar('Nombre actualizado.')
    // La ficha de la empresa se vuelve a leer: el contacto ya es el nombre nuevo, no el anterior.
    expect(await within(card).findByText('Lucía Herrera')).toBeInTheDocument()
    expect(within(card).queryByText('Reclutadora')).not.toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    expect(within(card).getByLabelText(/Tu nombre/)).toHaveValue('Lucía Herrera')
    fireEvent.change(within(card).getByLabelText('Puesto en la empresa (opcional)'), { target: { value: 'Recursos Humanos' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    const body = JSON.parse(String(writes().at(-1)![1]!.body)) as Record<string, unknown>
    // Sin editar el nombre en este formulario, no se manda account_name: nada puede devolver la cuenta al nombre anterior.
    expect(body).not.toHaveProperty('account_name')
    expect(body.contact_name).toBe('Lucía Herrera')
    expect(screen.getByRole('button', { name: 'Cuenta de Lucía Herrera' })).toBeInTheDocument()
    expect(within(identity).getByRole('heading', { level: 2, name: 'Lucía Herrera' })).toBeInTheDocument()
  })

  it('con Soy yo, una copia vieja del formulario no manda el nombre anterior como nombre de la cuenta (corrección T-S14-09)', async () => {
    profile = { ...companyProfile, contact_name: 'Reclutadora', contact_email: 'rh@manugolfo.test' }
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/organization/profile' && init?.method === 'PUT') return Response.json({ data: { ...profile, missing: [] } })
      return new Response(null, { status: 500 })
    })
    user = { ...companyUser, name: 'Nombre Nuevo' }
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.click(await within(card).findByRole('button', { name: 'Editar' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    expect(JSON.parse(String(writes().at(-1)![1]!.body))).not.toHaveProperty('account_name')
    expect(screen.getByRole('button', { name: 'Cuenta de Nombre Nuevo' })).toBeInTheDocument()
  })

  it('con Soy yo y el formulario abierto, renombrarse en Tu perfil actualiza el campo que no se ha tocado (T-S14-09)', async () => {
    profile = { ...companyProfile, contact_name: 'Reclutadora', contact_email: 'rh@manugolfo.test' }
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/me' && init?.method === 'PATCH') return Response.json({ user: { ...companyUser, name: 'Lucía Herrera' } })
      return new Response(null, { status: 500 })
    })
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.click(await within(card).findByRole('button', { name: 'Editar' }))
    expect(within(card).getByLabelText(/Tu nombre/)).toHaveValue('Reclutadora')
    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    fireEvent.change(within(identity).getByLabelText('Tu nombre'), { target: { value: 'Lucía Herrera' } })
    fireEvent.click(within(identity).getByRole('button', { name: 'Guardar' }))
    await expectSnackbar('Nombre actualizado.')
    await waitFor(() => expect(within(card).getByLabelText(/Tu nombre/)).toHaveValue('Lucía Herrera'))
  })

  it('con Soy yo, corregir el nombre en el formulario sí corrige el de la cuenta', async () => {
    profile = { ...companyProfile, contact_name: 'Reclutadora', contact_email: 'rh@manugolfo.test' }
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/organization/profile' && init?.method === 'PUT') return Response.json({ data: { ...profile, contact_name: 'Lucía Herrera', missing: [] } })
      return new Response(null, { status: 500 })
    })
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.click(await within(card).findByRole('button', { name: 'Editar' }))
    fireEvent.change(within(card).getByLabelText(/Tu nombre/), { target: { value: 'Lucía Herrera' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    expect(JSON.parse(String(writes().at(-1)![1]!.body))).toMatchObject({ contact_name: 'Lucía Herrera', account_name: 'Lucía Herrera' })
    expect(screen.getByRole('button', { name: 'Cuenta de Lucía Herrera' })).toBeInTheDocument()
  })

  it('cancelar la edición vuelve a la ficha sin guardar', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Cancelar' }))
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('al llegar por #organization con datos faltantes, la empresa entra directo a la edición con lo que falta', async () => {
    profile = { ...companyProfile, rfc: null, sector_code: null, missing: ['rfc', 'sector_code'] }
    render(<MemoryRouter initialEntries={['/account#organization']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(card).toHaveTextContent('5 de 7 datos')
    expect(within(card).getByRole('list', { name: 'Datos pendientes' })).toHaveTextContent('RFC')
    expect(within(card).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('con el perfil completo, #organization abre la ficha en lectura', async () => {
    render(<MemoryRouter initialEntries={['/account#organization']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('la institución ve sus datos oficiales en solo lectura y edita solo el contacto en la tarjeta', async () => {
    user = institutionUser
    profile = institutionProfile
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...institutionProfile, contact_phone: '8331234567' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la institución' })
    expect(card).toHaveTextContent('28EUT0001A')
    expect(card).toHaveTextContent('Los mantiene la Administración del Banco de Talentos.')
    fireEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    expect(within(card).queryByLabelText(/Nombre oficial|Clave/)).not.toBeInTheDocument()
    fireEvent.change(within(card).getByLabelText('Teléfono de contacto (opcional)'), { target: { value: '8331234567' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    expect(card).toHaveTextContent('8331234567')
  })

  it.each([adminUser, secretaryUser])('$role solo ve su identidad y el acceso, sin tarjeta de organización', async (account) => {
    user = account
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    await screen.findByRole('region', { name: 'Tu perfil' })
    expect(screen.getByRole('region', { name: 'Acceso y seguridad' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Perfil de la/ })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/organization/profile')).toBe(false)
  })
})

describe('estados y movimiento de Mi cuenta (T-S14-04)', () => {
  const emptyCompany = {
    ...companyProfile, name: null, legal_name: null, rfc: null, sector_code: null, trade_name: null, state_code: null, municipality_code: null,
    municipality: null, contact_name: null, contact_email: null, missing: ['name', 'contact_name', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location'],
  }

  it('mientras carga el perfil muestra un esqueleto con la forma de la ficha', async () => {
    fetchMock.mockImplementation(async (path, init) => {
      if (path === '/api/me') return Response.json({ user })
      if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
      if (path === '/api/organization/profile') return new Promise<Response>(() => undefined)
      return apiMock(path, init)
    })
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la organización' })
    expect(within(card).getByRole('status')).toHaveTextContent('Cargando el perfil…')
    const skeleton = await within(card).findByTestId('skeleton', {}, { timeout: 1500 })
    expect(skeleton).toHaveClass('skeleton-facts')
  })

  it('muestra el avance en la cabecera de la tarjeta de la empresa', async () => {
    profile = { ...companyProfile, rfc: null, sector_code: null, missing: ['rfc', 'sector_code'] }
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(card.querySelector('.account-card-head')).toHaveTextContent('5 de 7 datos')
    expect(card.querySelector('.account-card-head .profile-meter')).toBeInTheDocument()
    // El detalle debajo dice qué falta sin repetir la cuenta.
    expect(within(card).getByRole('list', { name: 'Datos pendientes' })).toHaveTextContent('RFC')
    expect(card.querySelectorAll('.profile-meter')).toHaveLength(1)
  })

  it('un perfil de empresa sin ningún dato muestra un estado vacío con la siguiente acción', async () => {
    profile = emptyCompany
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(card).toHaveTextContent('Tu empresa aún no tiene perfil')
    expect(within(card).queryByText('Sin capturar')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Completar perfil' }))
    expect(within(card).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('un grupo sin datos se resume en una línea en lugar de repetir Sin capturar', async () => {
    profile = { ...companyProfile, state_code: null, municipality_code: null, municipality: null, contact_name: null, contact_email: null,
      missing: ['contact_name', 'contact_email', 'location'] }
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(card).toHaveTextContent('Aún sin ubicación.')
    expect(card).toHaveTextContent('Aún no hay contacto.')
    expect(within(card).queryByText('Sin capturar')).not.toBeInTheDocument()
  })

  it('el aviso de confirmación se cierra con su botón', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ user: { ...companyUser, name: 'Lucía Herrera' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const identity = await screen.findByRole('region', { name: 'Tu perfil' })
    fireEvent.click(within(identity).getByRole('button', { name: 'Editar nombre' }))
    fireEvent.change(within(identity).getByLabelText('Tu nombre'), { target: { value: 'Lucía Herrera' } })
    fireEvent.click(within(identity).getByRole('button', { name: 'Guardar' }))
    await expectSnackbar('Nombre actualizado.')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByText('Nombre actualizado.')).not.toBeInTheDocument()
  })
})

