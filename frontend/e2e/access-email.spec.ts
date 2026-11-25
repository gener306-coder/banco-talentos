import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { linkFromMail } from './support/mailpit'
import { createSecretaryAccount } from './support/secretary'

// Sprint 19, PR 1: correo de acceso verificado (T-S19-01 a T-S19-04), con los correos reales en Mailpit.
test.use({ storageState: ADMIN_STATE })

test.beforeAll(() => {
  if (!process.env.MAILPIT_URL) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

/** Establece la contraseña con el enlace e inicia sesión en un contexto propio; devuelve también la contraseña. */
async function activate(browser: Browser, baseURL: string | undefined, link: string, email: string): Promise<{ page: Page; password: string }> {
  const password = randomBytes(24).toString('hex')
  const context = await browser.newContext({ baseURL, ...NO_SESSION })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  // Una institución invitada entra a su onboarding (/welcome); las demás cuentas, al inicio.
  await expect(page).not.toHaveURL(/\/login$/)
  return { page, password }
}

test('una cuenta con enlace manual verifica su correo y lo cambia con confirmación desde el correo nuevo', async ({ page, browser, baseURL, request }) => {
  const suffix = randomBytes(8).toString('hex')
  const email = `correo-${suffix}@example.test`
  const newEmail = `correo-nuevo-${suffix}@example.test`
  await page.goto('/secretary-accounts')
  const link = await createSecretaryAccount(page, { name: `Correo ${suffix}`, email })
  const { page: secretary, password } = await activate(browser, baseURL, link, email)

  // D7: el enlace manual no prueba el buzón; Mi cuenta ofrece verificarlo sin bloquear nada.
  await secretary.goto('/account')
  const access = secretary.getByRole('region', { name: 'Acceso y seguridad' })
  await expect(access.getByText('Sin verificar', { exact: true })).toBeVisible()
  await access.getByRole('button', { name: 'Enviar enlace de verificación', exact: true }).click()
  await expect(access.getByRole('button', { name: /^Reenviar enlace \(\d+ s\)$/ })).toBeDisabled()
  await secretary.goto(await linkFromMail(request, email, 'Verifica tu correo de acceso', '/confirm-email'))
  await expect(secretary.getByText(`Listo: verificamos tu correo de acceso ${email}.`)).toBeVisible()
  await expect(secretary).toHaveURL(/\/confirm-email$/)
  await secretary.goto('/account')
  await expect(access.getByText('Correo verificado', { exact: true })).toBeVisible()

  // T-S19-03: el correo actual sigue activo hasta confirmar desde el nuevo.
  await access.getByRole('button', { name: 'Cambiar correo', exact: true }).click()
  const sheet = secretary.getByRole('dialog', { name: 'Cambiar correo de acceso' })
  await sheet.getByLabel('Nuevo correo de acceso', { exact: true }).fill(newEmail)
  await sheet.getByLabel('Contraseña actual', { exact: true }).fill(password)
  await sheet.getByRole('button', { name: 'Enviar enlace de confirmación', exact: true }).click()
  await expect(access.getByRole('region', { name: 'Confirmación de correo pendiente' })).toContainText(newEmail)
  await expect(access.getByText('Cambio pendiente', { exact: true })).toBeVisible()
  const confirmation = await linkFromMail(request, newEmail, 'Confirma tu nuevo correo de acceso', '/confirm-email')

  // Se confirma desde otro navegador, sin sesión: la sesión anterior se cierra y se entra con el correo nuevo.
  const other = await (await browser.newContext({ baseURL, ...NO_SESSION })).newPage()
  await other.goto(confirmation)
  await expect(other.getByText(`Listo: tu correo de acceso ahora es ${newEmail}. Cerramos tus sesiones en otros dispositivos.`)).toBeVisible()
  await other.goto(confirmation)
  await expect(other.getByRole('alert')).toHaveText('El enlace no es válido: venció, ya se usó o el cambio se canceló.')
  await other.goto('/login')
  await other.getByLabel('Correo electrónico').fill(newEmail)
  await other.getByLabel('Contraseña', { exact: true }).fill(password)
  await other.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(other.getByRole('heading', { name: /^Hola, / })).toBeVisible()
  expect((await secretary.request.get('/api/me')).status()).toBe(401)
})

test('ADMIN corrige el correo mal escrito de una cuenta institucional pendiente y el enlace anterior deja de servir', async ({ page, browser, baseURL, request }) => {
  const suffix = randomBytes(8).toString('hex')
  const typo = `coordinacoin-${suffix}@example.test`
  const right = `coordinacion-${suffix}@example.test`

  await page.goto('/institutions/new')
  await page.getByLabel('Correo de la cuenta', { exact: true }).fill(typo)
  await page.getByLabel('Nombre de la institución (opcional)', { exact: true }).fill(`Instituto correo ${suffix}`)
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  const oldLink = await linkFromMail(request, typo, 'Establece tu contraseña', '/set-initial-password')

  // T-S19-02: el listado nuevo muestra la cuenta pendiente con el correo equivocado.
  const accounts = page.getByRole('region', { name: 'Listado de cuentas institucionales' })
  // Sin nombre de referencia, la cuenta lleva su correo como nombre provisional (M3).
  const row = accounts.getByRole('row', { name: new RegExp(typo) })
  await expect(row.getByRole('cell').first()).toContainText(typo)
  await expect(row.getByText('Pendiente de activar', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: /^Corregir el correo de / }).click()
  const sheet = page.getByRole('dialog', { name: 'Corregir correo de acceso' })
  await expect(sheet.getByLabel('Correo actual', { exact: true })).toHaveValue(typo)
  await sheet.getByLabel('Correo nuevo', { exact: true }).fill(right)
  await sheet.getByRole('button', { name: 'Guardar y enviar enlace', exact: true }).click()
  await expect(sheet.getByRole('status')).toHaveText(`Correo corregido. Enviamos un enlace nuevo a ${right}.`)
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click()
  // El correo y el nombre provisional quedan corregidos; el correo equivocado ya no aparece.
  await expect(accounts.getByRole('rowheader', { name: right, exact: true })).toBeVisible()
  await expect(accounts.getByRole('cell').filter({ hasText: right }).first()).toContainText('Pendiente de activar')
  await expect(accounts).not.toContainText(typo)

  const stranger = await (await browser.newContext({ baseURL, ...NO_SESSION })).newPage()
  await stranger.goto(oldLink)
  const attempt = randomBytes(24).toString('hex')
  await stranger.getByLabel('Contraseña', { exact: true }).fill(attempt)
  await stranger.getByLabel('Confirmar contraseña', { exact: true }).fill(attempt)
  await stranger.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
  await expect(stranger.getByRole('alert')).toContainText('El enlace de configuración no es válido, ha caducado o ya fue utilizado.')

  // El enlace nuevo activa la cuenta y deja su correo verificado (enviado por correo, D7).
  const { page: institution } = await activate(browser, baseURL, await linkFromMail(request, right, 'Establece tu contraseña', '/set-initial-password'), right)
  await institution.goto('/account')
  await expect(institution.getByRole('region', { name: 'Acceso y seguridad' }).getByText('Correo verificado', { exact: true })).toBeVisible()
})
