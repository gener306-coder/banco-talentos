import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { createOpportunity, openCompanySession } from './support/company'
import { INSTITUTION_STATE } from './support/institution'
import { publishStudent } from './support/students'

test.use({ storageState: ADMIN_STATE })

// Sprint 19, PR 2 (T-S19-05 a T-S19-07): la institución comparte la ficha tras aceptar y la empresa la ve; al dejar de
// compartirla, la empresa pierde el acceso y la vinculación sigue.
test('la institución comparte la ficha de una vinculación aceptada, la empresa la ve y deja de verla al retirarla', async ({ browser, baseURL }) => {
  test.slow()
  const suffix = randomBytes(6).toString('hex')
  const student = { surname: `Ficha${suffix}`, enrollment: `FIC-${suffix}`, headline: `Perfil ficha ${suffix}`, skill: `Ficha${suffix}` }
  const opportunity = `Ficha compartida ${suffix}`

  const institutionContext = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  const institution = await institutionContext.newPage()
  await publishStudent(institution, student)

  const { context: companyContext, page: company } = await openCompanySession(browser, baseURL)
  await createOpportunity(company, opportunity, 1)
  await company.goto('/talent')
  const filters = company.getByRole('search', { name: 'Filtros de búsqueda' })
  await filters.getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' }).fill(student.skill.toLowerCase())
  await filters.getByRole('option', { name: student.skill }).click()
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await company.getByRole('link', { name: `Ver perfil: ${student.headline}` }).click()
  await company.getByRole('button', { name: 'Solicitar vinculación' }).click()
  const request = company.getByRole('dialog', { name: 'Solicitar vinculación' })
  await request.getByLabel('Oportunidad').selectOption({ label: `${opportunity} · Reynosa` })
  await request.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(request.getByRole('status')).toContainText(opportunity)

  // La institución abre la solicitud: pendiente, todavía no puede compartir.
  await institution.goto('/institution/linkage-requests')
  await institution.getByLabel('Buscar por empresa, oportunidad, alumno o matrícula').fill(student.surname)
  await institution.getByRole('button', { name: 'Buscar', exact: true }).click()
  await institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' }).getByRole('row', { name: new RegExp(opportunity) })
    .getByRole('link', { name: /Ver la solicitud/ }).click()
  const disclosure = institution.getByRole('region', { name: 'Ficha compartida con la empresa' })
  await expect(disclosure).toContainText('Cuando aceptes la solicitud podrás compartir')
  await institution.getByRole('region', { name: 'Responder solicitud' }).getByRole('button', { name: 'Aceptar solicitud' }).click()
  await institution.getByRole('alertdialog', { name: '¿Aceptar la solicitud?' }).getByRole('button', { name: 'Aceptar solicitud' }).click()
  await expect(disclosure.getByText('Ficha privada', { exact: true })).toBeVisible()
  const linkageUrl = institution.url()
  const linkageId = linkageUrl.match(/\/institution\/linkage-requests\/(\d+)/)?.[1]
  expect(linkageId).toBeTruthy()

  // Consulta directa a la API desde la sesión de la empresa, como lo haría el navegador.
  const disclosureStatus = () => company.evaluate(async (path) => (await fetch(path, { headers: { Accept: 'application/json' }, referrerPolicy: 'origin', credentials: 'include' })).status, `/api/linkage-requests/${linkageId}/disclosure`)

  // Antes de compartir, la empresa ve el bloque neutro y el servidor responde 404.
  await company.goto(`/linkage-requests/${linkageId}`)
  await expect(company.getByRole('region', { name: 'Ficha profesional' })).toContainText('Ficha profesional no disponible.')
  expect(await disclosureStatus()).toBe(404)

  await disclosure.getByRole('button', { name: 'Compartir ficha con la empresa', exact: true }).click()
  const sheet = institution.getByRole('dialog', { name: 'Compartir ficha con la empresa' })
  await sheet.getByLabel('Nombre completo', { exact: true }).check()
  await sheet.getByLabel(/^Cuento con el consentimiento del alumno/).check()
  await sheet.getByRole('button', { name: 'Compartir ficha', exact: true }).click()
  await expect(disclosure.getByText('Ficha compartida', { exact: true })).toBeVisible()
  await expect(disclosure).toContainText('Nombre completo')

  // La empresa ve solo el nombre, sin matrícula.
  await company.reload()
  const shared = company.getByRole('region', { name: 'Ficha profesional compartida' })
  await expect(shared).toContainText(student.surname)
  await expect(shared).toContainText('Información compartida exclusivamente para fines de evaluación en Educación Dual.')
  await expect(shared).not.toContainText(student.enrollment)
  await expect(shared).not.toContainText('Enlaces y portafolio')

  // Dejar de compartir: la empresa pierde el acceso de inmediato y la vinculación sigue aceptada.
  await disclosure.getByRole('button', { name: 'Dejar de compartir', exact: true }).click()
  await institution.getByRole('alertdialog', { name: '¿Dejar de compartir la ficha?' }).getByRole('button', { name: 'Dejar de compartir' }).click()
  await expect(disclosure.getByText('Ficha privada', { exact: true })).toBeVisible()
  expect(await disclosureStatus()).toBe(404)
  await company.reload()
  await expect(company.getByRole('region', { name: 'Ficha profesional' })).toContainText('Ficha profesional no disponible.')
  await expect(company.getByText('Aceptada').first()).toBeVisible()

  await institutionContext.close()
  await companyContext.close()
})
