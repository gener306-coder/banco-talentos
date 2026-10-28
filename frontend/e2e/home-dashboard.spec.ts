import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openCompanySession } from './support/company'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

/** Cifra de un indicador del inicio, por su etiqueta exacta. */
function indicator(page: Page, label: string) {
  return page.getByRole('region', { name: 'Indicadores' })
    .locator('.home-stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
}

async function indicatorValue(page: Page, label: string): Promise<number> {
  await expect(indicator(page, label)).toHaveText(/^\d[\d,]*$/)
  return Number((await indicator(page, label).textContent())?.replace(/,/g, ''))
}

test('HU-S5-01: la institución ve sus contadores y se actualizan al registrar un alumno', async ({ page }) => {
  await page.goto('/')
  const active = await indicatorValue(page, 'Alumnos activos')
  const searchable = await indicatorValue(page, 'Visibles en el buscador')
  await indicatorValue(page, 'Municipio por confirmar')

  const suffix = randomBytes(6).toString('hex')
  await page.getByRole('link', { name: 'Registrar alumno' }).click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(`INI-${suffix}`)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Inicio')
  await register.getByLabel('Primer apellido', { exact: true }).fill(`Contador${suffix}`)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')

  await page.goto('/')
  // Sin expediente, el alumno nuevo cuenta como activo pero no es visible en el buscador (CA-04).
  expect(await indicatorValue(page, 'Alumnos activos')).toBe(active + 1)
  expect(await indicatorValue(page, 'Visibles en el buscador')).toBe(searchable)
})

test('HU-S5-01: el aviso de «Municipio por confirmar» enlaza al padrón', async ({ page }) => {
  await page.route('**/api/dashboard', (route) => route.fulfill({
    json: { data: { role: 'INSTITUTION', metrics: { active_students: 9, searchable_students: 4, pending_municipality_students: 3, pending_linkage_requests: 0 } } },
  }))
  await page.goto('/')
  const region = page.getByRole('region', { name: 'Indicadores' })
  await expect(region.getByText('3 alumnos tienen «Municipio por confirmar».')).toBeVisible()
  await region.getByRole('link', { name: 'Revisar el padrón' }).click()
  await expect(page).toHaveURL(/\/students$/)
})

test('HU-S6-03: el aviso de solicitudes pendientes enlaza a la bandeja de la institución (CA-02)', async ({ page }) => {
  await page.route('**/api/dashboard', (route) => route.fulfill({
    json: { data: { role: 'INSTITUTION', metrics: { active_students: 9, searchable_students: 4, pending_municipality_students: 0, pending_linkage_requests: 2 } } },
  }))
  await page.goto('/')
  const region = page.getByRole('region', { name: 'Indicadores' })
  await expect(indicator(page, 'Solicitudes pendientes')).toHaveText('2')
  await expect(region.getByText('Tienes 2 solicitudes de vinculación pendientes de respuesta.')).toBeVisible()
  await region.getByRole('link', { name: 'Revisar solicitudes' }).click()
  await expect(page).toHaveURL(/\/institution\/linkage-requests$/)
})

test('HU-S5-01: si los indicadores fallan, el inicio sigue navegable (CA-07)', async ({ page }) => {
  await page.route('**/api/dashboard', (route) => route.fulfill({ status: 500, json: { message: 'Error' } }))
  await page.goto('/')
  await expect(page.getByText(/No pudimos cargar los indicadores/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Indicadores' })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Institución' }).getByRole('link', { name: 'Alumnos' }).click()
  await expect(page).toHaveURL(/\/students$/)
})

test('HU-S5-01 y HU-S6-03: la empresa ve los perfiles disponibles del buscador y sus oportunidades y solicitudes', async ({ browser, baseURL }) => {
  const { context, page } = await openCompanySession(browser, baseURL)
  try {
    const available = await indicatorValue(page, 'Perfiles disponibles')
    // Sus contadores de oportunidades y solicitudes, sin el aviso que solo ve la institución (CA-02).
    await indicatorValue(page, 'Oportunidades activas')
    await indicatorValue(page, 'Solicitudes pendientes')
    await expect(page.getByRole('link', { name: 'Revisar solicitudes' })).toHaveCount(0)
    // Mismo universo que el buscador sin filtros (HU-S4-05 CA-02).
    const search = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/talent')
    await page.getByRole('navigation', { name: 'Empresa' }).getByRole('link', { name: 'Buscar talento' }).click()
    const talent = await search
    expect(talent.status()).toBe(200)
    expect((await talent.json()).meta.total).toBe(available)
  } finally {
    await context.close()
  }
})
