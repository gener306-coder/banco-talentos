import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'

test.use({ storageState: ADMIN_STATE })

/** Crea una cuenta de la Secretaría con enlace manual desde la sección y devuelve el enlace. */
async function createSecretaryAccount(page: Page, account: { name: string; email: string }): Promise<string> {
  await page.getByRole('button', { name: 'Nueva cuenta de la Secretaría', exact: true }).click()
  const creation = page.getByRole('dialog', { name: 'Nueva cuenta de la Secretaría' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  const created = page.waitForResponse((response) => response.url().endsWith('/api/secretary-accounts') && response.request().method() === 'POST')
  await creation.getByRole('button', { name: 'Crear cuenta de la Secretaría', exact: true }).click()
  expect((await created).status()).toBe(201)
  const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(creation).toBeHidden()
  return link
}

test('HU-S4-01: ADMIN crea una cuenta de la Secretaría → la titular establece su contraseña → crea a una colega', async ({ page, browser, baseURL }) => {
  const suffix = randomBytes(8).toString('hex')
  const account = { name: `Analista SE ${suffix}`, email: `se-${suffix}@example.test`, password: randomBytes(24).toString('hex') }
  const colleague = { name: `Colega SE ${suffix}`, email: `colega-se-${suffix}@example.test` }

  // CA-08: ADMIN llega a la sección desde el inicio.
  await page.goto('/')
  await page.getByRole('link', { name: 'Cuentas de la Secretaría', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Cuentas de la Secretaría' })).toBeVisible()
  const link = await createSecretaryAccount(page, account)
  // CA-05: aparece en el listado como pendiente.
  const row = page.getByRole('row').filter({ hasText: account.email })
  await expect(row).toContainText('PENDIENTE')

  const holderContext = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    const holder = await holderContext.newPage()
    await holder.goto(link)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByLabel('Confirmar contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    await expect(holder.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')

    await holder.goto('/login')
    await holder.getByLabel('Correo electrónico').fill(account.email)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(holder.getByText('Secretaría de Economía', { exact: true })).toBeVisible()

    // CA-01: la Secretaría crea cuentas para su propio personal.
    await holder.getByRole('link', { name: 'Cuentas de la Secretaría', exact: true }).click()
    await expect(holder.getByRole('row').filter({ hasText: account.email })).toContainText('ACTIVA')
    await createSecretaryAccount(holder, colleague)
    await expect(holder.getByRole('row').filter({ hasText: colleague.email })).toContainText('PENDIENTE')

    // CA-02: no gestiona instituciones.
    await holder.goto('/institutions')
    await expect(holder.getByRole('alert')).toHaveText('No tienes permiso para acceder a la gestión de instituciones.')
  } finally {
    await holderContext.close()
  }
})
