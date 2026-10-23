import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { NO_SESSION } from './admin'

/** Crea una cuenta de la Secretaría con enlace manual desde la sección abierta y devuelve el enlace (HU-S4-01). */
export async function createSecretaryAccount(page: Page, account: { name: string; email: string }): Promise<string> {
  await page.getByRole('button', { name: 'Nueva cuenta de la Secretaría', exact: true }).click()
  const creation = page.getByRole('dialog', { name: 'Nueva cuenta de la Secretaría' })
  await creation.getByLabel('Nombre de la cuenta', { exact: true }).fill(account.name)
  await creation.getByLabel('Correo de acceso', { exact: true }).fill(account.email)
  await creation.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  const created = page.waitForResponse((response) => response.url().endsWith('/api/secretary-accounts') && response.request().method() === 'POST')
  await creation.getByRole('button', { name: 'Crear cuenta de la Secretaría', exact: true }).click()
  expect((await created).status()).toBe(201)
  const link = await creation.getByLabel('Enlace de configuración', { exact: true }).inputValue()
  await creation.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(creation).toBeHidden()
  return link
}

/** Establece la contraseña con el enlace e inicia sesión en un contexto propio, sin la sesión ADMIN. */
export async function signInWithSetupLink(browser: Browser, baseURL: string | undefined, link: string, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const password = randomBytes(24).toString('hex')
  const context = await browser.newContext({ baseURL, ...NO_SESSION })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  return { context, page }
}

/** ADMIN (sesión de la página) crea una cuenta de la Secretaría y devuelve su sesión ya iniciada. */
export async function newSecretarySession(adminPage: Page, browser: Browser, baseURL: string | undefined, label: string) {
  const suffix = randomBytes(8).toString('hex')
  const email = `${label}-${suffix}@example.test`
  await adminPage.goto('/secretary-accounts')
  const link = await createSecretaryAccount(adminPage, { name: `${label} ${suffix}`, email })
  return { email, ...(await signInWithSetupLink(browser, baseURL, link, email)) }
}
