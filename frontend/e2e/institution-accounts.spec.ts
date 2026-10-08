import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD

test.beforeAll(() => {
  if (!adminEmail || !adminPassword) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

test('ADMIN crea una cuenta sin contraseña; su titular la establece y pierde acceso al inactivar la institución', async ({ page, browser, baseURL }) => {
  const suffix = randomBytes(8).toString('hex')
  const institution = {
    name: `Instituto cuentas E2E ${suffix}`,
    cct: `CUENTAS${suffix}`,
    email: `contacto-${suffix}@example.test`,
  }
  const account = {
    name: `Responsable ${suffix}`,
    email: `cuenta-${suffix}@example.test`,
    // La contraseña existe únicamente en esta ejecución y nunca se proporciona al ADMIN.
    password: randomBytes(24).toString('hex'),
  }

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(adminEmail!)
  await page.getByLabel('Contraseña', { exact: true }).fill(adminPassword!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill(institution.name)
  await page.getByLabel('CCT', { exact: true }).fill(institution.cct)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(institution.email)
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  await expect(page.getByText(institution.name, { exact: true })).toBeVisible()

  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await page.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await page.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  const createdResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/institution-accounts') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Crear cuenta institucional', exact: true }).click()
  const created = await createdResponse
  expect(created.status()).toBe(201)
  expect(Object.keys(created.request().postDataJSON() as Record<string, unknown>).sort())
    .toEqual(['delivery_method', 'email', 'institution_id', 'name'])
  expect((created.request().postDataJSON() as { delivery_method: string }).delivery_method).toBe('email')
  const result = await created.json() as {
    data: { id: number; email: string; role: string; institution: { id: number; name: string } }
    setup_url: string
  }
  expect(result.data.email).toBe(account.email)
  expect(result.data.role).toBe('INSTITUTION')
  expect(result.data.institution.name).toBe(institution.name)
  expect(Object.hasOwn(result.data, 'password')).toBe(false)
  expect(typeof result.setup_url).toBe('string')
  const setupUrl = new URL(result.setup_url, baseURL)
  expect(setupUrl.origin).toBe(baseURL)

  // Un contexto independiente representa al titular; no comparte las cookies del ADMIN.
  const holderContext = await browser.newContext({ baseURL })
  try {
    const holder = await holderContext.newPage()
    const setupDocument = await holder.goto(setupUrl.toString())
    expect(setupDocument?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(holder.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    // Las aserciones no imprimen el enlace si falla la limpieza de sus credenciales.
    await expect.poll(() => new URL(holder.url()).search.length).toBe(0)
    expect(new URL(holder.url()).pathname).toBe('/set-initial-password')
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByLabel('Confirmar contraseña', { exact: true }).fill(account.password)
    const csrfRequest = holder.waitForRequest((request) =>
      new URL(request.url()).pathname === '/sanctum/csrf-cookie')
    const setupResponse = holder.waitForResponse((response) =>
      response.url().endsWith('/api/institution-accounts/password-setup') && response.request().method() === 'POST')
    await holder.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    const configured = await setupResponse
    expect(configured.status()).toBe(204)
    expect((await (await csrfRequest).headerValue('referer')) === null).toBe(true)
    expect((await configured.request().headerValue('referer')) === null).toBe(true)
    await expect(holder.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')

    // La recuperación inicial ya no puede utilizarse para cambiar una contraseña establecida.
    const adminXsrf = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')
    expect(Boolean(adminXsrf)).toBe(true)
    const resend = await page.context().request.post('/api/institution-accounts/resend-setup', {
      headers: { Origin: baseURL!, 'X-XSRF-TOKEN': decodeURIComponent(adminXsrf!.value) },
      data: { email: account.email, institution_id: result.data.institution.id },
    })
    expect(resend.status()).toBe(422)

    await holder.getByRole('link', { name: 'Iniciar sesión', exact: true }).click()
    await holder.getByLabel('Correo electrónico').fill(account.email)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(holder).toHaveURL(`${baseURL}/`)
    await expect(holder.getByText(account.email, { exact: true })).toBeVisible()
    await expect(holder.getByText('Institución', { exact: true })).toBeVisible()
    await expect(holder.getByText('Institución vinculada', { exact: true })).toBeVisible()
    await expect(holder.getByText(institution.name, { exact: true })).toBeVisible()
    await expect(holder.getByRole('link', { name: 'Instituciones', exact: true })).toHaveCount(0)

    const me = await holderContext.request.get('/api/me', { headers: { Origin: baseURL! } })
    expect(me.status()).toBe(200)
    const session = await me.json() as { user: Record<string, unknown> }
    expect(session.user).toMatchObject({
      id: result.data.id,
      email: account.email,
      role: 'INSTITUTION',
      institution: result.data.institution,
    })
    expect(Object.hasOwn(session.user, 'password')).toBe(false)

    const denied = await holderContext.request.get('/api/institutions', { headers: { Origin: baseURL! } })
    expect(denied.status()).toBe(403)
    await holder.goto('/institutions')
    await expect(holder.getByRole('heading', { name: 'Acceso denegado', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Inactivar institución', exact: true }).click()
    await expect(page.getByText('INACTIVA', { exact: true })).toBeVisible()
    const revoked = await holderContext.request.get('/api/me', { headers: { Origin: baseURL! } })
    expect(revoked.status()).toBe(401)
    await holder.reload()
    await expect(holder).toHaveURL(/\/login$/)
    await holder.getByLabel('Correo electrónico').fill(account.email)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(holder.getByRole('alert'))
      .toHaveText('La institución está inactiva. No puedes acceder al sistema.')
    await expect(holder).toHaveURL(/\/login$/)
    const unauthenticated = await holderContext.request.get('/api/me', { headers: { Origin: baseURL! } })
    expect(unauthenticated.status()).toBe(401)
  } finally {
    await holderContext.close()
  }
})
