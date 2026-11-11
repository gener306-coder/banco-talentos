import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { linkFromMail, mailCount } from './support/mailpit'

test.use({ storageState: ADMIN_STATE })

test('ADMIN registra, consulta, edita, inactiva y reactiva una institución conservando sus datos', async ({ page, request }) => {
  const suffix = Date.now().toString()
  const institution = {
    name: `Instituto E2E ${suffix}`,
    cct: `E2E${suffix}`,
    contactEmail: `vinculacion-${suffix}@example.test`,
  }
  const updated = {
    name: `${institution.name} actualizado`,
    cct: `${institution.cct}A`,
    contactEmail: `direccion-${suffix}@example.test`,
  }

  // La sesión ADMIN ya viene de admin.setup.ts: se parte del área protegida.
  await page.goto('/')
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions$/)
  await expect(page.getByRole('heading', { name: 'Instituciones', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/new$/)
  await page.getByLabel('Nombre', { exact: true }).fill(institution.name)
  await page.getByLabel('CCT', { exact: true }).fill(institution.cct)
  await page.getByLabel('Nombre de la persona responsable', { exact: true }).fill('Responsable E2E')
  await page.getByLabel('Correo de la persona responsable', { exact: true }).fill(institution.contactEmail)
  await page.getByLabel('Teléfono (opcional)', { exact: true }).fill('834 318 1800')
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  // T-S8-11: el registro crea la cuenta del responsable y le envía el enlace para su contraseña.
  await expect(page.getByRole('status')).toHaveText(`Institución registrada. Enviamos a ${institution.contactEmail} el enlace para establecer su contraseña.`)
  expect(await linkFromMail(request, institution.contactEmail, 'Establece tu contraseña', '/set-initial-password')).toContain('/set-initial-password?')
  await expect(page.getByRole('link', { name: '834 318 1800', exact: true })).toHaveAttribute('href', 'tel:8343181800')
  const institutionUrl = page.url()
  await expect(page.getByText(institution.name, { exact: true })).toBeVisible()
  await expect(page.getByText(institution.cct, { exact: true })).toBeVisible()
  await expect(page.getByText(institution.contactEmail, { exact: true })).toBeVisible()
  await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Volver a instituciones', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: institution.name })
  await expect(row).toContainText(institution.cct)
  await expect(row).toContainText(institution.contactEmail)
  await expect(row.getByText('ACTIVA', { exact: true })).toBeVisible()
  await row.getByRole('link', { name: `Ver detalle de ${institution.name}`, exact: true }).click()
  await expect(page).toHaveURL(institutionUrl)

  await page.getByRole('link', { name: 'Editar institución', exact: true }).click()
  await expect(page).toHaveURL(`${institutionUrl}/edit`)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(institution.name)
  await expect(page.getByLabel('CCT', { exact: true })).toHaveValue(institution.cct)
  await expect(page.getByLabel('Correo de contacto', { exact: true })).toHaveValue(institution.contactEmail)
  await page.getByLabel('Nombre', { exact: true }).fill(updated.name)
  await page.getByLabel('CCT', { exact: true }).fill(updated.cct)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(updated.contactEmail)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page).toHaveURL(institutionUrl)
  await expect(page.getByText(updated.name, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.cct, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.contactEmail, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Inactivar institución', exact: true }).click()
  await page.getByRole('alertdialog', { name: '¿Inactivar la institución?' })
    .getByRole('button', { name: 'Inactivar', exact: true }).click()
  await expect(page.getByText('INACTIVA', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(institutionUrl)
  await expect(page.getByText('INACTIVA', { exact: true })).toBeVisible()
  await expect(page.getByText(updated.name, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.cct, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.contactEmail, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Activar institución', exact: true }).click()
  await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(institutionUrl)
  await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()
  await expect(page.getByText(updated.name, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.cct, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.contactEmail, { exact: true })).toBeVisible()
})

test('T-S8-11: ADMIN registra una institución y comparte el enlace del responsable sin correo', async ({ page, request, context }) => {
  const suffix = Date.now().toString()
  const email = `enlace-${suffix}@example.test`
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/institutions/new')
  await page.getByLabel('Nombre', { exact: true }).fill(`Instituto enlace E2E ${suffix}`)
  await page.getByLabel('CCT', { exact: true }).fill(`ENLACE${suffix}`)
  await page.getByLabel('Nombre de la persona responsable', { exact: true }).fill('Responsable enlace')
  await page.getByLabel('Puesto o departamento (opcional)', { exact: true }).fill('Coordinación Dual')
  await page.getByLabel('Correo de la persona responsable', { exact: true }).fill(email)
  await page.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()

  // El enlace se queda en esta página para copiarlo; no llega ningún correo.
  await expect(page.getByRole('status').first()).toHaveText('Institución registrada. Copia el enlace y compártelo con Responsable enlace para que establezca su contraseña.')
  const link = await page.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  expect(link).toContain('/set-initial-password?')
  await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
  expect(await page.evaluate('navigator.clipboard.readText()') === link).toBe(true)
  expect(await mailCount(request, email)).toBe(0)

  await page.getByRole('link', { name: 'Ver la institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  await expect(page.getByText('Responsable enlace', { exact: true })).toBeVisible()
  await expect(page.getByText('Coordinación Dual', { exact: true })).toBeVisible()
})
