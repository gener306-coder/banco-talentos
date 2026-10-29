import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { INSTITUTION_STATE } from './support/institution'
import { SECRETARY_STATE } from './support/secretary'

/** HU-S7-01: abre el reporte desde el inicio y comprueba sus tres secciones con datos reales. */
async function openReport(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Reporte ejecutivo' }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('heading', { name: 'Reporte ejecutivo', level: 2 })).toBeVisible()

  const statuses = page.getByRole('table', { name: 'Solicitudes de vinculación por estado' })
  await expect(statuses.getByRole('row')).toHaveCount(5)
  await expect(page.getByText(/^\d[\d,]* solicitud(es)? registradas?$/)).toBeVisible()
  // Los escenarios de configuración registran al menos una institución y una empresa del sector 31-33.
  await expect(page.getByRole('table', { name: 'Participación por institución educativa' }).getByRole('row').nth(1)).toBeVisible()
  await expect(page.getByRole('table', { name: 'Participación por sector SCIAN' }).getByRole('row').nth(1)).toBeVisible()
}

test.describe('ADMIN', () => {
  test.use({ storageState: ADMIN_STATE })

  test('HU-S7-01: consulta el reporte ejecutivo desde su inicio sin datos de alumnos', async ({ page }) => {
    const responses: string[] = []
    page.on('response', async (response) => {
      if (response.url().endsWith('/api/reports/dual-program')) responses.push(await response.text())
    })
    await openReport(page)
    expect(responses).toHaveLength(1)
    expect(responses[0]).not.toMatch(/student_id|public_id|enrollment|given_names|nss|location|email/)
  })
})

test.describe('SECRETARY', () => {
  test.use({ storageState: SECRETARY_STATE })

  test('HU-S7-01: consulta el reporte ejecutivo desde su inicio', async ({ page }) => {
    await openReport(page)
  })
})

test.describe('INSTITUTION', () => {
  test.use({ storageState: INSTITUTION_STATE })

  test('HU-S7-01: no tiene acceso al reporte ejecutivo (CA-01)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reporte ejecutivo' })).toHaveCount(0)
    await page.goto('/reports')
    await expect(page.getByRole('alert')).toHaveText('No tienes permiso para consultar el reporte ejecutivo.')
    const response = await page.context().request.get('/api/reports/dual-program', { headers: { Origin: new URL(page.url()).origin } })
    expect(response.status()).toBe(403)
  })
})
