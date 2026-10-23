import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { createSecretaryAccount, signInWithSetupLink } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

test('HU-S4-01: ADMIN crea una cuenta de la Secretaría → la titular establece su contraseña → crea a una colega', async ({ page, browser, baseURL }) => {
  const suffix = randomBytes(8).toString('hex')
  const account = { name: `Analista SE ${suffix}`, email: `se-${suffix}@example.test` }
  const colleague = { name: `Colega SE ${suffix}`, email: `colega-se-${suffix}@example.test` }

  // CA-08: ADMIN llega a la sección desde el inicio.
  await page.goto('/')
  await page.getByRole('link', { name: 'Cuentas de la Secretaría', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Cuentas de la Secretaría' })).toBeVisible()
  const link = await createSecretaryAccount(page, account)
  // CA-05: aparece en el listado como pendiente.
  await expect(page.getByRole('row').filter({ hasText: account.email })).toContainText('PENDIENTE')

  const { context, page: holder } = await signInWithSetupLink(browser, baseURL, link, account.email)
  try {
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
    await context.close()
  }
})
