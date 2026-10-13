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
