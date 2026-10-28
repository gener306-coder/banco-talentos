import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { openCompanySession } from './support/company'

test('HU-S5-02 y HU-S5-03: la empresa registra una oportunidad con el municipio precargado → la edita → la ve en su listado → la inactiva y la reactiva', async ({ browser, baseURL }) => {
  const suffix = randomBytes(6).toString('hex')
  const title = `Automatización E2E ${suffix}`
  const skill = `Robótica${suffix}`
  const { context, page } = await openCompanySession(browser, baseURL)
  try {
    // CA-07: acceso desde el inicio de la empresa.
    await page.getByRole('navigation', { name: 'Empresa' }).getByRole('link', { name: 'Oportunidades Duales' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Oportunidades Duales' })).toBeVisible()
    await page.getByRole('link', { name: 'Nueva oportunidad' }).first().click()

    const form = page.locator('form.opportunity-form')
    // CA-05: la ubicación de la empresa (Reynosa, Tamaulipas) viene precargada.
    await expect(form.getByLabel('Estado')).toHaveValue('28')
    await expect(form.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Reynosa')

    // CA-04: un correo en un texto libre se rechaza en línea.
    const titleInput = form.getByLabel('Título de la oportunidad')
    await titleInput.fill('Escríbenos a rh@empresa.mx')
    await titleInput.blur()
    await expect(titleInput).toHaveAccessibleDescription(/No incluyas enlaces, correos ni teléfonos/)
    await titleInput.fill(title)

    await form.getByLabel('Actividades y objetivos').fill('Programación de celdas robotizadas y mejora continua de la línea.')
    await form.getByLabel('Lugares disponibles').fill('4')
    await form.getByLabel('Carrera o programa requerido').fill('Ingeniería Mecatrónica')
    await form.getByLabel('Tipo de periodo').selectOption('semester')
    await form.getByLabel('Periodo mínimo').selectOption('5')
    await form.getByLabel('Idioma (opcional)').selectOption('en')
    await form.getByLabel('Nivel mínimo').selectOption('4')
    const skillInput = form.getByRole('combobox', { name: 'Agregar habilidad' })
    await skillInput.fill(skill)
    await skillInput.press('Enter')
    await expect(form.getByRole('list', { name: 'Técnicas' }).getByText(skill)).toBeVisible()
    await form.getByRole('group', { name: '¿Requiere que el alumno se reubique?' }).getByLabel('No', { exact: true }).check()

    const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/opportunities' && response.request().method() === 'POST')
    await form.getByRole('button', { name: 'Registrar oportunidad' }).click()
    expect((await created).status()).toBe(201)
    await expect(page.getByText('Oportunidad registrada correctamente.')).toBeVisible()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await expect(page.getByText('Reynosa, Tamaulipas')).toBeVisible()
    await expect(page.getByText('5.º semestre o posterior')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Habilidades requeridas' }).getByText(skill)).toBeVisible()

    // Edición: más lugares y otro municipio del catálogo.
    await page.getByRole('link', { name: 'Editar oportunidad' }).click()
    const edit = page.locator('form.opportunity-form')
    await expect(edit.getByLabel('Título de la oportunidad')).toHaveValue(title)
    await edit.getByLabel('Lugares disponibles').fill('6')
    const municipality = edit.getByRole('combobox', { name: 'Municipio' })
    await municipality.fill('victoria')
    await page.getByRole('option', { name: 'Victoria', exact: true }).click()
    await edit.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Oportunidad actualizada correctamente.')).toBeVisible()
    await expect(page.getByText('Victoria, Tamaulipas')).toBeVisible()

    // CA-06: la más reciente aparece primero en el listado, ACTIVA y con sus habilidades.
    await page.getByRole('link', { name: 'Volver a oportunidades' }).click()
    const firstRow = page.getByRole('table', { name: 'Oportunidades de la empresa' }).getByRole('row').nth(1)
    await expect(firstRow).toContainText(title)
    await expect(firstRow).toContainText('Victoria')
    await expect(firstRow).toContainText('6')
    await expect(firstRow).toContainText('ACTIVA')
    await expect(firstRow.getByText(skill)).toBeVisible()

    // HU-S5-03: cancelar la confirmación no cambia nada → inactivar → estado en detalle y listado → reactivar.
    await firstRow.getByRole('link', { name: `Ver detalle de ${title}` }).click()
    const status = page.getByRole('region', { name: 'Estado de la oportunidad' })
    await status.getByRole('button', { name: 'Inactivar oportunidad' }).click()
    let dialog = page.getByRole('alertdialog', { name: '¿Inactivar la oportunidad?' })
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()

    await status.getByRole('button', { name: 'Inactivar oportunidad' }).click()
    dialog = page.getByRole('alertdialog', { name: '¿Inactivar la oportunidad?' })
    const inactivated = page.waitForResponse((response) => response.url().endsWith('/status') && response.request().method() === 'PATCH')
    await dialog.getByRole('button', { name: 'Inactivar' }).click()
    expect((await inactivated).status()).toBe(200)
    await expect(status.getByText('Oportunidad inactivada correctamente.')).toBeVisible()
    await expect(page.getByText('INACTIVA', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Volver a oportunidades' }).click()
    await expect(page.getByRole('table', { name: 'Oportunidades de la empresa' }).getByRole('row').nth(1)).toContainText('INACTIVA')

    await page.getByRole('link', { name: `Ver detalle de ${title}` }).click()
    await status.getByRole('button', { name: 'Reactivar oportunidad' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(status.getByText('Oportunidad reactivada correctamente.')).toBeVisible()
    await expect(page.getByText('ACTIVA', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
