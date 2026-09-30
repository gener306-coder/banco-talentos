import { expect, test } from '@playwright/test'

const email = process.env.E2E_ADMIN_EMAIL
const password = process.env.E2E_ADMIN_PASSWORD

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

test('ADMIN registra, consulta, edita, inactiva y reactiva una institución conservando sus datos', async ({ page }) => {
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

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email!)
  await page.getByLabel('Contraseña', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions$/)
  await expect(page.getByRole('heading', { name: 'Instituciones', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/new$/)
  await page.getByLabel('Nombre', { exact: true }).fill(institution.name)
  await page.getByLabel('CCT', { exact: true }).fill(institution.cct)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(institution.contactEmail)
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)
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
