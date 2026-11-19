import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { createOpportunity } from './support/company'
import { INSTITUTION_STATE } from './support/institution'
import { openSecretarySession } from './support/secretary'
import { publishStudent } from './support/students'

test.use({ storageState: ADMIN_STATE })

test('HU-S14-02 y HU-S14-03: la Secretaría invita solo con el correo → la empresa crea su contraseña → onboarding → pospone → recordatorio → bloqueo al publicar → completa el mínimo en Mi cuenta → publica y solicita → la institución ve su nombre y contacto', async ({ browser, baseURL }) => {
  // Recorre cuatro sesiones (institución, Secretaría, empresa e institución).
  test.slow()
  const suffix = randomBytes(6).toString('hex')
  const email = `onboarding-${suffix}@example.test`
  const tradeName = `Taller E2E ${suffix}`
  const opportunityTitle = `Mantenimiento E2E ${suffix}`
  const student = { surname: `Onboard${suffix}`, enrollment: `ONB-${suffix}`, headline: `Técnico E2E ${suffix}`, skill: `Pericia${suffix}` }

  const institutionContext = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  try {
    await publishStudent(await institutionContext.newPage(), student)
  } finally {
    await institutionContext.close()
  }

  // HU-S14-02: la invitación solo pide el correo; el enlace se comparte a mano.
  const { context: secretaryContext, page: secretary } = await openSecretarySession(browser, baseURL)
  let link: string
  try {
    await secretary.goto('/companies/new')
    await secretary.getByLabel('Correo de la cuenta', { exact: true }).fill(email)
    await secretary.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
    await secretary.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
    link = await secretary.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  } finally {
    await secretaryContext.close()
  }

  const password = randomBytes(24).toString('hex')
  const companyContext = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    const company = await companyContext.newPage()
    await company.goto(link)
    await company.getByLabel('Contraseña', { exact: true }).fill(password)
    await company.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
    await company.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    await expect(company.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')
    await company.goto('/login')
    await company.getByLabel('Correo electrónico').fill(email)
    await company.getByLabel('Contraseña', { exact: true }).fill(password)
    await company.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()

    // HU-S14-03 CA-02, CA-03: el primer acceso lleva al onboarding con Soy yo y sin el nombre provisional.
    await expect(company.getByRole('heading', { name: 'Completa el perfil de tu empresa' })).toBeVisible()
    await expect(company).toHaveURL(/\/welcome$/)
    await expect(company.getByLabel('Soy yo')).toBeChecked()
    await expect(company.getByLabel(/Tu nombre/)).toHaveValue('')
    await expect(company.getByLabel(/Correo de contacto/)).toHaveValue(email)
    await company.getByRole('button', { name: 'Completar más tarde', exact: true }).click()

    // CA-04: el inicio recuerda qué falta y dónde encontrarlo.
    // T-S14-01: un recordatorio discreto lleva al perfil, donde está el detalle de lo que falta.
    const reminder = company.getByRole('link', { name: /Completa tu perfil para publicar oportunidades y enviar solicitudes\./ })
    await expect(reminder).toHaveAttribute('href', '/account#organization')
    await company.reload()
    await expect(company).toHaveURL(/\/$/)

    // CA-05 (M1): sin el mínimo no se publica; el aviso lleva directo al perfil.
    await company.goto('/opportunities/new')
    const blocked = company.getByRole('note', { name: 'Perfil de la empresa incompleto' })
    await expect(blocked).toBeVisible()
    await expect(company.getByRole('button', { name: 'Registrar oportunidad' })).toHaveCount(0)
    await blocked.getByRole('link', { name: /Completar perfil/ }).click()
    await expect(company).toHaveURL(/\/account#organization$/)

    const profile = company.getByRole('region', { name: 'Perfil de la empresa' })
    await profile.getByLabel(/Nombre comercial/).fill(tradeName)
    // Tras posponer, Mi cuenta no precarga el contacto: Soy yo usa los datos de la cuenta.
    await profile.getByLabel('Soy yo').check()
    await profile.getByLabel(/Tu nombre/).fill('Rosa Garza')
    await profile.getByLabel('Puesto en la empresa (opcional)').fill('Dirección de planta')
    await profile.getByLabel('Estado', { exact: true }).selectOption({ label: 'Tamaulipas' })
    await profile.getByRole('combobox', { name: 'Municipio' }).fill('reynosa')
    await profile.getByRole('option', { name: 'Reynosa', exact: true }).click()
    await profile.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(profile.getByRole('status')).toHaveText('Perfil actualizado correctamente.')

    // Con el mínimo, el recordatorio solo pide el resto y la cuenta ya lleva el nombre real.
    await company.goto('/')
    await expect(company.getByRole('heading', { name: 'Hola, Rosa Garza' })).toBeVisible()
    await expect(company.getByRole('link', { name: /Tu perfil está casi listo: faltan 3 datos\./ })).toBeVisible()
    await company.goto('/account#organization')
    await expect(company.getByRole('list', { name: 'Datos pendientes' })).toHaveText(['Razón social', 'RFC', 'Sector económico'].join(''))
    await company.goto('/')

    // Publica y solicita la vinculación.
    await createOpportunity(company, opportunityTitle)
    await company.goto('/talent')
    const filters = company.getByRole('search', { name: 'Filtros de búsqueda' })
    await filters.getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' }).fill(student.skill.toLowerCase())
    await filters.getByRole('option', { name: student.skill }).click()
    await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await company.getByRole('link', { name: `Ver perfil: ${student.headline}` }).click()
    await company.getByRole('button', { name: 'Solicitar vinculación' }).click()
    const sheet = company.getByRole('dialog', { name: 'Solicitar vinculación' })
    await sheet.getByLabel('Oportunidad').selectOption({ label: `${opportunityTitle} · Reynosa` })
    await sheet.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(sheet.getByRole('status')).toContainText(`Solicitud enviada a la institución del alumno para ${opportunityTitle}`)
  } finally {
    await companyContext.close()
  }

  // La institución ve el nombre y el contacto de la empresa en la solicitud.
  const receiving = await browser.newContext({ baseURL, storageState: INSTITUTION_STATE })
  try {
    const institution = await receiving.newPage()
    await institution.goto('/institution/linkage-requests')
    const row = institution.getByRole('table', { name: 'Solicitudes de vinculación recibidas' }).getByRole('row', { name: new RegExp(opportunityTitle) })
    await expect(row).toContainText(tradeName)
    await row.getByRole('link', { name: /Ver la solicitud/ }).click()
    const contact = institution.getByRole('region', { name: 'Empresa y contacto del programa dual' })
    await expect(contact).toContainText(tradeName)
    await expect(contact).toContainText('Rosa Garza')
    await expect(contact).toContainText('Dirección de planta')
    await expect(contact).toContainText(email)
  } finally {
    await receiving.close()
  }
})
