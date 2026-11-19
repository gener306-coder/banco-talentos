import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { linkFromMail, mailCount } from './support/mailpit'
import { inviteCompany } from './support/company'
import { openSecretarySession } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

/** RFC de persona moral con fecha válida y homoclave aleatoria. */
const rfc = () => `EMP010101${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`

test('HU-S4-02, HU-S14-02: la Secretaría invita una empresa → la busca por correo → completa su perfil → la inactiva y la reactiva', async ({ page, browser, baseURL, request }) => {
  const { context, page: secretary } = await openSecretarySession(browser, baseURL)
  const suffix = randomBytes(6).toString('hex')
  const email = `dual-${suffix}@example.test`
  const legalName = `Manufacturas E2E ${suffix}, S.A. de C.V.`
  const companyRfc = rfc()
  try {
    // CA-09: Empresas desde el inicio; HU-S14-02 CA-01: la invitación solo pide el correo de la cuenta.
    await secretary.getByRole('link', { name: 'Empresas', exact: true }).click()
    await secretary.getByRole('link', { name: 'Invitar empresa', exact: true }).click()
    await expect(secretary.getByLabel('Razón social', { exact: true })).toHaveCount(0)
    await secretary.getByLabel('Correo de la cuenta', { exact: true }).fill(email)
    const created = secretary.waitForResponse((response) => response.url().endsWith('/api/companies') && response.request().method() === 'POST')
    await secretary.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
    expect((await created).status()).toBe(201)
    await expect(secretary.getByText(`Invitación enviada. ${email} recibirá el enlace para crear su contraseña y completar el perfil de su empresa.`, { exact: true })).toBeVisible()
    expect(await linkFromMail(request, email, 'Establece tu contraseña', '/set-initial-password')).toContain('/set-initial-password?')
    // M3: sin nombre de la persona, la cuenta lleva el correo como nombre provisional.
    await expect(secretary.getByRole('row').filter({ hasText: email })).toContainText('PENDIENTE')
    await expect(secretary.locator('.company-details')).toContainText('Empresa sin nombre')
    await expect(secretary.locator('.company-details')).toContainText('Acceso pendiente')

    // CA-08, HU-S14-02 CA-03: la invitada sin nombre se encuentra por el correo de su cuenta.
    await secretary.getByRole('link', { name: 'Volver a empresas' }).click()
    await secretary.getByLabel('Buscar empresa').fill(email)
    await secretary.getByRole('button', { name: 'Buscar', exact: true }).click()
    const row = secretary.getByRole('row').filter({ hasText: email })
    await expect(row).toContainText('Empresa sin nombre')
    await expect(row).toContainText('Acceso pendiente')
    await row.getByRole('link', { name: /Ver detalle/ }).click()

    // M4: la Secretaría puede completar o corregir el perfil, con el municipio del catálogo.
    await secretary.getByRole('link', { name: 'Editar empresa', exact: true }).click()
    await secretary.getByLabel('Razón social', { exact: true }).fill(legalName)
    await secretary.getByLabel('RFC', { exact: true }).fill(companyRfc.toLowerCase())
    await secretary.getByLabel('Estado', { exact: true }).selectOption({ label: 'Tamaulipas' })
    await secretary.getByRole('combobox', { name: 'Municipio' }).fill('reynosa')
    await secretary.getByRole('option', { name: 'Reynosa', exact: true }).click()
    await secretary.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(secretary.getByText('Empresa actualizada correctamente.', { exact: true })).toBeVisible()
    await expect(secretary.getByText(companyRfc, { exact: true })).toBeVisible()
    await expect(secretary.getByText('Reynosa, Tamaulipas', { exact: true })).toBeVisible()

    // CA-07: inactivar pide confirmación; reactivar no.
    await secretary.getByRole('button', { name: 'Inactivar empresa', exact: true }).click()
    await secretary.getByRole('alertdialog', { name: '¿Inactivar la empresa?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
    await expect(secretary.getByText('Empresa inactivada correctamente.', { exact: true })).toBeVisible()
    await secretary.getByRole('button', { name: 'Activar empresa', exact: true }).click()
    await expect(secretary.getByText('Empresa activada correctamente.', { exact: true })).toBeVisible()

    // CA-03: el mismo RFC no puede capturarse en otra empresa.
    await inviteCompany(secretary, { email: `otro-${suffix}@example.test` })
    await secretary.getByRole('link', { name: 'Editar empresa', exact: true }).click()
    await secretary.getByLabel('RFC', { exact: true }).fill(companyRfc)
    await secretary.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(secretary.getByText('Ya existe una empresa registrada con ese RFC.')).toBeVisible()
  } finally {
    await context.close()
  }

  // CA-01: ADMIN no gestiona empresas.
  await page.goto('/companies')
  await expect(page.getByRole('alert')).toHaveText('No tienes permiso para gestionar empresas.')
})

test('T-S8-12: la Secretaría invita una empresa y comparte el enlace sin correo', async ({ browser, baseURL, request }) => {
  const { context, page: secretary } = await openSecretarySession(browser, baseURL)
  const suffix = randomBytes(6).toString('hex')
  const email = `enlace-${suffix}@example.test`
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  try {
    await secretary.goto('/companies/new')
    await secretary.getByLabel('Correo de la cuenta', { exact: true }).fill(email)
    await secretary.getByLabel('Nombre de la empresa (opcional)').fill(`Enlace E2E ${suffix}`)
    await secretary.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
    await secretary.getByRole('button', { name: 'Enviar invitación', exact: true }).click()

    // El enlace se queda en esta página para copiarlo; no llega ningún correo.
    await expect(secretary.getByRole('status').first()).toHaveText(`Invitación lista. Copia el enlace y compártelo con ${email} para que cree su contraseña y complete el perfil de su empresa.`)
    const link = await secretary.getByLabel('Enlace de configuración', { exact: true }).inputValue()
    expect(link).toContain('/set-initial-password?')
    await secretary.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
    expect(await secretary.evaluate('navigator.clipboard.readText()') === link).toBe(true)
    expect(await mailCount(request, email)).toBe(0)

    await secretary.getByRole('link', { name: 'Ver la empresa', exact: true }).click()
    await expect(secretary.getByRole('row').filter({ hasText: email })).toContainText('PENDIENTE')
    await expect(secretary.locator('.company-details')).toContainText(`Enlace E2E ${suffix}`)
  } finally {
    await context.close()
  }
})
