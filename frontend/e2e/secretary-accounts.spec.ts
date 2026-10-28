import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { linkFromMail } from './support/mailpit'
import { createSecretaryAccount, newSecretarySession, signInWithSetupLink } from './support/secretary'

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

test('HU-S6-04: ADMIN inactiva una cuenta de la Secretaría (su sesión se cierra), la reactiva y restablece su contraseña por correo', async ({ page, browser, baseURL, request }) => {
  const { email, context, page: holder } = await newSecretarySession(page, browser, baseURL, 'baja-se')
  const resetContext = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    await page.goto('/secretary-accounts')
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toContainText('ACTIVA')

    // CA-01, CA-04: inactivar se confirma y cierra la sesión abierta en su siguiente petición.
    await row.getByRole('button', { name: /^Inactivar la cuenta de/ }).click()
    await page.getByRole('alertdialog', { name: '¿Inactivar la cuenta?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
    await expect(row).toContainText('INACTIVA')
    await holder.goto('/secretary-accounts')
    await expect(holder.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()

    await row.getByRole('button', { name: /^Activar la cuenta de/ }).click()
    await expect(page.getByText(/activada correctamente/)).toBeVisible()
    await expect(row).toContainText('ACTIVA')

    // CA-02: restablecimiento por correo con el enlace de un solo uso de HU-S1-04.
    await row.getByRole('button', { name: /^Restablecer la contraseña de/ }).click()
    await page.getByRole('alertdialog', { name: '¿Restablecer la contraseña?' }).getByRole('button', { name: 'Enviar enlace', exact: true }).click()
    await expect(page.getByText(`Se envió el enlace de restablecimiento a ${email}`, { exact: false })).toBeVisible()

    const link = await linkFromMail(request, email, 'Restablece tu contraseña', '/reset-password')
    const password = randomBytes(24).toString('hex')
    const reset = await resetContext.newPage()
    await reset.goto(link)
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
    await context.close()
  }
})
