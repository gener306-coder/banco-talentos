import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { linkFromMail } from './support/mailpit'
import { createSecretaryAccount, signInWithSetupLink } from './support/secretary'

test.use({ storageState: ADMIN_STATE })

test('HU-S16-03: una persona olvida su contraseña → la pide desde el inicio de sesión → la restablece con el correo y entra', async ({ page, browser, baseURL, request }) => {
  test.setTimeout(90_000)
  const suffix = randomBytes(6).toString('hex')
  const email = `olvido-${suffix}@example.test`

  // Cuenta propia del escenario: la crea ADMIN y su titular configura una primera contraseña.
  await page.goto('/secretary-accounts')
  const link = await createSecretaryAccount(page, { name: `Olvido ${suffix}`, email })
  const { context: first } = await signInWithSetupLink(browser, baseURL, link, email)
  await first.close()

  const context = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    const visitor = await context.newPage()
    await visitor.goto('/login')
    await visitor.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await expect(visitor.getByRole('heading', { level: 2, name: '¿Olvidaste tu contraseña?' })).toBeVisible()
    await visitor.getByLabel('Correo electrónico').fill(email)
    await visitor.getByRole('button', { name: 'Enviar enlace', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Si el correo corresponde a una cuenta activa')

    const password = randomBytes(24).toString('hex')
    await visitor.goto(await linkFromMail(request, email, 'Restablece tu contraseña', '/reset-password'))
    await visitor.getByLabel('Contraseña', { exact: true }).fill(password)
    await visitor.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
    await visitor.getByRole('button', { name: 'Restablecer contraseña', exact: true }).click()
    await expect(visitor.getByRole('status')).toHaveText('Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.')

    await visitor.goto('/login')
    await visitor.getByLabel('Correo electrónico').fill(email)
    await visitor.getByLabel('Contraseña', { exact: true }).fill(password)
    await visitor.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(visitor.getByRole('heading', { name: /^Hola, / })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('HU-S16-03: un correo sin cuenta recibe la misma respuesta y ningún correo', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    const visitor = await context.newPage()
    await visitor.goto('/forgot-password')
    await visitor.getByLabel('Correo electrónico').fill(`nadie-${randomBytes(6).toString('hex')}@example.test`)
    await visitor.getByRole('button', { name: 'Enviar enlace', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Si el correo corresponde a una cuenta activa')
  } finally {
    await context.close()
  }
})
