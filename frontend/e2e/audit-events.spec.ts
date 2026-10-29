import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { SECRETARY_STATE } from './support/secretary'

test.describe('ADMIN', () => {
  test.use({ storageState: ADMIN_STATE })

  test('HU-S7-03: consulta la bitácora desde su inicio y la filtra por tipo', async ({ page }) => {
    const responses: string[] = []
    page.on('response', async (response) => {
      if (response.url().includes('/api/audit-events')) responses.push(await response.text())
    })
    await page.goto('/')
    await page.getByRole('link', { name: 'Bitácora' }).click()
    await expect(page).toHaveURL(/\/audit-events$/)
    const table = page.getByRole('table', { name: 'Eventos de la bitácora' })
    // Los escenarios de configuración crean al menos la cuenta de la Secretaría y una empresa.
    await expect(table.getByRole('row').nth(1)).toBeVisible()

    await page.getByLabel('Tipo de evento').selectOption('company_registered')
    await expect(table.getByRole('rowheader').first()).toHaveText('Empresa registrada')
    await expect(table.getByRole('rowheader').filter({ hasNotText: 'Empresa registrada' })).toHaveCount(0)
    await expect(table.getByRole('row').nth(1)).toContainText('Secretaría de Economía')

    await page.getByLabel('Tipo de evento').selectOption('account_created')
    await expect(table.getByRole('rowheader').first()).toHaveText('Cuenta creada')
    await expect(table).toContainText('Cuenta de Secretaría de Economía:')

    // CA-03: ninguna respuesta lleva contraseñas, tokens, NSS ni la identidad de alumnos.
    expect(responses.length).toBeGreaterThanOrEqual(3)
    for (const body of responses) expect(body).not.toMatch(/password|token|nss|enrollment|given_names|student/i)
  })
})

test.describe('SECRETARY', () => {
  test.use({ storageState: SECRETARY_STATE })

  test('HU-S7-03: no tiene acceso a la bitácora (CA-01)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bitácora' })).toHaveCount(0)
    await page.goto('/audit-events')
    await expect(page.getByRole('alert')).toHaveText('No tienes permiso para consultar la bitácora.')
    const response = await page.context().request.get('/api/audit-events', { headers: { Origin: new URL(page.url()).origin } })
    expect(response.status()).toBe(403)
  })
})
