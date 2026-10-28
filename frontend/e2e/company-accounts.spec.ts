import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { linkFromMail } from './support/mailpit'
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

test('HU-S6-04: la Secretaría inactiva una cuenta de empresa (su sesión se cierra), la reactiva y restablece su contraseña por correo', async ({ page, browser, baseURL, request }) => {
  const { context: secretaryContext, page: secretary } = await newSecretarySession(page, browser, baseURL, 'acceso-empresa-se')
  const suffix = randomBytes(6).toString('hex')
  const email = `acceso-${suffix}@example.test`
  const resetContext = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    await registerCompany(secretary, `Acceso E2E ${suffix}, S.C.`)
    await secretary.getByRole('button', { name: 'Nueva cuenta de la empresa', exact: true }).click()
    const creation = secretary.getByRole('dialog', { name: 'Nueva cuenta de la empresa' })
    await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(`Acceso ${suffix}`)
    await creation.getByLabel('Correo de acceso', { exact: true }).fill(email)
    await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
    await creation.getByRole('button', { name: 'Crear cuenta de la empresa', exact: true }).click()
    const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
    await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()

    const { context: holderContext, page: holder } = await signInWithSetupLink(browser, baseURL, link, email)
    try {
      // CA-03, CA-04: inactivar se confirma y cierra la sesión abierta en su siguiente petición.
      await secretary.reload()
      const row = secretary.getByRole('row').filter({ hasText: email })
      await row.getByRole('button', { name: /^Inactivar la cuenta de/ }).click()
      await secretary.getByRole('alertdialog', { name: '¿Inactivar la cuenta?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
      await expect(row).toContainText('INACTIVA')
      await holder.reload()
      await expect(holder.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()

      await row.getByRole('button', { name: /^Activar la cuenta de/ }).click()
      await expect(row).toContainText('ACTIVA')
    } finally {
      await holderContext.close()
    }

    // CA-03: restablecimiento por correo desde el detalle de la empresa.
    await secretary.getByRole('row').filter({ hasText: email }).getByRole('button', { name: /^Restablecer la contraseña de/ }).click()
    await secretary.getByRole('alertdialog', { name: '¿Restablecer la contraseña?' }).getByRole('button', { name: 'Enviar enlace', exact: true }).click()
    await expect(secretary.getByText(`Se envió el enlace de restablecimiento a ${email}`, { exact: false })).toBeVisible()

    const password = randomBytes(24).toString('hex')
    const reset = await resetContext.newPage()
    await reset.goto(await linkFromMail(request, email, 'Restablece tu contraseña', '/reset-password'))
    await reset.getByLabel('Contraseña', { exact: true }).fill(password)
    await reset.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
    await reset.getByRole('button', { name: 'Restablecer contraseña', exact: true }).click()
    await expect(reset.getByRole('status')).toHaveText('Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.')
    await reset.goto('/login')
    await reset.getByLabel('Correo electrónico').fill(email)
    await reset.getByLabel('Contraseña', { exact: true }).fill(password)
    await reset.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(reset.getByText(email, { exact: true })).toBeVisible()
  } finally {
    await resetContext.close()
    await secretaryContext.close()
  }
})
