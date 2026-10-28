import { expect, test } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE, colorScheme: 'dark' })

// Modo oscuro preparado pero no activado (docs/design/identidad-visual.md, «Modo oscuro»): aunque el sistema prefiera
// oscuro, la aplicación se muestra en claro y los logotipos sin pastilla.
test('la aplicación se muestra en claro aunque el sistema prefiera el modo oscuro', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')

  const header = page.getByRole('banner')
  await expect(header.getByRole('heading', { level: 1, name: 'Banco de Talentos' })).toHaveCSS('color', 'rgb(153, 27, 48)')
  await expect(header.getByRole('img', { name: 'Nodologístico' }).locator('xpath=..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.getByRole('button', { name: /^Cuenta de / }).click()
  await expect(page.getByRole('region', { name: 'Cuenta' }).getByRole('group', { name: 'Tema' })).toHaveCount(0)
})
