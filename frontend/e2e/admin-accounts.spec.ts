import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { signInWithSetupLink } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

test('HU-S16-02: ADMIN invita a otro Administrador → entra con su enlace → ADMIN lo inactiva (su sesión se cierra) y lo reactiva', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  const suffix = randomBytes(6).toString('hex')
  const email = `admin-${suffix}@example.test`
  const name = `Operación ${suffix}`

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Administración' }).getByRole('link', { name: /Cuentas de Administración/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Cuentas de Administración' })).toBeVisible()

  // CA-01: invitación con enlace manual.
  await page.getByRole('button', { name: 'Nueva cuenta de Administración', exact: true }).click()
  const creation = page.getByRole('dialog', { name: 'Nueva cuenta de Administración' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  const created = page.waitForResponse((response) => response.url().endsWith('/api/admin-accounts') && response.request().method() === 'POST')
  await creation.getByRole('button', { name: 'Crear cuenta de Administración', exact: true }).click()
  expect((await created).status()).toBe(201)
  const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const { context, page: invited } = await signInWithSetupLink(browser, baseURL, link, email)
  try {
    await expect(invited.getByRole('navigation', { name: 'Administración' })).toBeVisible()

    // CA-02 a CA-04: inactivar con confirmación cierra su sesión en la siguiente petición; reactivar la devuelve.
    await page.reload()
    const row = page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: `Inactivar la cuenta de ${name}` }).click()
    await page.getByRole('alertdialog', { name: '¿Inactivar la cuenta?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
    await expect(row).toContainText('INACTIVA')
    await invited.reload()
    await expect(invited.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()

    await row.getByRole('button', { name: `Activar la cuenta de ${name}` }).click()
    await expect(row).toContainText('ACTIVA')
  } finally {
    await context.close()
  }
})
