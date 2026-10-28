import { randomBytes } from 'node:crypto'
import { expect, test as setup } from '@playwright/test'
import { ADMIN_STATE } from './support/admin'
import { SECRETARY_STATE, createSecretaryAccount, signInWithSetupLink } from './support/secretary'

setup('SECRETARY crea cuenta e inicia sesión una vez para los demás escenarios', async ({ browser, baseURL }) => {
  const adminContext = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const adminPage = await adminContext.newPage()
  const suffix = randomBytes(8).toString('hex')
  const email = `se-e2e-${suffix}@example.test`

  let link: string
  try {
    await adminPage.goto('/secretary-accounts')
    link = await createSecretaryAccount(adminPage, { name: `Secretaría E2E ${suffix}`, email })
  } finally {
    await adminContext.close()
  }

  const { context: secretaryContext, page: secretaryPage } = await signInWithSetupLink(browser, baseURL, link, email)
  try {
    await expect(secretaryPage.getByText('Secretaría de Economía', { exact: true })).toBeVisible()
    await secretaryPage.context().storageState({ path: SECRETARY_STATE })
  } finally {
    await secretaryContext.close()
  }
})
