import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { INSTITUTION_STATE } from './support/institution'
import { createOpportunity, openCompanySession } from './support/company'

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
  // HU-S8-02: el detalle del alumno nuevo se abre directamente desde el alta.
  await register.getByRole('button', { name: 'Completar expediente' }).click()

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

test('HU-S4-05, HU-S5-04, HU-S5-05, HU-S6-01, HU-S6-02 y HU-S6-03: una empresa encuentra un perfil anónimo por habilidad y distancia, sin datos personales, solicita la vinculación a su institución, esta la revisa con la identidad del alumno, la empresa la cancela y, al volver a solicitarla, la institución la acepta', async ({ browser, baseURL }) => {
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
    const profilePath = new URL(company.url()).pathname

    // HU-S5-04: solicitud de vinculación directa a la institución con una oportunidad activa.
    const opportunityTitle = `Tableros E2E ${suffix}`
    const setup = await context.newPage()
    await createOpportunity(setup, opportunityTitle)
    await setup.close()
    await company.getByRole('button', { name: 'Solicitar vinculación' }).click()
    const sheet = company.getByRole('dialog', { name: 'Solicitar vinculación' })
    await sheet.getByLabel('Oportunidad').selectOption({ label: `${opportunityTitle} · Reynosa` })
    await sheet.getByLabel('Mensaje para la institución (opcional)').fill('Nos interesa su perfil para el proyecto de tableros.')
    const sent = company.waitForResponse((response) => response.url().endsWith('/api/linkage-requests') && response.request().method() === 'POST')
    await sheet.getByRole('button', { name: 'Enviar solicitud' }).click()
    const response = await sent
    expect(response.status()).toBe(201)
    const body = await response.text()
    // CA-05: la respuesta solo identifica al alumno por su public_id.
    expect(body.includes(student.surname) || body.includes(student.enrollment) || body.includes('student_id')).toBe(false)
    await expect(sheet.getByRole('status')).toContainText(`Solicitud enviada a la institución del alumno para «${opportunityTitle}»`)

    // CA-03: una segunda solicitud para el mismo perfil y oportunidad se rechaza.
    await sheet.getByLabel('Oportunidad').selectOption({ label: `${opportunityTitle} · Reynosa` })
    await sheet.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(sheet.getByLabel('Oportunidad')).toHaveAccessibleDescription('Ya enviaste una solicitud para este perfil en esa oportunidad.')

    // HU-S5-05 CA-04: al volver al perfil, aviso con la oportunidad ya solicitada.
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(sheet).toBeHidden()
    await company.reload()
    const notice = company.getByRole('note', { name: 'Solicitudes enviadas para este perfil' })
    await expect(notice).toContainText(`«${opportunityTitle}»`)
    await expect(notice).toContainText('Pendiente de la institución')

    // HU-S6-01: la institución recibe la solicitud con la identidad interna del alumno y el contacto de la empresa.
    const receiving = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
    try {
      const institution = await receiving.newPage()
      await institution.goto('/')
      // HU-S6-03 CA-02: el inicio avisa de las solicitudes pendientes y enlaza a la bandeja.
      await expect(institution.getByRole('region', { name: 'Indicadores' })).toContainText(/solicitud(es)? de vinculación pendientes? de respuesta/)
      await institution.getByRole('link', { name: 'Revisar solicitudes' }).click()
      const pending = institution.waitForResponse((response) => response.url().includes('/api/institution/linkage-requests?') && response.url().includes('status=PENDIENTE_INSTITUCION'))
      await institution.getByLabel('Estado').selectOption('PENDIENTE_INSTITUCION')
      await pending
      const received = institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' }).getByRole('row', { name: new RegExp(opportunityTitle) })
      await expect(received.getByRole('rowheader')).toContainText(`${student.surname}, Valeria Secreta`)
      await expect(received).toContainText(student.enrollment)
      await received.getByRole('link', { name: /Ver la solicitud/ }).click()
      const identity = institution.getByRole('region', { name: 'Alumno solicitado' })
      await expect(identity).toContainText(`Valeria Secreta ${student.surname}`)
      await expect(institution.getByText('Nos interesa su perfil para el proyecto de tableros.')).toBeVisible()
      // Sin NSS ni comprobante: aviso con enlace al expediente.
      const missing = institution.getByRole('region', { name: 'Seguro Facultativo (IMSS)' }).getByRole('note')
      await expect(missing).toContainText('Al alumno le falta el NSS y el comprobante de vigencia del IMSS.')
      await expect(institution.getByRole('region', { name: 'Empresa y contacto del programa dual' }).getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/)
      await missing.getByRole('link', { name: 'expediente' }).click()
      await expect(institution.getByRole('heading', { level: 2, name: `Valeria Secreta ${student.surname}` })).toBeVisible()
    } finally {
      await receiving.close()
    }

    // HU-S5-05 CA-02, CA-03, CA-05: bandeja con contacto institucional y cancelación confirmada.
    await notice.getByRole('link', { name: 'Ver tus solicitudes' }).click()
    await expect(company.getByRole('heading', { level: 2, name: 'Solicitudes de vinculación' })).toBeVisible()
    const row = company.getByRole('table', { name: 'Solicitudes de vinculación enviadas' }).getByRole('row', { name: new RegExp(opportunityTitle) })
    await expect(row.getByRole('link', { name: student.headline })).toHaveAttribute('href', /\/talent\/[0-9a-f-]{36}$/)
    await expect(row.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/)
    expect(await row.textContent()).not.toContain(student.surname)
    const cancel = row.getByRole('button', { name: /Cancelar la solicitud/ })
    await cancel.click()
    let confirm = company.getByRole('alertdialog', { name: '¿Cancelar la solicitud?' })
    await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(row).toContainText('Pendiente de la institución')
    await cancel.click()
    confirm = company.getByRole('alertdialog', { name: '¿Cancelar la solicitud?' })
    await confirm.getByRole('button', { name: 'Cancelar solicitud' }).click()
    await expect(company.getByText(`Solicitud para «${opportunityTitle}» cancelada correctamente.`)).toBeVisible()
    await expect(row).toContainText('Cancelada')
    await company.getByLabel('Estado').selectOption('CANCELADA')
    await expect(company.getByRole('table', { name: 'Solicitudes de vinculación enviadas' }).getByRole('row', { name: new RegExp(opportunityTitle) })).toBeVisible()

    // HU-S6-02: la empresa vuelve a solicitar el perfil y la institución acepta con un mensaje, previa confirmación.
    await company.goto(profilePath)
    await company.getByRole('button', { name: 'Solicitar vinculación' }).click()
    const again = company.getByRole('dialog', { name: 'Solicitar vinculación' })
    await again.getByLabel('Oportunidad').selectOption({ label: `${opportunityTitle} · Reynosa` })
    await again.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(again.getByRole('status')).toContainText(`«${opportunityTitle}»`)

    const answering = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
    try {
      const institution = await answering.newPage()
      await institution.goto('/institution/linkage-requests')
      const pending = institution.waitForResponse((response) => response.url().includes('/api/institution/linkage-requests?') && response.url().includes('status=PENDIENTE_INSTITUCION'))
      await institution.getByLabel('Estado').selectOption('PENDIENTE_INSTITUCION')
      await pending
      await institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' }).getByRole('row', { name: new RegExp(opportunityTitle) })
        .getByRole('link', { name: /Ver la solicitud/ }).click()
      const decision = institution.getByRole('region', { name: 'Responder solicitud' })
      await decision.getByLabel('Mensaje para la empresa (opcional)').fill('Coordinemos la entrevista con el área dual.')
      await decision.getByRole('button', { name: 'Aceptar solicitud' }).click()
      await institution.getByRole('alertdialog', { name: '¿Aceptar la solicitud?' }).getByRole('button', { name: 'Aceptar solicitud' }).click()
      const answer = institution.getByRole('region', { name: 'Respuesta' })
      await expect(answer.getByRole('status')).toHaveText('Solicitud aceptada correctamente.')
      await expect(answer).toContainText('Aceptada')
      await expect(answer).toContainText('Coordinemos la entrevista con el área dual.')

      // HU-S7-02 CA-02: la exportación CSV de la bandeja, con el filtro de estado, incluye al alumno y el contacto de la empresa.
      await institution.goto('/institution/linkage-requests')
      await institution.getByLabel('Estado').selectOption('ACEPTADA')
      await expect(institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' })).toBeVisible()
      const downloading = institution.waitForEvent('download')
      await institution.getByRole('button', { name: 'Descargar CSV' }).click()
      const file = await downloading
      expect(file.suggestedFilename()).toMatch(/^solicitudes-vinculacion-\d{4}-\d{2}-\d{2}\.csv$/)
      const csv = await readFile(await file.path(), 'utf8')
      expect(csv.startsWith('\uFEFFFolio,"Fecha de solicitud",Estado,Matrícula,')).toBe(true)
      const row = csv.split('\r\n').find((line) => line.includes(student.enrollment))
      expect(row).toContain(`,Aceptada,${student.enrollment},${student.surname},`)
      expect(row).toContain(opportunityTitle)
      expect(csv).not.toMatch(/Pendiente de la institución|Cancelada/)
    } finally {
      await answering.close()
    }

    // CA-04: la empresa ve la respuesta y ya no puede cancelarla.
    await company.goto('/linkage-requests')
    // Se espera la respuesta filtrada: antes de que llegue, la tabla aún muestra la solicitud cancelada con el mismo título.
    const filtered = company.waitForResponse((response) => response.url().includes('/api/linkage-requests?') && response.url().includes('status=ACEPTADA'))
    await company.getByLabel('Estado').selectOption('ACEPTADA')
    await filtered
    const acceptedRow = company.getByRole('table', { name: 'Solicitudes de vinculación enviadas' }).getByRole('row', { name: new RegExp(opportunityTitle) })
    await expect(acceptedRow).toContainText('«Coordinemos la entrevista con el área dual.»')
    await expect(acceptedRow).toContainText('Respondida el')
    await expect(acceptedRow.getByRole('button', { name: /Cancelar/ })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
