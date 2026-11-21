import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { NO_SESSION } from './support/admin'
import { COMPANY_STATE } from './support/company'

// HU-S15-01 a HU-S15-04: documentos legales públicos, footer y aviso simplificado, a 1440 y 390 px en claro y oscuro.
const VIEWPORTS = [
  { name: '1440 px', width: 1440, height: 900 },
  { name: '390 px', width: 390, height: 844 },
] as const
const THEMES = ['light', 'dark'] as const

/**
 * Sin desborde horizontal de la página, incluso durante la transición entre vistas: useRouteTransition desplaza <main>
 * 24 px, más que el margen de 16 px a 390 px, y #root lo recorta con overflow-x: clip.
 */
async function expectNoHorizontalOverflow(page: Page) {
  // Como texto: la configuración de las E2E no incluye los tipos del DOM.
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`sin sesión, ${viewport.name}, tema ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
      test.use({ ...NO_SESSION, viewport: { width: viewport.width, height: viewport.height } })

      test('del inicio de sesión a los tres documentos y de regreso', async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('bt-theme', value), theme)
        await page.goto('/login')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

        // Aviso simplificado (HU-S15-04) y footer (HU-S15-03).
        const notice = page.getByText(/trata tus datos para administrar tu cuenta/)
        await expect(notice).toBeVisible()
        const footer = page.getByRole('contentinfo')
        await expect(footer).toBeVisible()
        for (const link of await footer.getByRole('link').all()) {
          const box = await link.boundingBox()
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        }
        await expectNoHorizontalOverflow(page)

        await notice.getByRole('link', { name: 'Aviso de Privacidad' }).click()
        await expect(page).toHaveURL(/\/legal\/privacidad$/)
        await expect(page.getByRole('heading', { level: 2, name: 'Aviso de Privacidad Integral' })).toBeVisible()
        await expect(page.getByRole('region', { name: 'De un vistazo' })).toBeVisible()
        await expect(page.getByText(/INAI/)).toHaveCount(0)
        await expectNoHorizontalOverflow(page)

        if (viewport.width >= 960) {
          // Índice fijo bajo la barra al desplazarse.
          const toc = page.getByRole('navigation', { name: 'En esta página' })
          await expect(toc).toBeVisible()
          await page.mouse.wheel(0, 2400)
          await expect.poll(async () => (await toc.boundingBox())?.y ?? -1).toBeGreaterThan(0)
          const barHeight = await page.getByRole('banner').evaluate((bar) => bar.getBoundingClientRect().bottom)
          expect((await toc.boundingBox())!.y).toBeGreaterThanOrEqual(barHeight)
          await toc.getByRole('link', { name: 'Derechos ARCO y revocación' }).click()
          await expect(page.getByRole('heading', { name: 'Derechos ARCO y revocación' })).toBeInViewport()
        } else {
          // Índice colapsable en pantallas estrechas.
          const summary = page.getByText('En esta página', { exact: true })
          await summary.click()
          const toc = page.getByRole('navigation', { name: 'En esta página' })
          await expect(toc).toBeVisible()
          await toc.getByRole('link', { name: 'Medidas de seguridad' }).click()
          await expect(toc).toBeHidden()
          await expect(page.getByRole('heading', { name: 'Medidas de seguridad' })).toBeInViewport()
        }

        const switcher = page.getByRole('navigation', { name: 'Documentos legales' })
        await switcher.getByRole('link', { name: 'Términos y Condiciones' }).click()
        await expect(page.getByRole('heading', { level: 2, name: 'Términos y Condiciones' })).toBeVisible()
        await switcher.getByRole('link', { name: 'Cookies' }).click()
        await expect(page.getByRole('heading', { level: 2, name: 'Cookies y tecnologías técnicas' })).toBeVisible()
        await expect(page.getByRole('table', { name: 'Cookies y almacenamiento del navegador' })).toContainText('banco-de-talentos-session')
        await expectNoHorizontalOverflow(page)

        await page.getByRole('link', { name: 'Volver al inicio de sesión' }).click()
        await expect(page).toHaveURL(/\/login$/)
        await expect(page.getByRole('heading', { level: 2, name: 'Iniciar sesión' })).toBeVisible()
      })
    })

    test.describe(`con sesión de empresa, ${viewport.name}, tema ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
      test.use({ storageState: COMPANY_STATE, viewport: { width: viewport.width, height: viewport.height } })

      test('footer en el inicio, sin footer en el feed y la conversación, y regreso desde los términos', async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('bt-theme', value), theme)
        await page.goto('/')
        await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()
        const footer = page.getByRole('contentinfo')
        await expect(footer).toBeVisible()
        await expectNoHorizontalOverflow(page)

        await footer.getByRole('link', { name: 'Términos y Condiciones' }).click()
        await expect(page.getByRole('heading', { level: 2, name: 'Términos y Condiciones' })).toBeVisible()
        await expect(page.getByRole('button', { name: /^Cuenta de / })).toBeVisible()
        await expectNoHorizontalOverflow(page)
        await page.getByRole('link', { name: 'Volver', exact: true }).click()
        await expect(page.getByRole('heading', { level: 2, name: /^Hola, / })).toBeVisible()

        await page.goto('/promocion')
        await expect(page.getByRole('heading', { level: 2, name: 'Historias del Dual' })).toBeVisible()
        await expect(page.getByRole('contentinfo')).toHaveCount(0)

        await page.goto('/linkage-requests/999999/chat')
        await expect(page.getByRole('contentinfo')).toHaveCount(0)
      })
    })
  }
}
