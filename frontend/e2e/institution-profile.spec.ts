import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { INSTITUTION_STATE, randomCct } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

test('T-S14-15: la institución corrige su nombre oficial y su CCT en Mi cuenta y Administración ve el cambio', async ({ page, browser, baseURL }) => {
  const suffix = randomBytes(4).toString('hex')
  const name = `Institución E2E corregida ${suffix}`
  const cct = randomCct()

  await page.goto('/account')
  const card = page.getByRole('region', { name: 'Perfil de la institución' })
  await expect(card).not.toContainText('Los mantiene la Administración')
  const original = await card.getByText('Institución E2E', { exact: true }).count() > 0 ? 'Institución E2E' : null

  await card.getByRole('button', { name: 'Editar' }).click()
  const cctField = card.getByLabel('Clave de Centro de Trabajo (CCT)')
  await cctField.fill('28EUT01')
  await cctField.blur()
  await expect(card.getByText(/La CCT debe tener 10 caracteres/)).toBeVisible()

  await card.getByLabel('Nombre oficial').fill(name)
  await cctField.fill(cct.toLowerCase())
  // El contacto del seed no tiene nombre: es obligatorio para guardar.
  const contact = card.getByLabel(/Nombre del responsable|Tu nombre/)
  if (!(await contact.inputValue())) await contact.fill('Coordinación E2E')
  await card.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('.snackbar')).toContainText('Perfil actualizado.')
  await expect(card).toContainText(name)
  await expect(card).toContainText(cct)
  await expect(page.getByRole('region', { name: 'Tu perfil' })).toContainText(name)

  // Administración ve el nombre y la clave nuevos en su listado.
  const admin = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  try {
    const adminPage = await admin.newPage()
    await adminPage.goto('/institutions')
    await expect(adminPage.getByRole('row', { name: new RegExp(name) })).toContainText(cct)
  } finally {
    await admin.close()
  }

  // Deja el nombre del seed como estaba para los demás escenarios.
  if (original) {
    await card.getByRole('button', { name: 'Editar' }).click()
    await card.getByLabel('Nombre oficial').fill(original)
    await card.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(card).toContainText(original)
  }
})
