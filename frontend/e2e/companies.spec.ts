import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { linkFromMail, mailCount } from './support/mailpit'
import { openSecretarySession } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

/** RFC de persona moral con fecha válida y homoclave aleatoria. */
const rfc = () => `EMP010101${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`

test('HU-S4-02: la Secretaría registra una empresa → la busca → la edita → la inactiva y la reactiva', async ({ page, browser, baseURL, request }) => {
  const { context, page: secretary } = await openSecretarySession(browser, baseURL)
  const suffix = randomBytes(6).toString('hex')
  const legalName = `Manufacturas E2E ${suffix}, S.A. de C.V.`
  const companyRfc = rfc()
  try {
    // CA-09: Empresas desde el inicio.
    await secretary.getByRole('link', { name: 'Empresas', exact: true }).click()
    await secretary.getByRole('link', { name: 'Nueva empresa', exact: true }).click()

    // CA-02: alta mínima con el municipio del catálogo.
    await secretary.getByLabel('Razón social', { exact: true }).fill(legalName)
    await secretary.getByLabel('RFC', { exact: true }).fill(companyRfc.toLowerCase())
    await secretary.getByLabel('Sector económico (SCIAN)').selectOption('31-33')
    await secretary.getByLabel('Estado', { exact: true }).selectOption({ label: 'Tamaulipas' })
    await secretary.getByRole('combobox', { name: 'Municipio' }).fill('reynosa')
    await secretary.getByRole('option', { name: 'Reynosa', exact: true }).click()
    await secretary.getByLabel('Nombre del contacto', { exact: true }).fill('Lucía Herrera')
    await secretary.getByLabel('Correo del contacto', { exact: true }).fill(`dual-${suffix}@example.test`)
    const created = secretary.waitForResponse((response) => response.url().endsWith('/api/companies') && response.request().method() === 'POST')
    await secretary.getByRole('button', { name: 'Registrar empresa', exact: true }).click()
    expect((await created).status()).toBe(201)
    // T-S8-12: el registro crea la cuenta del contacto y le envía el enlace para su contraseña.
    await expect(secretary.getByText(`Empresa registrada. Enviamos a dual-${suffix}@example.test el enlace para establecer su contraseña.`, { exact: true })).toBeVisible()
    expect(await linkFromMail(request, `dual-${suffix}@example.test`, 'Establece tu contraseña', '/set-initial-password')).toContain('/set-initial-password?')
    await expect(secretary.getByRole('row').filter({ hasText: `dual-${suffix}@example.test` })).toContainText('PENDIENTE')
    await expect(secretary.getByText(companyRfc, { exact: true })).toBeVisible()
    await expect(secretary.getByText('Reynosa, Tamaulipas', { exact: true })).toBeVisible()

    // CA-08: búsqueda por RFC en el listado.
    await secretary.getByRole('link', { name: 'Volver a empresas' }).click()
    await secretary.getByLabel('Buscar empresa').fill(companyRfc)
    await secretary.getByRole('button', { name: 'Buscar', exact: true }).click()
    const row = secretary.getByRole('row').filter({ hasText: companyRfc })
    await expect(row).toContainText('ACTIVA')
    await row.getByRole('link', { name: /Ver detalle/ }).click()

    // Edición conservando el municipio.
    await secretary.getByRole('link', { name: 'Editar empresa', exact: true }).click()
    await expect(secretary.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Reynosa')
    await secretary.getByLabel('Nombre comercial (opcional)').fill(`Golfo ${suffix}`)
    await secretary.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(secretary.getByText('Empresa actualizada correctamente.', { exact: true })).toBeVisible()
    await expect(secretary.getByText(`Golfo ${suffix}`, { exact: true })).toBeVisible()

    // CA-07: inactivar pide confirmación; reactivar no.
    await secretary.getByRole('button', { name: 'Inactivar empresa', exact: true }).click()
    await secretary.getByRole('alertdialog', { name: '¿Inactivar la empresa?' }).getByRole('button', { name: 'Inactivar', exact: true }).click()
    await expect(secretary.getByText('Empresa inactivada correctamente.', { exact: true })).toBeVisible()
    await secretary.getByRole('button', { name: 'Activar empresa', exact: true }).click()
    await expect(secretary.getByText('Empresa activada correctamente.', { exact: true })).toBeVisible()

    // CA-03: el mismo RFC no puede registrarse dos veces.
    await secretary.goto('/companies/new')
    await secretary.getByLabel('Razón social', { exact: true }).fill(`Duplicada ${suffix}`)
    await secretary.getByLabel('RFC', { exact: true }).fill(companyRfc)
    await secretary.getByLabel('Sector económico (SCIAN)').selectOption('54')
    await secretary.getByLabel('Estado', { exact: true }).selectOption({ label: 'Tamaulipas' })
    await secretary.getByRole('combobox', { name: 'Municipio' }).fill('victoria')
    await secretary.getByRole('option', { name: 'Victoria', exact: true }).click()
    await secretary.getByLabel('Nombre del contacto', { exact: true }).fill('Otro')
    await secretary.getByLabel('Correo del contacto', { exact: true }).fill(`otro-${suffix}@example.test`)
    await secretary.getByRole('button', { name: 'Registrar empresa', exact: true }).click()
    await expect(secretary.getByText('Ya existe una empresa registrada con ese RFC.')).toBeVisible()
  } finally {
    await context.close()
  }

  // CA-01: ADMIN no gestiona empresas.
  await page.goto('/companies')
  await expect(page.getByRole('alert')).toHaveText('No tienes permiso para gestionar empresas.')
})

test('T-S8-12: la Secretaría registra una empresa y comparte el enlace del contacto sin correo', async ({ browser, baseURL, request }) => {
  const { context, page: secretary } = await openSecretarySession(browser, baseURL)
  const suffix = randomBytes(6).toString('hex')
  const email = `enlace-${suffix}@example.test`
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  try {
    await secretary.goto('/companies/new')
    await secretary.getByLabel('Razón social', { exact: true }).fill(`Enlace E2E ${suffix}, S.C.`)
    await secretary.getByLabel('RFC', { exact: true }).fill(rfc())
    await secretary.getByLabel('Sector económico (SCIAN)').selectOption('54')
    await secretary.getByLabel('Estado', { exact: true }).selectOption({ label: 'Tamaulipas' })
    await secretary.getByRole('combobox', { name: 'Municipio' }).fill('victoria')
    await secretary.getByRole('option', { name: 'Victoria', exact: true }).click()
    await secretary.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto enlace')
    await secretary.getByLabel('Correo del contacto', { exact: true }).fill(email)
    await secretary.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
    await secretary.getByRole('button', { name: 'Registrar empresa', exact: true }).click()

    // El enlace se queda en esta página para copiarlo; no llega ningún correo.
    await expect(secretary.getByRole('status').first()).toHaveText('Empresa registrada. Copia el enlace y compártelo con Contacto enlace para que establezca su contraseña.')
    const link = await secretary.getByLabel('Enlace de configuración', { exact: true }).inputValue()
    expect(link).toContain('/set-initial-password?')
    await secretary.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
    expect(await secretary.evaluate('navigator.clipboard.readText()') === link).toBe(true)
    expect(await mailCount(request, email)).toBe(0)

    await secretary.getByRole('link', { name: 'Ver la empresa', exact: true }).click()
    await expect(secretary.getByRole('row').filter({ hasText: email })).toContainText('PENDIENTE')
  } finally {
    await context.close()
  }
})
