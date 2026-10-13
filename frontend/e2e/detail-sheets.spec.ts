import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'

test.use({ viewport: { width: 375, height: 812 }, storageState: ADMIN_STATE })

// Arrastra la barra superior de la hoja con el puntero, en pocos pasos rápidos.
async function dragHeader(page: Page, sheet: Locator, distance: number) {
  const header = sheet.locator('.sheet-header')
  const box = (await header.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 6; step++) await page.mouse.move(x, y + (distance * step) / 6)
  await page.mouse.up()
}

test('en móvil, los formularios del detalle se abren en hojas arrastrables que conservan su contenido', async ({ page }) => {
  const suffix = randomBytes(6).toString('hex')

  // La sesión ADMIN ya viene de admin.setup.ts: se parte del área protegida.
  await page.goto('/')
  await page.getByRole('link', { name: 'Instituciones', exact: true }).click()
  await page.getByRole('link', { name: 'Nueva institución', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill(`Instituto hojas E2E ${suffix}`)
  await page.getByLabel('CCT', { exact: true }).fill(`HOJAS${suffix}`)
  await page.getByLabel('Correo de contacto', { exact: true }).fill(`contacto-hojas-${suffix}@example.test`)
  await page.getByRole('button', { name: 'Crear institución', exact: true }).click()
  await expect(page).toHaveURL(/\/institutions\/\d+$/)

  // El detalle solo muestra datos y acciones; los formularios están en hojas cerradas.
  await expect(page.getByLabel('Nombre de la cuenta', { exact: true })).toBeHidden()
  const opener = page.getByRole('button', { name: 'Nueva cuenta institucional', exact: true })
  await opener.click()
  const sheet = page.getByRole('dialog', { name: 'Crear cuenta institucional' })
  await expect(sheet).toBeVisible()
  await expect(page.locator('.sheet-layer.compact:not([hidden])')).toHaveCount(1)
  await expect(sheet.locator('.sheet-handle')).toBeVisible()
  await expect(sheet.getByLabel('Nombre de la cuenta', { exact: true })).toBeFocused()

  await sheet.getByLabel('Nombre de la cuenta', { exact: true }).fill(`Titular hojas ${suffix}`)
  await sheet.getByLabel('Correo de acceso', { exact: true }).fill(`hojas-${suffix}@example.test`)
  await sheet.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  await sheet.getByRole('button', { name: 'Crear cuenta institucional', exact: true }).click()
  const link = await sheet.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  expect(link.includes('/set-initial-password?')).toBe(true)

  // Un arrastre corto hacia arriba resiste y la hoja vuelve a su sitio sin cerrarse.
  await page.waitForTimeout(600)
  await dragHeader(page, sheet, -120)
  await page.waitForTimeout(600)
  await expect(sheet).toBeVisible()

  // Lanzarla hacia abajo la cierra siguiendo el gesto.
  await dragHeader(page, sheet, 360)
  await expect(sheet).toBeHidden()

  // Al reabrirla, el enlace generado sigue ahí: el trabajo en curso no se pierde.
  await opener.click()
  await expect(sheet).toBeVisible()
  expect(await sheet.getByLabel('Enlace de configuración', { exact: true }).inputValue() === link).toBe(true)

  // Cerrar devuelve el foco al botón que la abrió.
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(opener).toBeFocused()
})
