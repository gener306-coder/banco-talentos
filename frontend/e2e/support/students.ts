import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** HU-S8-01: busca al alumno en el padrón y abre su detalle con «Ver detalle», sin depender de la página en que quede. */
export async function openFromRoster(page: Page, surname: string) {
  const search = page.getByRole('search', { name: 'Buscar alumnos' })
  await search.getByLabel('Buscar por matrícula o nombre').fill(surname)
  await search.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: new RegExp(`^Ver detalle de ${surname}`) }).click()
}

/** La institución registra un alumno en Matamoros con titular y una habilidad única. */
export async function publishStudent(page: Page, data: { surname: string; enrollment: string; headline: string; skill: string }) {
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
