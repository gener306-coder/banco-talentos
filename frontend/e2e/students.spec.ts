import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'
import { openFromRoster } from './support/students'

// La cuenta INSTITUTION del seed está vinculada a «Institución E2E»; su sesión la crea institution.setup.ts.
test.use({ storageState: INSTITUTION_STATE })

test('HU-S2-02: la institución registra alumnos en su padrón y la matrícula es única', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const first = { enrollment: `ITE-${suffix}-1`, given: 'María Fernanda', firstSurname: 'López', secondSurname: 'García' }
  const second = { enrollment: `ITE-${suffix}-2`, given: 'Luis', firstSurname: 'Báez', secondSurname: '' }

  await page.goto('/')
  await page.getByRole('link', { name: 'Alumnos', exact: true }).click()
  await expect(page).toHaveURL(/\/students$/)
  await expect(page.getByRole('heading', { name: 'Alumnos', exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Registrar alumno' })
  await expect(sheet).toBeVisible()

  for (const student of [first, second]) {
    await sheet.getByLabel('Matrícula o control interno', { exact: true }).fill(student.enrollment)
    await sheet.getByLabel('Nombre(s)', { exact: true }).fill(student.given)
    await sheet.getByLabel('Primer apellido', { exact: true }).fill(student.firstSurname)
    await sheet.getByLabel('Segundo apellido (opcional)', { exact: true }).fill(student.secondSurname)
    const created = page.waitForResponse((response) => response.url().endsWith('/api/students') && response.request().method() === 'POST')
    await sheet.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
    const response = await created
    expect(response.status()).toBe(201)
    // La institución la asigna el servidor: el cliente nunca la envía.
    expect(Object.keys(response.request().postDataJSON() as Record<string, unknown>).sort())
      .toEqual(['enrollment_number', 'first_surname', 'given_names', 'second_surname'])
    await expect(sheet.getByRole('status')).toContainText('Alumno registrado')
    await expect(sheet.getByLabel('Matrícula o control interno', { exact: true })).toHaveValue('')
  }

  // CA-06: la misma matrícula (sin distinguir mayúsculas) se rechaza junto a su campo.
  await sheet.getByLabel('Matrícula o control interno', { exact: true }).fill(first.enrollment.toLowerCase())
  await sheet.getByLabel('Nombre(s)', { exact: true }).fill('Duplicado')
  await sheet.getByLabel('Primer apellido', { exact: true }).fill('Prueba')
  await sheet.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(sheet.getByText('Ya existe un alumno con esa matrícula en tu institución.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // El padrón ordena por apellidos y se conserva al recargar.
  await page.reload()
  const table = page.getByRole('table', { name: 'Alumnos registrados' })
  await expect(table.getByRole('row', { name: new RegExp(`${first.enrollment}`) })).toContainText('López García')
  await expect(table.getByRole('row', { name: new RegExp(`${second.enrollment}`) })).toContainText('Báez')
  await expect(table.getByText(first.enrollment.toLowerCase(), { exact: true })).toHaveCount(0)

  // La API solo devuelve alumnos de la institución de la sesión.
  const roster = await page.context().request.get('/api/students', { headers: { Origin: new URL(page.url()).origin } })
  expect(roster.status()).toBe(200)
  const body = await roster.json() as { data: { enrollment_number: string }[] }
  expect(body.data.map((student) => student.enrollment_number)).toEqual(expect.arrayContaining([first.enrollment, second.enrollment]))
})

test('HU-S2-03: la institución completa el expediente y corrige la identidad de un alumno propio', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const enrollment = `EXP-${suffix}`
  const surname = `Expediente${suffix}`

  await page.goto('/')
  await page.getByRole('link', { name: 'Alumnos', exact: true }).click()

  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(enrollment)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Ana Sofía')
  await register.getByLabel('Primer apellido', { exact: true }).fill(surname)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // CA-01: el detalle se abre desde el padrón.
  await openFromRoster(page, surname)
  await expect(page).toHaveURL(/\/students\/\d+$/)
  const studentId = new URL(page.url()).pathname.split('/').pop()!
  await expect(page.getByRole('heading', { level: 2, name: `Ana Sofía ${surname}` })).toBeVisible()

  // CA-02 a CA-04: expediente académico, geográfico y de movilidad.
  const profile = page.getByRole('region', { name: 'Expediente público' })
  await profile.getByLabel('Carrera o programa educativo').fill('Ingeniería Mecatrónica')
  await profile.getByLabel('Tipo de periodo').selectOption('four_month')
  await profile.getByLabel('Periodo actual').selectOption('7')
  await profile.getByLabel('Disponible', { exact: true }).check()
  await profile.getByLabel('Estado').selectOption({ label: 'Nuevo León' })
  // HU-S4-04 CA-08: el municipio se elige del catálogo INEGI del estado, con filtro por texto.
  await profile.getByRole('combobox', { name: 'Municipio' }).fill('monterrey')
  await profile.getByRole('option', { name: 'Monterrey', exact: true }).click()
  await profile.getByRole('group', { name: 'Disponibilidad para reubicarse' }).getByLabel('Sí', { exact: true }).check()
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/students/${studentId}/profile`))
  await profile.getByRole('button', { name: 'Guardar expediente' }).click()
  expect((await saved).status()).toBe(200)
  await expect(profile.getByRole('status')).toHaveText('Expediente guardado correctamente.')

  // CA-07: corregir la matrícula y el nombre en una hoja.
  await page.getByRole('button', { name: 'Corregir identidad' }).click()
  const correct = page.getByRole('dialog', { name: 'Corregir identidad' })
  await correct.getByLabel('Matrícula o control interno', { exact: true }).fill(`${enrollment}-B`)
  await correct.getByLabel('Segundo apellido (opcional)', { exact: true }).fill('Ruiz')
  await correct.getByRole('button', { name: 'Guardar identidad' }).click()
  await expect(page.getByText('Identidad actualizada correctamente.')).toBeVisible()
  await expect(correct).toBeHidden()

  // Todo se conserva al recargar.
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: `Ana Sofía ${surname} Ruiz` })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Identidad (uso interno)' })).toContainText(`${enrollment}-B`)
  await expect(profile.getByLabel('Carrera o programa educativo')).toHaveValue('Ingeniería Mecatrónica')
  await expect(profile.getByLabel('Tipo de periodo')).toHaveValue('four_month')
  await expect(profile.getByLabel('Periodo actual')).toHaveValue('7')
  await expect(profile.getByLabel('Estado')).toHaveValue('19')
  await expect(profile.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Monterrey')

  // CA-05: un identificador ajeno o inexistente no revela nada.
  await page.goto('/students/999999999')
  await expect(page.getByText('El alumno no existe.')).toBeVisible()
})

test('HU-S2-04: la institución inactiva y reactiva a un alumno propio sin borrarlo', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const enrollment = `BAJA-${suffix}`
  const surname = `Baja${suffix}`

  await page.goto('/')
  await page.getByRole('link', { name: 'Alumnos', exact: true }).click()

  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(enrollment)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Iván')
  await register.getByLabel('Primer apellido', { exact: true }).fill(surname)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // CA-01: todo alumno nuevo es ACTIVO.
  const table = page.getByRole('table', { name: 'Alumnos registrados' })
  await expect(table.getByRole('row', { name: new RegExp(enrollment) }).getByText('ACTIVO', { exact: true })).toBeVisible()
  await openFromRoster(page, surname)
  const studentId = new URL(page.url()).pathname.split('/').pop()!
  const status = page.getByRole('region', { name: 'Estado en el Banco de Talentos' })
  await expect(status.getByText('ACTIVO', { exact: true })).toBeVisible()

  // CA-02: inactivar se confirma; cancelar no cambia nada.
  await status.getByRole('button', { name: 'Inactivar alumno' }).click()
  const confirm = page.getByRole('alertdialog', { name: '¿Inactivar al alumno?' })
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirm).toBeHidden()
  await expect(status.getByText('ACTIVO', { exact: true })).toBeVisible()

  await status.getByRole('button', { name: 'Inactivar alumno' }).click()
  const inactivated = page.waitForResponse((response) => response.url().endsWith(`/api/students/${studentId}/status`))
  await confirm.getByRole('button', { name: 'Inactivar', exact: true }).click()
  const response = await inactivated
  expect(response.status()).toBe(200)
  expect(response.request().method()).toBe('PATCH')
  expect(response.request().postDataJSON()).toEqual({ is_active: false })
  await expect(page.getByText('Alumno inactivado correctamente.')).toBeVisible()

  // El estado se conserva al recargar y el alumno sigue en el padrón (CA-03: baja lógica).
  await page.reload()
  await expect(status).toContainText('INACTIVO')
  await page.getByRole('link', { name: 'Volver a alumnos' }).click()
  await expect(table.getByRole('row', { name: new RegExp(enrollment) })).toContainText('INACTIVO')

  // CA-03: no existe borrado físico.
  const origin = new URL(page.url()).origin
  const deletion = await page.context().request.delete(`/api/students/${studentId}`, { headers: { Origin: origin } })
  expect(deletion.status()).toBe(405)

  // Reactivar no pide confirmación.
  await openFromRoster(page, surname)
  await status.getByRole('button', { name: 'Reactivar alumno' }).click()
  await expect(page.getByText('Alumno reactivado correctamente.')).toBeVisible()
  await expect(status.getByText('ACTIVO', { exact: true })).toBeVisible()
})

/** Diez dígitos aleatorios con su dígito verificador de Luhn: un NSS válido y único por ejecución. */
function randomNss(): string {
  const payload = Array.from(randomBytes(10), (byte) => String(byte % 10)).join('')
  for (let digit = 0; digit <= 9; digit++) {
    const candidate = payload + digit
    const sum = [...candidate].reverse().reduce((total, char, position) => {
      const value = Number(char) * (position % 2 === 1 ? 2 : 1)
      return total + (value > 9 ? value - 9 : value)
    }, 0)
    if (sum % 10 === 0) return candidate
  }
  throw new Error('Sin dígito verificador.')
}

test('HU-S3-02: la institución guarda el NSS y sube y descarga el comprobante del IMSS', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const surname = `Imss${suffix}`
  const nss = randomNss()
  const pdf = Buffer.from(`%PDF-1.4\n% Comprobante E2E ${suffix}\n%%EOF\n`)

  await page.goto('/')
  await page.getByRole('link', { name: 'Alumnos', exact: true }).click()
  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(`IMSS-${suffix}`)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Lucía')
  await register.getByLabel('Primer apellido', { exact: true }).fill(surname)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await openFromRoster(page, surname)
  const studentId = new URL(page.url()).pathname.split('/').pop()!

  const security = page.getByRole('region', { name: 'Seguro Facultativo (IMSS)' })
  await expect(security.getByText('Aún no hay comprobante.')).toBeVisible()

  // NSS: se agrupa al escribir y se envía solo con dígitos.
  const field = security.getByLabel('Número de Seguridad Social (NSS)')
  await field.fill(`${nss.slice(0, 4)}-${nss.slice(4)}`)
  await expect(field).toHaveValue(`${nss.slice(0, 4)} ${nss.slice(4, 8)} ${nss.slice(8)}`)
  const savedNss = page.waitForResponse((response) => response.url().endsWith(`/api/students/${studentId}/social-security`) && response.request().method() === 'PUT')
  await security.getByRole('button', { name: 'Guardar NSS' }).click()
  const nssResponse = await savedNss
  expect(nssResponse.status()).toBe(200)
  expect(nssResponse.request().postDataJSON()).toEqual({ nss })
  await expect(security.getByText('NSS guardado correctamente.')).toBeVisible()

  // Comprobante: subida multipart al disco privado.
  await security.getByLabel('Archivo PDF').setInputFiles({ name: `Vigencia ${suffix}.pdf`, mimeType: 'application/pdf', buffer: pdf })
  const uploaded = page.waitForResponse((response) => response.url().endsWith(`/api/students/${studentId}/social-security/document`) && response.request().method() === 'POST')
  await security.getByRole('button', { name: 'Subir comprobante' }).click()
  const uploadResponse = await uploaded
  expect(uploadResponse.status()).toBe(200)
  expect(JSON.stringify(await uploadResponse.json())).not.toContain('imss/')
  await expect(security.getByText('Comprobante guardado correctamente.')).toBeVisible()
  await expect(security.getByText(`Vigencia ${suffix}.pdf`)).toBeVisible()

  // Todo se conserva al recargar; la descarga devuelve el mismo archivo.
  await page.reload()
  await expect(security.getByLabel('Número de Seguridad Social (NSS)')).toHaveValue(`${nss.slice(0, 4)} ${nss.slice(4, 8)} ${nss.slice(8)}`)
  const downloading = page.waitForEvent('download')
  await security.getByRole('button', { name: 'Descargar comprobante' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('comprobante-imss.pdf')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  expect(Buffer.concat(chunks).equals(pdf)).toBe(true)

  // CA-01/CA-02: el detalle y el padrón no exponen nada del seguro.
  const origin = new URL(page.url()).origin
  for (const url of [`/api/students/${studentId}`, '/api/students']) {
    const body = await (await page.context().request.get(url, { headers: { Origin: origin } })).text()
    expect(body).not.toContain(nss)
    expect(body).not.toContain('social')
    expect(body).not.toContain('Vigencia')
  }
})

test('HU-S3-01: la institución construye el CV normalizado con datos protegidos y revisión de certificaciones', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const surname = `Cv${suffix}`
  const skill = `Laravel ${suffix}`
  const githubUrl = `https://github.com/alumna-${suffix.toLowerCase()}`
  const credentialUrl = `https://www.credly.com/badges/${suffix.toLowerCase()}`

  await page.goto('/')
  await page.getByRole('link', { name: 'Alumnos', exact: true }).click()
  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  await register.getByLabel('Matrícula o control interno', { exact: true }).fill(`CV-${suffix}`)
  await register.getByLabel('Nombre(s)', { exact: true }).fill('Renata')
  await register.getByLabel('Primer apellido', { exact: true }).fill(surname)
  await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
  await expect(register.getByRole('status')).toContainText('Alumno registrado')
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await openFromRoster(page, surname)
  const studentId = new URL(page.url()).pathname.split('/').pop()!

  // Página propia, enlazada desde el detalle.
  await page.getByRole('link', { name: 'CV profesional' }).click()
  await expect(page).toHaveURL(new RegExp(`/students/${studentId}/cv$`))
  await expect(page.getByRole('heading', { level: 2, name: `Renata ${surname}` })).toBeVisible()

  // Titular (CA-01) y detector de contacto (CA-02).
  const headline = page.getByRole('region', { name: 'Titular profesional' })
  await headline.getByLabel('Titular').fill('Desarrolladora Backend Junior')
  await headline.getByRole('button', { name: 'Guardar titular' }).click()
  await expect(headline.getByRole('status')).toHaveText('Titular guardado correctamente.')

  // Habilidades: una nueva técnica, una blanda y el autocompletado del catálogo.
  const skills = page.getByRole('region', { name: 'Habilidades' })
  const search = skills.getByRole('combobox', { name: 'Agregar habilidad' })
  await search.fill(skill)
  await expect(skills.getByRole('option', { name: new RegExp(`Agregar «${skill}» como nueva`) })).toBeVisible()
  await search.press('Enter')
  await skills.getByLabel('Blanda').check()
  await search.fill('Trabajo en equipo')
  await search.press('Enter')
  const savedSkills = page.waitForResponse((response) => response.url().endsWith(`/api/students/${studentId}/cv/skills`))
  await skills.getByRole('button', { name: 'Guardar habilidades' }).click()
  expect((await savedSkills).status()).toBe(200)
  await expect(skills.getByRole('status')).toHaveText('Habilidades guardadas correctamente.')
  // Ya guardada, se recupera del catálogo compartido (GET /api/skills) al quitarla y volver a buscarla.
  await skills.getByRole('button', { name: `Quitar ${skill}` }).click()
  const suggested = page.waitForResponse((response) => response.url().includes('/api/skills?q='))
  await search.fill(skill.slice(0, 9).toUpperCase())
  expect((await suggested).status()).toBe(200)
  await expect(skills.getByRole('option', { name: new RegExp(`^${skill}\\s*Técnica$`) })).toBeVisible()
  await search.press('Enter')
  await expect(skills.getByRole('list', { name: 'Técnicas' })).toContainText(skill)

  // Idiomas con nivel MCER.
  const languages = page.getByRole('region', { name: 'Idiomas' })
  await languages.getByRole('button', { name: 'Agregar idioma' }).click()
  await languages.getByLabel('Idioma 1', { exact: true }).selectOption({ label: 'Inglés' })
  await languages.getByLabel('Nivel de Inglés').selectOption({ label: 'B2 · Intermedio alto' })
  await languages.getByRole('button', { name: 'Guardar idiomas' }).click()
  await expect(languages.getByRole('status')).toHaveText('Idiomas guardados correctamente.')

  // Certificación con credencial protegida y revisión de la institución (CA-04).
  const certifications = page.getByRole('region', { name: 'Certificaciones' })
  await certifications.getByRole('button', { name: 'Agregar certificación' }).click()
  const certificationSheet = page.getByRole('dialog', { name: 'Agregar certificación' })
  await certificationSheet.getByLabel('Nombre de la certificación').fill('CCNA: Introduction to Networks')
  await certificationSheet.getByLabel('Emisor').fill('Cisco')
  await certificationSheet.getByLabel('Fecha de emisión').fill('2025-06-15')
  await certificationSheet.getByLabel('ID de la credencial (opcional)').fill(`CSCO-${suffix}`)
  await certificationSheet.getByLabel('URL de verificación (opcional)').fill(credentialUrl)
  await certificationSheet.getByRole('button', { name: 'Agregar certificación' }).click()
  await expect(certifications.getByText('Certificación agregada correctamente.')).toBeVisible()
  await expect(certificationSheet).toBeHidden()
  const card = certifications.getByRole('listitem').filter({ hasText: 'CCNA' })
  await expect(card.getByText('Sin revisar')).toBeVisible()
  const reviewed = page.waitForResponse((response) => /\/cv\/certifications\/\d+\/verification$/.test(response.url()))
  await card.getByRole('button', { name: /Marcar como revisada/ }).click()
  const reviewResponse = await reviewed
  expect(reviewResponse.request().method()).toBe('PATCH')
  expect(reviewResponse.request().postDataJSON()).toEqual({ verified: true })
  await expect(card.getByText('Revisada', { exact: true })).toBeVisible()

  // Proyecto en una hoja.
  const projects = page.getByRole('region', { name: 'Proyectos' })
  await projects.getByRole('button', { name: 'Agregar proyecto' }).click()
  const projectSheet = page.getByRole('dialog', { name: 'Agregar proyecto' })
  await projectSheet.getByLabel('Nombre del proyecto').fill('Sistema de inventario escolar')
  await projectSheet.getByLabel('Descripción').fill('API REST con Laravel y Vue.js para el almacén.')
  await projectSheet.getByLabel('Año (opcional)').fill('2025')
  await projectSheet.getByRole('button', { name: 'Agregar proyecto' }).click()
  await expect(projects.getByText('Proyecto agregado correctamente.')).toBeVisible()

  // Enlaces protegidos (CA-02).
  const links = page.getByRole('region', { name: /Enlaces externos/ })
  await expect(links.getByText(/no es visible en la búsqueda general de empresas/)).toBeVisible()
  await links.getByRole('button', { name: 'Agregar enlace' }).click()
  await links.getByLabel('Tipo del enlace 1', { exact: true }).selectOption({ label: 'GitHub' })
  await links.getByLabel('Dirección de GitHub').fill(githubUrl)
  await links.getByRole('button', { name: 'Guardar enlaces' }).click()
  await expect(links.getByRole('status')).toHaveText('Enlaces guardados correctamente.')

  // Todo se conserva al recargar.
  await page.reload()
  await expect(headline.getByLabel('Titular')).toHaveValue('Desarrolladora Backend Junior')
  await expect(skills.getByRole('list', { name: 'Técnicas' })).toContainText(skill)
  await expect(skills.getByRole('list', { name: 'Blandas' })).toContainText('Trabajo en equipo')
  await expect(languages.getByLabel('Nivel de Inglés')).toHaveValue('4')
  await expect(card.getByText('Revisada', { exact: true })).toBeVisible()
  await expect(card.getByText(`ID CSCO-${suffix}`)).toBeVisible()
  await expect(projects.getByText('Sistema de inventario escolar')).toBeVisible()
  await expect(links.getByLabel('Dirección de GitHub')).toHaveValue(githubUrl)

  // El detalle y el padrón no exponen los enlaces ni las credenciales.
  const origin = new URL(page.url()).origin
  for (const url of [`/api/students/${studentId}`, '/api/students']) {
    const body = await (await page.context().request.get(url, { headers: { Origin: origin } })).text()
    expect(body).not.toContain(githubUrl)
    expect(body).not.toContain(`CSCO-${suffix}`)
  }
})

test('HU-S8-01: la institución busca alumnos por matrícula o nombre, los filtra por estado y abre el detalle desde «Acciones»', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const active = { enrollment: `BUS-${suffix}-1`, given: 'Renata', surname: `Buscable${suffix}` }
  const inactive = { enrollment: `BUS-${suffix}-2`, given: 'Gael', surname: `Inactivo${suffix}` }

  await page.goto('/students')
  await page.getByRole('button', { name: /Registrar (el primer )?alumno/ }).first().click()
  const register = page.getByRole('dialog', { name: 'Registrar alumno' })
  for (const student of [active, inactive]) {
    await register.getByLabel('Matrícula o control interno', { exact: true }).fill(student.enrollment)
    await register.getByLabel('Nombre(s)', { exact: true }).fill(student.given)
    await register.getByLabel('Primer apellido', { exact: true }).fill(student.surname)
    await register.getByRole('button', { name: 'Registrar alumno', exact: true }).click()
    await expect(register.getByRole('status')).toContainText(student.surname)
  }
  await register.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // Baja lógica del segundo para probar el filtro por estado.
  await openFromRoster(page, inactive.surname)
  const status = page.getByRole('region', { name: 'Estado en el Banco de Talentos' })
  await status.getByRole('button', { name: 'Inactivar alumno' }).click()
  await page.getByRole('alertdialog', { name: '¿Inactivar al alumno?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
  await expect(status.getByText('INACTIVO', { exact: true })).toBeVisible()
  await page.goto('/students')

  const search = page.getByRole('search', { name: 'Buscar alumnos' })
  const table = page.getByRole('table', { name: 'Alumnos registrados' })

  // CA-01, CA-03: la búsqueda por fragmento de matrícula encuentra a los dos, sin distinguir mayúsculas.
  await search.getByLabel('Buscar por matrícula o nombre').fill(`bus-${suffix.toLowerCase()}`)
  await search.getByRole('button', { name: 'Buscar' }).click()
  await expect(table.getByRole('row')).toHaveCount(3)
  await expect(page.getByText('Página 1 de 1 · 2 alumnos')).toBeVisible()

  // El filtro de estado se combina con la búsqueda.
  await search.getByLabel('Estado').selectOption('inactive')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByRole('row', { name: new RegExp(inactive.surname) }).getByText('INACTIVO', { exact: true })).toBeVisible()

  // Sin coincidencias: mensaje y limpieza de filtros.
  await search.getByLabel('Buscar por matrícula o nombre').fill(`${active.given} ${active.surname}`)
  await search.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('heading', { name: 'Ningún alumno coincide con la búsqueda.' })).toBeVisible()
  await search.getByLabel('Estado').selectOption('active')
  const row = table.getByRole('row', { name: new RegExp(active.surname) })
  await expect(row).toBeVisible()

  // CA-04: «Ver detalle» en la columna «Acciones» y la fila completa abren el detalle; el apellido ya no es enlace.
  await expect(row.getByRole('link', { name: active.surname, exact: true })).toHaveCount(0)
  await row.getByRole('cell', { name: active.given, exact: true }).click()
  await expect(page).toHaveURL(/\/students\/\d+$/)
  await page.goBack()
  await page.getByRole('link', { name: `Ver detalle de ${active.surname}, ${active.given}` }).click()
  await expect(page.getByRole('heading', { level: 2, name: `${active.given} ${active.surname}` })).toBeVisible()
})
