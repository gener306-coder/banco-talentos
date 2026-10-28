import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'

/**
 * Sesión COMPANY compartida por los escenarios de empresas, oportunidades y vinculación.
 * La crea `company.setup.ts`.
 */
export const COMPANY_STATE = 'playwright/.auth/company.json'

/** Abre una nueva página con la sesión reutilizable de la Empresa en la página de inicio. */
export async function openCompanySession(
  browser: Browser,
  baseURL: string | undefined,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, storageState: COMPANY_STATE })
  const page = await context.newPage()
  await page.goto('/')
  return { context, page }
}

/** Genera un RFC de persona moral válido con homoclave aleatoria. */
export const randomCompanyRfc = () => `EMP010101${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`

/** Registra una empresa desde la vista de la Secretaría (/companies/new) y queda en su detalle. */
export async function registerCompany(
  page: Page,
  options: {
    legalName?: string
    rfc?: string
    state?: string
    municipalityQuery?: string
    municipalityOption?: string
  } = {},
) {
  const suffix = randomBytes(6).toString('hex')
  const legalName = options.legalName ?? `Empresa E2E ${suffix}, S.A. de C.V.`
  const companyRfc = options.rfc ?? randomCompanyRfc()
  const state = options.state ?? 'Tamaulipas'
  const municipalityQuery = options.municipalityQuery ?? 'reynosa'
  const municipalityOption = options.municipalityOption ?? 'Reynosa'

  await page.goto('/companies/new')
  await page.getByLabel('Razón social', { exact: true }).fill(legalName)
  await page.getByLabel('RFC', { exact: true }).fill(companyRfc.toLowerCase())
  await page.getByLabel('Sector económico (SCIAN)').selectOption('31-33')
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: state })
  await page.getByRole('combobox', { name: 'Municipio' }).fill(municipalityQuery)
  await page.getByRole('option', { name: municipalityOption, exact: true }).click()
  await page.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto E2E')
  await page.getByLabel('Correo del contacto', { exact: true }).fill(`dual-${suffix}@example.test`)

  const created = page.waitForResponse((response) => response.url().endsWith('/api/companies') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Registrar empresa', exact: true }).click()
  expect((await created).status()).toBe(201)
  await expect(page.getByText('Empresa registrada correctamente.', { exact: true })).toBeVisible()

  return { legalName, rfc: companyRfc }
}

/** Desde el detalle de una empresa, crea una cuenta con enlace de configuración manual y devuelve el enlace. */
export async function createCompanyAccount(
  page: Page,
  account: { name: string; email: string },
): Promise<string> {
  await page.getByRole('button', { name: 'Nueva cuenta de la empresa', exact: true }).click()
  const creation = page.getByRole('dialog', { name: 'Nueva cuenta de la empresa' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()

  const accountCreated = page.waitForResponse((response) => response.url().includes('/accounts') && response.request().method() === 'POST')
  await creation.getByRole('button', { name: 'Crear cuenta de la empresa', exact: true }).click()
  expect((await accountCreated).status()).toBe(201)

  const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(creation).toBeHidden()

  return link
}

/** Registra una oportunidad dual activa con el municipio precargado de la empresa (HU-S5-02) y queda en su detalle. */
export async function createOpportunity(page: Page, title: string) {
  await page.goto('/opportunities/new')
  const form = page.locator('form.opportunity-form')
  await expect(form.getByRole('combobox', { name: 'Municipio' })).not.toHaveValue('')
  await form.getByLabel('Título de la oportunidad').fill(title)
  await form.getByLabel('Actividades y objetivos').fill('Análisis de datos de producción y tableros de indicadores.')
  await form.getByLabel('Lugares disponibles').fill('2')
  await form.getByLabel('Carrera o programa requerido').fill('Ingeniería en Datos')
  await form.getByLabel('Tipo de periodo').selectOption('semester')
  await form.getByLabel('Periodo mínimo').selectOption('4')
  await form.getByRole('group', { name: '¿Requiere que el alumno se reubique?' }).getByLabel('No', { exact: true }).check()
  await form.getByRole('button', { name: 'Registrar oportunidad' }).click()
  await expect(page.getByText('Oportunidad registrada correctamente.')).toBeVisible()
}
