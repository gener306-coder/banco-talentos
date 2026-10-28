import { expect, test } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

test.describe('modo oscuro', () => {
  test.use({ colorScheme: 'dark' })

  test('sigue al sistema desde el primer pintado, con logotipos en pastilla clara y «Educación Dual» en blanco', async ({ page }) => {
    // data-theme se fija antes de que cargue la aplicación (script de index.html).
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()

    const header = page.getByRole('banner')
    await expect(header.getByText('Educación Dual')).toHaveCSS('color', 'rgb(255, 255, 255)')
    for (const name of ['Nodologístico', 'Secretaría de Economía']) {
      const plate = header.getByRole('img', { name }).locator('xpath=..')
      await expect(plate).toHaveClass(/brand-plate/)
      await expect(plate).toHaveCSS('background-color', 'rgb(241, 240, 243)')
    }
    // Las acciones primarias conservan el vino de marca con texto blanco.
    await expect(page.getByRole('link', { name: 'Registrar alumno' })).toHaveCSS('background-color', 'rgb(153, 27, 48)')
  })

  test('el menú de cuenta fija el tema claro y lo recuerda al recargar; «Sistema» vuelve al oscuro', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Cuenta de / }).click()
    const theme = page.getByRole('region', { name: 'Cuenta' }).getByRole('group', { name: 'Tema' })
    await expect(theme.getByLabel('Sistema')).toBeChecked()
    await theme.getByLabel('Claro').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    // En claro la pastilla no se ve.
    await expect(page.getByRole('banner').getByRole('img', { name: 'Nodologístico' }).locator('xpath=..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

    await page.getByRole('button', { name: /^Cuenta de / }).click()
    await page.getByRole('region', { name: 'Cuenta' }).getByRole('group', { name: 'Tema' }).getByLabel('Sistema').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test('sin preferencia oscura del sistema, la aplicación se muestra en claro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('banner').getByRole('heading', { level: 1, name: 'Banco de Talentos' })).toHaveCSS('color', 'rgb(153, 27, 48)')
})
