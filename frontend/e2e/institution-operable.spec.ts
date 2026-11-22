import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { postponeWelcome, randomCct } from './support/institution'

test.use({ storageState: ADMIN_STATE })

test('HU-S16-06 a HU-S16-08: la institución invitada completa su perfil y se desbloquea la subida de videos', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  const suffix = randomBytes(6).toString('hex')
  const account = { email: `invitada-${suffix}@example.test`, password: randomBytes(24).toString('hex') }

  // ADMIN invita solo con el correo y comparte el enlace manual (HU-S16-06).
  await page.goto('/institutions/new')
  await page.getByLabel('Correo de la cuenta', { exact: true }).fill(account.email)
  await page.getByRole('radio', { name: /Generar un enlace para compartirlo/ }).check()
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
  const link = await page.getByLabel('Enlace de configuración', { exact: true }).inputValue()

  const holderContext = await browser.newContext({ baseURL, ...NO_SESSION })
  try {
    const holder = await holderContext.newPage()
    await holder.goto(new URL(link).toString())
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByLabel('Confirmar contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Establecer contraseña', exact: true }).click()
    await expect(holder.getByRole('status')).toHaveText('Contraseña establecida. Ya puedes iniciar sesión.')
    await holder.goto('/login')
    await holder.getByLabel('Correo electrónico').fill(account.email)
    await holder.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await holder.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()

    // HU-S16-07: bienvenida al entrar; se pospone y el inicio recuerda el perfil.
    await postponeWelcome(holder, baseURL)
    await expect(holder.getByText('Institución sin nombre', { exact: true })).toBeVisible()
    const nudge = holder.getByRole('link', { name: /Completa tu perfil para que tus alumnos aparezcan en la búsqueda de talento\./ })
    await expect(nudge).toBeVisible()

    // HU-S16-08: sin el mínimo, la subida de videos explica qué falta en lugar del formulario.
    await holder.goto('/institution/videos')
    await holder.getByRole('button', { name: 'Subir video', exact: true }).click()
    const dialog = holder.getByRole('dialog', { name: 'Subir una historia' })
    await expect(dialog.getByRole('note', { name: 'Perfil de la institución incompleto' })).toBeVisible()
    await expect(dialog.getByLabel('Archivo de video')).toHaveCount(0)
    await dialog.getByRole('link', { name: 'Completar perfil', exact: true }).click()

    // Mi cuenta abre la edición por el ancla con el avance de los 4 datos mínimos (HU-S16-07).
    await expect(holder).toHaveURL(/\/account#organization$/)
    const card = holder.getByRole('region', { name: 'Perfil de la institución' })
    await expect(card.getByText('0 de 4 datos', { exact: true })).toBeVisible()
    await card.getByLabel('Nombre oficial').fill(`Instituto invitado E2E ${suffix}`)
    await card.getByLabel('Clave de Centro de Trabajo (CCT)').fill(randomCct())
    await card.getByLabel('Soy yo').check()
    await card.getByLabel('Tu nombre').fill('Coordinación invitada')
    await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(card.getByText('Perfil completo', { exact: true })).toBeVisible()

    // Con el perfil completo, el formulario de subida vuelve y el recordatorio del inicio desaparece.
    await holder.goto('/institution/videos')
    await holder.getByRole('button', { name: 'Subir video', exact: true }).click()
    await expect(holder.getByRole('dialog', { name: 'Subir una historia' }).getByLabel('Archivo de video')).toBeAttached()
    await holder.goto('/')
    await expect(holder.getByRole('heading', { name: 'Hola, Coordinación invitada' })).toBeVisible()
    await expect(nudge).toHaveCount(0)
  } finally {
    await holderContext.close()
  }
})
