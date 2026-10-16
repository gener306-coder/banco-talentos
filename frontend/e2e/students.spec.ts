import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'

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
  await page.getByRole('link', { name: surname, exact: true }).click()
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
  await profile.getByLabel('Municipio').fill('Monterrey')
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
  await expect(profile.getByLabel('Municipio')).toHaveValue('Monterrey')

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
  await page.getByRole('link', { name: surname, exact: true }).click()
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
  await page.getByRole('link', { name: surname, exact: true }).click()
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
  await page.getByRole('link', { name: surname, exact: true }).click()
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
