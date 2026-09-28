import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  }
})

test('un visitante no accede al área protegida ni a la API', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)

  const response = await request.get('/api/me')
  expect(response.status()).toBe(401)
  expect(response.headers()['content-type']).toContain('application/json')
})

test('login → área protegida → recarga → logout invalida también la cookie anterior', async ({ page, context, browser, baseURL }) => {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email!)
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-incorrecta-de-prueba')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('No fue posible iniciar sesión con esos datos.')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Contraseña', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(`${baseURL}/`)
  await expect(page.getByText(email!, { exact: true })).toBeVisible()
  await expect(page.getByText('Institución', { exact: true })).toBeVisible()

  const cookies = await context.cookies()
  const sessionCookie = cookies.find((cookie) => cookie.name === 'banco-talentos-test-session')
  expect(sessionCookie?.httpOnly).toBe(true)
  expect(sessionCookie?.sameSite).toBe('Lax')
  expect(cookies.some((cookie) => cookie.name === 'XSRF-TOKEN')).toBe(true)
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 })

  await page.reload()
  await expect(page.getByText(email!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  // Otro cliente intenta reutilizar la cookie cifrada anterior al cierre de sesión.
  const replay = await browser.newContext({ baseURL, storageState: { cookies, origins: [] } })
  try {
    const response = await replay.request.get('/api/me', { headers: { Origin: baseURL! } })
    expect(response.status()).toBe(401)
    const replayPage = await replay.newPage()
    await replayPage.goto('/')
    await expect(replayPage).toHaveURL(/\/login$/)
  } finally {
    await replay.close()
  }
})
