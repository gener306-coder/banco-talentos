import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openCompanySession } from './support/company'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

// Video de 2 s (320×240, H.264 + AAC, 17 KB): el contenedor de Playwright no tiene ffmpeg para generarlo.
const FIXTURE = fileURLToPath(new URL('./fixtures/promocion-e2e.mp4', import.meta.url))

/**
 * HU-S9-01 a HU-S9-03 (CA-06 de HU-S9-03): la institución sube un video, el worker de pruebas lo procesa con ffmpeg
 * y la empresa lo encuentra en la galería con su póster y su MP4 servidos por URL firmada. El Chromium de Playwright no
 * decodifica H.264, así que la reproducción se verifica por el archivo que recibe el reproductor.
 */
test('la institución publica un video promocional y la empresa lo ve en la galería', async ({ page, browser, baseURL }) => {
  const title = `Talleres E2E ${randomBytes(4).toString('hex')}`

  await page.goto('/institution/videos')
  await page.getByRole('button', { name: /Subir (el primer )?video/ }).first().click()
  const form = page.getByRole('dialog', { name: 'Subir video promocional' })
  await form.getByLabel('Título').fill(title)
  await form.getByLabel('Descripción (opcional)').fill('Conoce nuestros talleres de manufactura.')
  await form.getByLabel('Archivo de video').setInputFiles(FIXTURE)
  await form.getByLabel(/Confirmo que cuento con la autorización/).check()
  await form.getByRole('button', { name: 'Subir video', exact: true }).click()
  await expect(page.getByText(`Recibimos «${title}». Procesando…`, { exact: false })).toBeVisible()

  // HU-S9-02 CA-05: la vista consulta cada 5 s hasta que el worker termina.
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })
  await expect(card.getByText('Publicado')).toBeVisible({ timeout: 60_000 })
  await expect(card.getByText('0:02')).toBeVisible()

  const { context, page: company } = await openCompanySession(browser, baseURL)
  try {
    await company.getByRole('link', { name: /Promoción dual/ }).click()
    const player = company.getByLabel(new RegExp(`^Video: ${title}, de `))
    await expect(player).toHaveAttribute('preload', 'none')

    const poster = await player.getAttribute('poster')
    const source = await player.getAttribute('src')
    expect(poster).toMatch(/^\/api\/media\/videos\/\d+\/[0-9a-f-]{36}\.jpg\?expires=/)
    expect(source).toMatch(/^\/api\/media\/videos\/\d+\/[0-9a-f-]{36}\.mp4\?expires=/)

    const image = await company.request.get(poster!)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/jpeg')
    const video = await company.request.get(source!, { headers: { Range: 'bytes=0-99' } })
    expect(video.status()).toBe(206)
    expect(video.headers()['content-type']).toBe('video/mp4')
    // Una firma alterada no sirve el archivo.
    expect((await company.request.get(`${source!}0`)).status()).toBe(403)
  } finally {
    await context.close()
  }
})
