import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openCompanySession } from './support/company'
import { INSTITUTION_STATE } from './support/institution'

test.use({ storageState: INSTITUTION_STATE })

// Video de 2 s (320×240, H.264 + AAC, 17 KB): el contenedor de Playwright no tiene ffmpeg para generarlo.
const FIXTURE = fileURLToPath(new URL('./fixtures/promocion-e2e.mp4', import.meta.url))

// El Chromium de Playwright no decodifica H.264: para ejercitar el reproductor, el MP4 se sustituye por este WebM de 6 s.
const PLAYABLE = fileURLToPath(new URL('./fixtures/reproduccion-e2e.webm', import.meta.url))

/**
 * HU-S9-01 a HU-S9-05: la institución sube un testimonio, el worker de pruebas lo procesa con ffmpeg y la empresa lo
 * encuentra en su inicio, lo abre en el feed y usa el reproductor propio. Los archivos se sirven por URL firmada.
 */
test('la institución publica una historia y la empresa la encuentra y la reproduce', async ({ page, browser, baseURL }) => {
  const title = `Mi experiencia E2E ${randomBytes(4).toString('hex')}`

  await page.goto('/institution/videos')
  await page.getByRole('button', { name: /Subir (el primer )?video/ }).first().click()
  const form = page.getByRole('dialog', { name: 'Subir una historia' })
  await form.getByLabel('Título').fill(title)
  await form.getByLabel('Descripción (opcional)').fill('Cuento cómo fue mi año en la empresa.')
  await form.getByLabel('Archivo de video').setInputFiles(FIXTURE)
  await form.getByLabel(/Confirmo que cuento con la autorización/).check()
  await form.getByRole('button', { name: 'Subir video', exact: true }).click()
  await expect(page.getByText(`Recibimos «${title}». Procesando…`, { exact: false })).toBeVisible()

  // HU-S9-02 CA-05: la vista consulta cada 5 s hasta que el worker termina.
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })
  await expect(card.getByText('Publicado')).toBeVisible({ timeout: 60_000 })
  await expect(card.getByText('0:02')).toBeVisible()
  // HU-S9-04 CA-05: sin información de peso.
  await expect(card).not.toContainText(/\d\s?(MB|KB)/)

  const { context, page: company } = await openCompanySession(browser, baseURL)
  try {
    // HU-S9-05, HU-S9-06: la historia está en el carrusel del inicio, y el clic abre su vista previa ahí mismo.
    const spotlight = company.getByRole('region', { name: 'Alumnos que ya vivieron el Dual en una empresa' })
    await spotlight.getByRole('button', { name: new RegExp(`^Ver la vista previa de ${title}, de `) }).click()
    await expect(company).toHaveURL(/\/$/)
    const preview = company.getByRole('dialog', { name: title })
    await expect(preview.getByLabel(new RegExp(`^Video: ${title}, de `))).toBeVisible()
    await preview.getByRole('link', { name: 'Ver todas las historias' }).click()
    await expect(company).toHaveURL(/\/promocion\?video=[0-9a-f-]{36}$/)

    const story = company.getByRole('article', { name: title })
    const player = story.getByLabel(new RegExp(`^Video: ${title}, de `))
    await expect(player).toHaveAttribute('preload', 'none')
    await expect(player).not.toHaveAttribute('controls')
    await expect(story.getByRole('link', { name: 'Buscar talento' })).toHaveAttribute('href', '/talent')

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

test('el reproductor arranca sin sonido, pausa, reanuda y ofrece el sonido', async ({ browser, baseURL }) => {
  const { context, page: company } = await openCompanySession(browser, baseURL)
  try {
    await company.route('**/api/media/videos/**/*.mp4*', (route) => route.fulfill({ path: PLAYABLE, contentType: 'video/webm' }))
    await company.goto('/promocion')
    const story = company.getByRole('article').first()
    const player = story.getByLabel(/^Video: /)
    // La configuración de TypeScript de E2E no incluye los tipos del navegador.
    type Media = { paused: boolean; muted: boolean }
    const isPaused = () => player.evaluate((element) => (element as unknown as Media).paused)
    const isMuted = () => player.evaluate((element) => (element as unknown as Media).muted)

    // HU-S9-04 CA-03: el video visible arranca solo y sin sonido.
    await expect.poll(isPaused).toBe(false)
    expect(await isMuted()).toBe(true)

    await story.getByRole('group').hover()
    await story.getByRole('button', { name: 'Pausar' }).click()
    await expect.poll(isPaused).toBe(true)
    await story.getByRole('button', { name: /^Reproducir: / }).click()
    await expect.poll(isPaused).toBe(false)

    await story.getByRole('button', { name: 'Activar sonido' }).click()
    expect(await isMuted()).toBe(false)
    await expect(story.getByRole('button', { name: 'Silenciar' })).toBeVisible()
  } finally {
    await context.close()
  }
})
