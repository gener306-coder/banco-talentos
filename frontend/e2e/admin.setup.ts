import { expect, test as setup } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'

const email = process.env.E2E_ADMIN_EMAIL
const password = process.env.E2E_ADMIN_PASSWORD

setup('ADMIN inicia sesión una vez y guarda la sesión para los demás escenarios', async ({ page }) => {
  if (!email || !password) throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  // Inicio por rol: el saludo confirma la sesión.
  await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()
  // Cookies de sesión y CSRF: nunca se versionan (playwright/.auth está en .gitignore).
  await page.context().storageState({ path: ADMIN_STATE })
})
