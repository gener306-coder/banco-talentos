import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { ADMIN_STATE, NO_SESSION } from './support/admin'
import { COMPANY_STATE } from './support/company'
import { INSTITUTION_STATE } from './support/institution'
import { SECRETARY_STATE } from './support/secretary'

/*
 * Auditoría QA previa a producción: recorrido de las vistas clave de los 4 roles y del visitante, a 1440 y 390 px, en
 * claro y oscuro. Falla ante cualquier console.error o advertencia de React, excepción no capturada, petición fallida
 * no intencional (>= 400) o desborde horizontal.
 */

interface Audience {
  name: string
  storageState: string | typeof NO_SESSION.storageState
  routes: readonly string[]
  /** Respuestas de error esperadas por diseño (por ejemplo, el 401 de /api/me sin sesión). */
  expected?: readonly RegExp[]
}

const AUDIENCES: readonly Audience[] = [
  {
    name: 'visitante', storageState: NO_SESSION.storageState,
    routes: ['/login', '/legal/privacidad', '/legal/terminos', '/legal/cookies', '/reset-password?email=qa%40example.test&token=x'],
    expected: [/\/api\/me$/],
  },
  { name: 'ADMIN', storageState: ADMIN_STATE, routes: ['/', '/institutions', '/institutions/new', '/secretary-accounts', '/reports', '/audit-events', '/promocion', '/account'] },
  { name: 'SECRETARY', storageState: SECRETARY_STATE, routes: ['/', '/companies', '/companies/new', '/secretary-accounts', '/reports', '/promocion', '/account'] },
  { name: 'INSTITUTION', storageState: INSTITUTION_STATE, routes: ['/', '/students', '/institution/linkage-requests', '/institution/videos', '/promocion', '/account'] },
  { name: 'COMPANY', storageState: COMPANY_STATE, routes: ['/', '/talent', '/opportunities', '/opportunities/new', '/linkage-requests', '/promocion', '/account', '/legal/privacidad'] },
]

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const
const THEMES = ['light', 'dark'] as const

/** Registra los problemas del navegador mientras dura el recorrido. */
function watch(page: Page, expected: readonly RegExp[], where: () => string) {
  const problems: string[] = []
  const add = (problem: string) => problems.push(`${where()}: ${problem}`)
  page.on('console', (message) => {
    const text = message.text()
    // El cliente de Vite anuncia su conexión con console.debug; los avisos de red ya se cubren con las respuestas.
    if (message.type() === 'error' && !/Failed to load resource/.test(text)) add(`console.error: ${text}`)
    if (message.type() === 'warning' && !/\[vite\]/.test(text)) add(`console.warn: ${text}`)
  })
  page.on('pageerror', (error) => add(`pageerror: ${error.message}`))
  page.on('response', (response: Response) => {
    const { pathname } = new URL(response.url())
    if (response.status() >= 400 && !expected.some((pattern) => pattern.test(pathname))) {
      add(`HTTP ${response.status()} ${response.request().method()} ${pathname}`)
    }
  })
  return problems
}

for (const audience of AUDIENCES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test.describe(`${audience.name}, ${viewport.width} px, ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
        test.use({ storageState: audience.storageState, viewport })

        test('sin errores de consola, peticiones fallidas ni desbordes', async ({ page }) => {
          test.setTimeout(120_000)
          await page.addInitScript((value) => localStorage.setItem('bt-theme', value), theme)
          let current = ''
          const problems = watch(page, audience.expected ?? [], () => current)

          for (const route of audience.routes) {
            current = route
            await page.goto(route)
            await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
            await page.waitForLoadState('networkidle')
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
            // Como texto: la configuración de las E2E no incluye los tipos del DOM.
            const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
            if (overflow > 0) problems.push(`${route}: desborde de ${overflow} px`)
          }

          expect(problems).toEqual([])
        })
      })
    }
  }
}
