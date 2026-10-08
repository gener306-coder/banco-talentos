import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const mailpitUrl = process.env.MAILPIT_URL

test.beforeAll(() => {
  if (!adminEmail || !adminPassword || !mailpitUrl) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

test('HU-S2-01: ADMIN genera el enlace manual sin correo → la persona titular lo usa una sola vez → login', async ({ page, browser, baseURL, request, context }) => {
  const suffix = randomBytes(8).toString('hex')
  const account = { name: `Titular manual ${suffix}`, email: `manual-${suffix}@example.test`, password: randomBytes(24).toString('hex') }
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(adminEmail!)
  await page.getByLabel('Contraseña', { exact: true }).fill(adminPassword!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill(`Instituto manual E2E ${suffix}`)
  await page.getByLabel('CCT', { exact: true }).fill(`MANUAL${suffix}`)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(`contacto-manual-${suffix}@example.test`)
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)

  const creation = page.getByRole('region', { name: 'Crear cuenta institucional' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  const createdResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/institution-accounts') && response.request().method() === 'POST')
  await creation.getByRole('button', { name: 'Crear cuenta institucional', exact: true }).click()
  const created = await createdResponse
  expect(created.status()).toBe(201)
  expect((created.request().postDataJSON() as { delivery_method: string }).delivery_method).toBe('manual')
  expect((await created.json() as { setup_delivery: string }).setup_delivery).toBe('manual')

  // CA-03/CA-04: el enlace se muestra como texto de solo lectura y se copia al portapapeles.
  const field = creation.getByLabel('Enlace de configuración', { exact: true })
  await expect(field).toHaveAttribute('readonly', '')
  const link = await field.inputValue()
  await creation.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
  await expect(creation.getByRole('status').filter({ hasText: 'Enlace copiado al portapapeles.' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText()) === link).toBe(true)
  await expect(page.locator('a[href*="set-initial-password"]')).toHaveCount(0)

  // Ningún correo llegó al buzón. En testing el método email tampoco envía; la garantía de que
  // manual no programa correos en local/production la cubren las pruebas Pest.
  const search = await request.get(`${mailpitUrl}/api/v1/search`, { params: { query: `to:"${account.email}"` } })
  expect((await search.json() as { messages: unknown[] }).messages).toHaveLength(0)

  const holderContext = await browser.newContext({ baseURL })
  try {
    const holder = await holderContext.newPage()
    const setupUrl = new URL(link)
    expect(setupUrl.origin).toBe(baseURL)
    await holder.goto(setupUrl.toString())
    await expect.poll(() => new URL(holder.url()).search.length).toBe(0)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByLabel('Confirmar contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    await expect(holder.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')

    // CA-05: el enlace manual es de un solo uso.
    const replayPassword = randomBytes(24).toString('hex')
    await holder.goto(setupUrl.toString())
    await holder.getByLabel('Contraseña', { exact: true }).fill(replayPassword)
    await holder.getByLabel('Confirmar contraseña', { exact: true }).fill(replayPassword)
    const replay = holder.waitForResponse((response) => response.url().endsWith('/api/institution-accounts/password-setup'))
    await holder.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    expect((await replay).status()).toBe(422)
    await expect(holder.getByRole('alert')).toHaveText('El enlace de configuración no es válido, ha caducado o ya fue utilizado.')

    await holder.goto('/login')
    await holder.getByLabel('Correo electrónico').fill(account.email)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(holder).toHaveURL(`${baseURL}/`)
    await expect(holder.getByText(account.email, { exact: true })).toBeVisible()
  } finally {
    await holderContext.close()
  }
})
