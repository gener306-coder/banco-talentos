import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { newSecretarySession, signInWithSetupLink } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

/** La Secretaría registra una empresa mínima y queda en su detalle. */
async function registerCompany(page: Page, legalName: string) {
  await page.goto('/companies/new')
  await page.getByLabel('Razón social', { exact: true }).fill(legalName)
  await page.getByLabel('RFC', { exact: true }).fill(`CTA010101${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`)
  await page.getByLabel('Sector económico (SCIAN)').selectOption('54')
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'Nuevo León' })
  await page.getByRole('combobox', { name: 'Municipio' }).fill('monterrey')
  await page.getByRole('option', { name: 'Monterrey', exact: true }).click()
  await page.getByLabel('Nombre del contacto', { exact: true }).fill('Responsable dual')
  await page.getByLabel('Correo del contacto', { exact: true }).fill(`dual-${randomBytes(4).toString('hex')}@example.test`)
  await page.getByRole('button', { name: 'Registrar empresa', exact: true }).click()
  await expect(page.getByText('Empresa registrada correctamente.', { exact: true })).toBeVisible()
}

test('HU-S4-03: la Secretaría crea la cuenta de una empresa → la titular entra → inactivar la empresa la deja fuera', async ({ page, browser, baseURL }) => {
  const { context: secretaryContext, page: secretary } = await newSecretarySession(page, browser, baseURL, 'cuentas-empresa-se')
  const suffix = randomBytes(6).toString('hex')
  const legalName = `Servicios E2E ${suffix}, S.C.`
  const email = `talento-${suffix}@example.test`
  try {
    await registerCompany(secretary, legalName)

    // CA-01, CA-02: alta con enlace manual desde el detalle de la empresa.
    await secretary.getByRole('button', { name: 'Nueva cuenta de la empresa', exact: true }).click()
    const creation = secretary.getByRole('dialog', { name: 'Nueva cuenta de la empresa' })
    await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(`Talento ${suffix}`)
    await creation.getByLabel('Correo de acceso', { exact: true }).fill(email)
    await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
    await creation.getByRole('button', { name: 'Crear cuenta de la empresa', exact: true }).click()
    const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
    await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()
    // CA-06: aparece en el listado de la empresa como pendiente.
    await expect(secretary.getByRole('row').filter({ hasText: email })).toContainText('PENDIENTE')

    // CA-05: la titular entra y ve su empresa.
    const { context: holderContext, page: holder } = await signInWithSetupLink(browser, baseURL, link, email)
    try {
      await expect(holder.getByText(legalName, { exact: true })).toBeVisible()
      await expect(holder.getByText('Empresa', { exact: true })).toBeVisible()

      // CA-04: al inactivar la empresa, la sesión abierta pierde el acceso en su siguiente petición.
      await secretary.reload()
      await expect(secretary.getByRole('row').filter({ hasText: email })).toContainText('ACTIVA')
      await secretary.getByRole('button', { name: 'Inactivar empresa', exact: true }).click()
      await secretary.getByRole('alertdialog', { name: '¿Inactivar la empresa?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
      await expect(secretary.getByText('Empresa inactivada correctamente.', { exact: true })).toBeVisible()

      await holder.reload()
      await expect(holder.getByRole('alert')).toHaveText('La empresa está inactiva. No puedes acceder al sistema.')
    } finally {
      await holderContext.close()
    }
  } finally {
    await secretaryContext.close()
  }
})
