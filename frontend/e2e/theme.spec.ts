import { expect, test } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

test.describe('modo oscuro', () => {
  test.use({ colorScheme: 'dark' })

  test('con el tema oscuro elegido, se aplica desde el primer pintado con el logotipo blanco y «Educación Dual» en blanco (HU-S8-03)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt-theme', 'dark'))
    // data-theme se fija antes de que cargue la aplicación (script de index.html).
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()

    const header = page.getByRole('banner')
    await expect(header.getByText('Educación Dual')).toHaveCSS('color', 'rgb(255, 255, 255)')
    // CA-02: logotipo para fondo oscuro, sin pastilla; CA-03: el de la Secretaría se mantiene igual.
    const logo = header.getByRole('img', { name: 'Nodologístico' })
    await expect(logo).toHaveAttribute('src', '/brand/logob.png')
    await expect(logo).toHaveJSProperty('complete', true)
    await expect(logo).not.toHaveJSProperty('naturalWidth', 0)
    await expect(header.getByRole('img', { name: 'Secretaría de Economía' })).toHaveAttribute('src', '/brand/sec-economia.png')
    // Las acciones primarias conservan el vino de marca con texto blanco.
    await expect(page.getByRole('link', { name: 'Registrar alumno' })).toHaveCSS('background-color', 'rgb(153, 27, 48)')
  })

  test('T-S14-06: el claro es el predeterminado aunque el sistema esté en oscuro; Sistema lo sigue y se recuerda al recargar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: /^Cuenta de / }).click()
    const theme = page.getByRole('region', { name: 'Cuenta' }).getByRole('group', { name: 'Tema' })
    await expect(theme.getByLabel('Claro')).toBeChecked()
    await theme.getByLabel('Sistema').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const logo = page.getByRole('banner').getByRole('img', { name: 'Nodologístico' })
    await expect(logo).toHaveAttribute('src', '/brand/logob.png')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // En claro vuelve el logotipo a color, y cambia al elegir otro tema.
    await page.getByRole('button', { name: /^Cuenta de / }).click()
    await page.getByRole('region', { name: 'Cuenta' }).getByRole('group', { name: 'Tema' }).getByLabel('Claro').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(logo).toHaveAttribute('src', '/brand/logo.png')
  })

  test('el login muestra el logotipo blanco en tema oscuro (HU-S8-03 CA-02)', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, colorScheme: 'dark', storageState: { cookies: [], origins: [] } })
    try {
      await context.addInitScript(() => localStorage.setItem('bt-theme', 'dark'))
      const page = await context.newPage()
      await page.goto('/login')
      await expect(page.getByRole('region', { name: 'Iniciar sesión' }).getByRole('img', { name: 'Nodologístico' })).toHaveAttribute('src', '/brand/logob.png')
    } finally {
      await context.close()
    }
  })
})

test('sin preferencia oscura del sistema, la aplicación se muestra en claro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('banner').getByRole('heading', { level: 1, name: 'Banco de Talentos' })).toHaveCSS('color', 'rgb(153, 27, 48)')
  await expect(page.getByRole('banner').getByRole('img', { name: 'Nodologístico' })).toHaveAttribute('src', '/brand/logo.png')
})
