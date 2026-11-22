import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { linkFromMail, mailCount } from './support/mailpit'
import { randomCct } from './support/institution'

test.use({ storageState: ADMIN_STATE })

test('ADMIN invita, consulta, completa, inactiva y reactiva una institución conservando sus datos (HU-S16-06)', async ({ page, request }) => {
  const suffix = Date.now().toString()
  const institution = {
    name: `Instituto E2E ${suffix}`,
    accountEmail: `vinculacion-${suffix}@example.test`,
  }
  const updated = {
    name: `${institution.name} actualizado`,
    cct: randomCct(),
    contactEmail: `direccion-${suffix}@example.test`,
  }

  // La sesión ADMIN ya viene de admin.setup.ts: se parte del área protegida.
  await page.goto('/')
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions$/)
  await expect(page.getByRole('heading', { name: 'Instituciones', exact: true })).toBeVisible()

  // HU-S16-06: la invitación solo pide el correo de la cuenta; el nombre es una referencia opcional.
  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/new$/)
  await expect(page.getByLabel('CCT', { exact: true })).toHaveCount(0)
  await page.getByLabel('Correo de la cuenta', { exact: true }).fill(institution.accountEmail)
  await page.getByLabel('Nombre de la institución (opcional)', { exact: true }).fill(institution.name)
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  await expect(page.getByRole('status')).toHaveText(`Invitación enviada. ${institution.accountEmail} recibirá el enlace para crear su contraseña y completar el perfil de ${institution.name}.`)
  expect(await linkFromMail(request, institution.accountEmail, 'Establece tu contraseña', '/set-initial-password')).toContain('/set-initial-password?')
  const institutionUrl = page.url()
  await expect(page.getByText(institution.name, { exact: true })).toBeVisible()
  // D5: el contacto queda pendiente hasta que la institución completa su perfil.
  await expect(page.getByText('Sin capturar', { exact: true })).toHaveCount(3)
  await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()

  // HU-S16-05: el listado la encuentra por el correo de su cuenta y muestra su perfil pendiente.
  await page.getByRole('link', { name: 'Volver a instituciones', exact: true }).click()
  await page.getByLabel('Buscar institución', { exact: true }).fill(institution.accountEmail)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: institution.name })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(institution.accountEmail)
  await expect(row).toContainText('Acceso pendiente')
  await expect(row.getByText('ACTIVA', { exact: true })).toBeVisible()
  await row.getByRole('link', { name: `Ver detalle de ${institution.name}`, exact: true }).click()
  await expect(page).toHaveURL(institutionUrl)

  // La edición de Administración acepta cualquier dato, todos opcionales.
  await page.getByRole('link', { name: 'Editar institución', exact: true }).click()
  await expect(page).toHaveURL(`${institutionUrl}/edit`)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(institution.name)
  await expect(page.getByLabel('CCT', { exact: true })).toHaveValue('')
  await page.getByLabel('Nombre', { exact: true }).fill(updated.name)
  await page.getByLabel('CCT', { exact: true }).fill(updated.cct)
  await page.getByLabel('Nombre de la persona responsable', { exact: true }).fill('Responsable E2E')
  await page.getByLabel('Correo de contacto', { exact: true }).fill(updated.contactEmail)
  await page.getByLabel('Teléfono (opcional)', { exact: true }).fill('834 318 1800')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page).toHaveURL(institutionUrl)
  await expect(page.getByText(updated.name, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.cct, { exact: true })).toBeVisible()
  await expect(page.getByText(updated.contactEmail, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '834 318 1800', exact: true })).toHaveAttribute('href', 'tel:8343181800')

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

test('HU-S16-06: ADMIN invita a una institución y comparte el enlace de su cuenta sin correo', async ({ page, request, context }) => {
  const suffix = Date.now().toString()
  const email = `enlace-${suffix}@example.test`
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/institutions/new')
  await page.getByLabel('Correo de la cuenta', { exact: true }).fill(email)
  await page.getByLabel('Nombre de la persona (opcional)', { exact: true }).fill('Responsable enlace')
  await page.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()

  // El enlace se queda en esta página para copiarlo; no llega ningún correo.
  await expect(page.getByRole('status').first()).toHaveText(`Invitación lista. Copia el enlace y compártelo con ${email} para que cree su contraseña y complete el perfil de su institución.`)
  const link = await page.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  expect(link).toContain('/set-initial-password?')
  await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
  expect(await page.evaluate('navigator.clipboard.readText()') === link).toBe(true)
  expect(await mailCount(request, email)).toBe(0)

  await page.getByRole('link', { name: 'Ver la institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
  // Sin nombre de referencia, la institución se muestra con el respaldo (HU-S16-05). El nombre de la persona solo nombra
  // su cuenta: el responsable de la institución queda pendiente hasta el onboarding (D5).
  await expect(page.getByText('Institución sin nombre', { exact: true })).toBeVisible()
  await expect(page.getByText('Sin capturar', { exact: true })).toHaveCount(3)
})
