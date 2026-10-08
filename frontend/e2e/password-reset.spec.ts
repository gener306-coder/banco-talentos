import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { linkFromMail } from './support/mailpit'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const mailpitUrl = process.env.MAILPIT_URL

test.beforeAll(() => {
  if (!adminEmail || !adminPassword || !mailpitUrl) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
}

async function choosePassword(page: Page, password: string, button: string, endpoint: string) {
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  const response = page.waitForResponse((candidate) =>
    candidate.url().endsWith(endpoint) && candidate.request().method() === 'POST')
  await page.getByRole('button', { name: button, exact: true }).click()
  return response
}

async function me(context: BrowserContext, baseURL: string) {
  return (await context.request.get('/api/me', { headers: { Origin: baseURL } })).status()
}

test('ADMIN inicia el restablecimiento → la persona titular establece su nueva contraseña → login exitoso', async ({ page, browser, baseURL, request }) => {
  const suffix = randomBytes(8).toString('hex')
  const institution = { name: `Instituto reset E2E ${suffix}`, cct: `RESET${suffix}`, email: `contacto-reset-${suffix}@example.test` }
  const account = {
    name: `Titular reset ${suffix}`,
    email: `reset-${suffix}@example.test`,
    // Las contraseñas existen solo en esta ejecución y nunca se proporcionan al ADMIN.
    initialPassword: randomBytes(24).toString('hex'),
    newPassword: randomBytes(24).toString('hex'),
  }

  // Preparación: institución y cuenta configurada con el flujo de HU-S1-03.
  await signIn(page, adminEmail!, adminPassword!)
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill(institution.name)
  await page.getByLabel('CCT', { exact: true }).fill(institution.cct)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(institution.email)
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  // La preparación usa la entrega manual (HU-S2-01) para obtener el enlace sin correo.
  const creation = page.getByRole('region', { name: 'Crear cuenta institucional' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  await creation.getByRole('button', { name: 'Crear cuenta institucional', exact: true }).click()
  const setupUrl = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()

  // Sesión abierta del titular con su contraseña inicial: debe cerrarse al restablecer (CA-13).
  const oldSession = await browser.newContext({ baseURL })
  const holderContext = await browser.newContext({ baseURL })
  try {
    const oldPage = await oldSession.newPage()
    await oldPage.goto(new URL(setupUrl, baseURL).toString())
    expect((await choosePassword(oldPage, account.initialPassword, 'Establecer contraseña', '/api/institution-accounts/password-setup')).status()).toBe(204)
    await signIn(oldPage, account.email, account.initialPassword)
    await expect(oldPage.getByText(account.email, { exact: true })).toBeVisible()
    expect(await me(oldSession, baseURL!)).toBe(200)

    // T06: el ADMIN solo identifica la cuenta; nunca ve ni escribe una contraseña.
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await page.getByLabel('Correo de la cuenta institucional', { exact: true }).fill(account.email)
    const startResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/institution-accounts/password-reset/start') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Iniciar restablecimiento de contraseña', exact: true }).click()
    const started = await startResponse
    expect(started.status()).toBe(200)
    expect(Object.keys(started.request().postDataJSON() as Record<string, unknown>).sort()).toEqual(['email', 'institution_id'])
    expect(await started.json()).toEqual({ reset_delivery: 'sent' })
    await expect(page.getByRole('region', { name: 'Restablecer contraseña de una cuenta' }).getByRole('status'))
      .toContainText('Se envió el enlace de restablecimiento')
    await expect(page.locator('input[type="password"]')).toHaveCount(0)

    // Iniciar el proceso no cambia la contraseña: la sesión del titular sigue activa.
    expect(await me(oldSession, baseURL!)).toBe(200)

    // T07: el titular abre el enlace recibido por correo en otro navegador.
    const link = new URL(await linkFromMail(request, account.email, 'Restablece tu contraseña', '/reset-password'))
    expect(link.origin).toBe(baseURL)
    expect(link.pathname).toBe('/reset-password')
    const holder = await holderContext.newPage()
    const resetDocument = await holder.goto(link.toString())
    expect(resetDocument?.headers()['referrer-policy']).toBe('no-referrer')
    await expect.poll(() => new URL(holder.url()).search.length).toBe(0)
    expect(new URL(holder.url()).pathname).toBe('/reset-password')
    const csrfRequest = holder.waitForRequest((candidate) => new URL(candidate.url()).pathname === '/sanctum/csrf-cookie')
    const reset = await choosePassword(holder, account.newPassword, 'Restablecer contraseña', '/api/institution-accounts/password-reset')
    expect(reset.status()).toBe(204)
    expect((await (await csrfRequest).headerValue('referer')) === null).toBe(true)
    expect((await reset.request().headerValue('referer')) === null).toBe(true)
    await expect(holder.getByRole('status')).toHaveText('Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.')

    // CA-13: la cookie de la sesión anterior ya no autentica.
    expect(await me(oldSession, baseURL!)).toBe(401)
    await oldPage.reload()
    await expect(oldPage).toHaveURL(/\/login$/)

    // CA-07: el enlace ya utilizado no puede volver a usarse.
    await holder.goto(link.toString())
    const replay = await choosePassword(holder, randomBytes(24).toString('hex'), 'Restablecer contraseña', '/api/institution-accounts/password-reset')
    expect(replay.status()).toBe(422)
    await expect(holder.getByRole('alert')).toHaveText('El enlace de restablecimiento no es válido, ha caducado o ya fue utilizado.')

    // La contraseña anterior ya no sirve; la nueva permite iniciar sesión.
    await signIn(holder, account.email, account.initialPassword)
    await expect(holder.getByRole('alert')).toHaveText('No fue posible iniciar sesión con esos datos.')
    await signIn(holder, account.email, account.newPassword)
    await expect(holder).toHaveURL(`${baseURL}/`)
    await expect(holder.getByText(account.email, { exact: true })).toBeVisible()
    await expect(holder.getByText(institution.name, { exact: true })).toBeVisible()
    expect(await me(holderContext, baseURL!)).toBe(200)

    // La sesión del ADMIN no se ve afectada.
    expect(await me(page.context(), baseURL!)).toBe(200)
  } finally {
    await oldSession.close()
    await holderContext.close()
  }
})
