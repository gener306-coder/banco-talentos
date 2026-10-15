import { expect, test as setup } from '@playwright/test'
import { INSTITUTION_STATE } from './support/institution'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

setup('INSTITUTION inicia sesión una vez y guarda la sesión para los escenarios de alumnos', async ({ page }) => {
  if (!email || !password) throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sesión iniciada', exact: true })).toBeVisible()
  await page.context().storageState({ path: INSTITUTION_STATE })
})
