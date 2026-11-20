import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { createOpportunity, openCompanySession } from './support/company'
import { INSTITUTION_STATE } from './support/institution'
import { publishStudent } from './support/students'

test.use({ storageState: ADMIN_STATE })

/** Busca por la habilidad del catálogo, abre el perfil y solicita la vinculación para la oportunidad. */
async function requestProfile(company: Page, skill: string, headline: string, opportunity: string) {
  await company.goto('/talent')
  const filters = company.getByRole('search', { name: 'Filtros de búsqueda' })
  await filters.getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' }).fill(skill.toLowerCase())
  await filters.getByRole('option', { name: skill }).click()
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await company.getByRole('link', { name: `Ver perfil: ${headline}` }).click()
  await company.getByRole('button', { name: 'Solicitar vinculación' }).click()
  const sheet = company.getByRole('dialog', { name: 'Solicitar vinculación' })
  await sheet.getByLabel('Oportunidad').selectOption({ label: `${opportunity} · Reynosa` })
  await sheet.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(sheet.getByRole('status')).toContainText(opportunity)
}

test('T-S14-10 y T-S14-11: el periodo mínimo es solo un número y una oportunidad con 1 lugar no admite una segunda aceptación ni nuevas solicitudes', async ({ browser, baseURL }) => {
  test.slow()
  const suffix = randomBytes(6).toString('hex')
  const skill = `Cupo${suffix}`
  const students = [1, 2].map((n) => ({ surname: `Cupo${n}${suffix}`, enrollment: `CUP-${n}-${suffix}`, headline: `Perfil ${n} ${suffix}`, skill }))
  const opportunity = `Un lugar ${suffix}`

  const publishing = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  try {
    const page = await publishing.newPage()
    for (const student of students) await publishStudent(page, student)
  } finally {
    await publishing.close()
  }

  const { context, page: company } = await openCompanySession(browser, baseURL)
  try {
    // T-S14-10: el formulario ya no pregunta el tipo de periodo.
    await company.goto('/opportunities/new')
    await expect(company.locator('form.opportunity-form').getByLabel('Tipo de periodo')).toHaveCount(0)
    await createOpportunity(company, opportunity, 1)
    await expect(company.getByText('0 de 1 lugar cubierto')).toBeVisible()
    for (const student of students) await requestProfile(company, skill, student.headline, opportunity)
  } finally {
    await context.close()
  }

  const answering = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  try {
    const institution = await answering.newPage()
    const open = async (surname: string) => {
      await institution.goto('/institution/linkage-requests')
      await institution.getByLabel('Buscar por empresa, oportunidad, alumno o matrícula').fill(surname)
      const searched = institution.waitForResponse((response) => response.url().includes('/api/institution/linkage-requests?') && response.url().includes(encodeURIComponent(surname)))
      await institution.getByRole('button', { name: 'Buscar', exact: true }).click()
      await searched
      // La fila de este alumno para la oportunidad: las dos solicitudes comparten la oportunidad.
      await institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' }).getByRole('row', { name: new RegExp(opportunity) })
        .filter({ hasText: surname }).getByRole('link', { name: /Ver la solicitud/ }).click()
      return institution.getByRole('region', { name: 'Responder solicitud' })
    }

    const first = await open(students[0].surname)
    await first.getByRole('button', { name: 'Aceptar solicitud' }).click()
    await institution.getByRole('alertdialog', { name: '¿Aceptar la solicitud?' }).getByRole('button', { name: 'Aceptar solicitud' }).click()
    await expect(institution.getByRole('region', { name: 'Respuesta' })).toContainText('Aceptada')

    // El único lugar ya está cubierto: la segunda no se puede aceptar, pero sí rechazar.
    const second = await open(students[1].surname)
    await expect(institution.getByRole('region', { name: 'Oportunidad' })).toContainText('1 de 1 lugar cubierto')
    await expect(second.getByRole('button', { name: 'Aceptar solicitud' })).toBeDisabled()
    await expect(second).toContainText('Ya no puedes aceptar esta solicitud')
    await expect(second.getByRole('button', { name: 'Rechazar solicitud' })).toBeEnabled()
  } finally {
    await answering.close()
  }

  const { context: back, page: owner } = await openCompanySession(browser, baseURL)
  try {
    await owner.goto('/opportunities')
    const row = owner.getByRole('row', { name: new RegExp(opportunity) })
    await expect(row).toContainText('1 de 1 lugar cubierto')
    await expect(row).toContainText('Cupo lleno')
  } finally {
    await back.close()
  }
})
