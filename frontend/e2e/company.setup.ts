import { randomBytes } from 'node:crypto'
import { expect, test as setup } from '@playwright/test'
import { SECRETARY_STATE, signInWithSetupLink } from './support/secretary'
import { COMPANY_STATE, createCompanyAccount, registerCompany } from './support/company'

setup('COMPANY registra empresa y crea cuenta para los demás escenarios', async ({ browser, baseURL }) => {
  const secretaryContext = await browser.newContext({ baseURL, storageState: SECRETARY_STATE })
  const secretaryPage = await secretaryContext.newPage()
  const suffix = randomBytes(6).toString('hex')
  const email = `empresa-e2e-${suffix}@example.test`

  let link: string
  let legalName: string
  try {
    const registered = await registerCompany(secretaryPage, {
      legalName: `Empresa E2E ${suffix}, S.A. de C.V.`,
      state: 'Tamaulipas',
      municipalityQuery: 'reynosa',
      municipalityOption: 'Reynosa',
    })
    legalName = registered.legalName
    link = await createCompanyAccount(secretaryPage, {
      name: `Titular E2E ${suffix}`,
      email,
    })
  } finally {
    await secretaryContext.close()
  }

  const { context: companyContext, page: companyPage } = await signInWithSetupLink(browser, baseURL, link, email)
  try {
    await expect(companyPage.getByText(legalName, { exact: true })).toBeVisible()
    await expect(companyPage.getByText('Empresa', { exact: true })).toBeVisible()
    await companyPage.context().storageState({ path: COMPANY_STATE })
  } finally {
    await companyContext.close()
  }
})
