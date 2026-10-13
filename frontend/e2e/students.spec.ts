import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.beforeAll(() => {
  if (!email || !password) throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
})

test('HU-S2-02: la institución registra alumnos en su padrón y la matrícula es única', async ({ page }) => {
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const first = { enrollment: `ITE-${suffix}-1`, given: 'María Fernanda', firstSurname: 'López', secondSurname: 'García' }
  const second = { enrollment: `ITE-${suffix}-2`, given: 'Luis', firstSurname: 'Báez', secondSurname: '' }

  // La cuenta INSTITUTION del seed está vinculada a «Institución E2E».
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email!)
  await page.getByLabel('Contraseña', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
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

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email!)
  await page.getByLabel('Contraseña', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
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
