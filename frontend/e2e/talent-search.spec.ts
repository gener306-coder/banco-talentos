import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { INSTITUTION_STATE } from './support/institution'
import { openCompanySession } from './support/company'

test.use({ storageState: ADMIN_STATE })

/** La institución registra un alumno en Matamoros con titular y una habilidad única. */
async function publishStudent(page: Page, data: { surname: string; enrollment: string; headline: string; skill: string }) {
  await page.goto('/students')
  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(data.enrollment)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Valeria Secreta')
  await register.getByLabel('Primer apellido', { exact: true }).fill(data.surname)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('link', { name: data.surname, exact: true }).click()

  const profile = page.getByRole('region', { name: 'Expediente público' })
  await profile.getByLabel('Carrera o programa educativo').fill('Ingeniería en Datos')
  await profile.getByLabel('Tipo de periodo').selectOption('semester')
  await profile.getByLabel('Periodo actual').selectOption('6')
  await profile.getByLabel('Disponible', { exact: true }).check()
  await profile.getByLabel('Estado').selectOption({ label: 'Tamaulipas' })
  await profile.getByRole('combobox', { name: 'Municipio' }).fill('matamoros')
  await profile.getByRole('option', { name: 'Matamoros', exact: true }).click()
  await profile.getByRole('group', { name: 'Disponibilidad para reubicarse' }).getByLabel('No', { exact: true }).check()
  await profile.getByRole('button', { name: 'Guardar expediente' }).click()
  await expect(profile.getByRole('status')).toHaveText('Expediente guardado correctamente.')

  await page.getByRole('link', { name: 'CV profesional' }).click()
  await page.getByLabel('Titular', { exact: true }).fill(data.headline)
  await page.getByRole('button', { name: 'Guardar titular', exact: true }).click()
  await expect(page.getByText('Titular guardado correctamente.')).toBeVisible()
  const skill = page.getByRole('combobox', { name: 'Agregar habilidad' })
  await skill.fill(data.skill)
  await skill.press('Enter')
  await page.getByRole('button', { name: 'Guardar habilidades', exact: true }).click()
  await expect(page.getByText('Habilidades guardadas correctamente.')).toBeVisible()
}

test('HU-S4-05: una empresa encuentra un perfil anónimo por habilidad y distancia, sin datos personales ni contacto', async ({ browser, baseURL }) => {
  const suffix = randomBytes(6).toString('hex')
  const student = { surname: `Oculto${suffix}`, enrollment: `TAL-${suffix}`, headline: `Analista E2E ${suffix}`, skill: `Destreza${suffix}` }

  const institutionContext = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  try {
    await publishStudent(await institutionContext.newPage(), student)
  } finally {
    await institutionContext.close()
  }

  const { context, page: company } = await openCompanySession(browser, baseURL)
  try {
    // CA-01, CA-10: el buscador desde el inicio.
    await company.getByRole('link', { name: 'Buscar talento', exact: true }).click()
    const filters = company.getByRole('search', { name: 'Filtros de búsqueda' })
    await filters.getByLabel('Agregar habilidad (todas requeridas)').fill(student.skill.toLowerCase())
    await filters.getByLabel('Agregar habilidad (todas requeridas)').press('Enter')
    await filters.getByLabel('Distancia máxima').selectOption('100')
    const searched = company.waitForResponse((response) => response.url().includes('/api/talent?') && response.url().includes('radius_km=100'))
    await filters.getByRole('button', { name: 'Buscar', exact: true }).click()
    expect((await searched).status()).toBe(200)

    // CA-04, CA-05: tarjeta anónima a unos 80 km (Reynosa–Matamoros).
    const card = company.getByRole('article', { name: student.headline })
    await expect(card).toContainText('Matamoros, Tamaulipas · A unos 80 km')
    await expect(card).toContainText('Ingeniería en Datos · 6.º semestre')
    await expect(company.getByRole('status')).toHaveText('1 perfil encontrado')

    // Fuera del radio de 25 km no aparece.
    await filters.getByLabel('Distancia máxima').selectOption('25')
    await filters.getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(company.getByText('Ningún perfil coincide con los filtros.')).toBeVisible()
    await filters.getByLabel('Distancia máxima').selectOption('100')
    await filters.getByRole('button', { name: 'Buscar', exact: true }).click()

    // CA-06, CA-07: perfil público sin identidad ni contacto.
    await company.getByRole('link', { name: `Ver perfil: ${student.headline}` }).click()
    await expect(company.getByRole('heading', { level: 2, name: student.headline })).toBeVisible()
    await expect(company.getByText(student.skill, { exact: true })).toBeVisible()
    await expect(company.getByRole('button', { name: /contactar/i })).toHaveCount(0)
    const content = await company.content()
    expect(content.includes(student.surname) || content.includes(student.enrollment) || content.includes('Valeria Secreta')).toBe(false)
    expect(company.url()).toMatch(/\/talent\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  } finally {
    await context.close()
  }
})
