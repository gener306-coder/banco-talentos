import { RoleAccountsPage } from '../accounts/RoleAccountsPage'
import type { RoleAccountsConfig } from '../accounts/RoleAccountsPage'
import { listSecretaryAccounts, SECRETARY_PASSWORD_RESET_PATH, secretaryAccountStatusPath, secretaryMessages } from './api'
import { SecretaryAccountForm, SecretarySetupLinkForm } from './SecretaryAccountForms'

/**
 * Cuentas de la Secretaría de Economía (HU-S4-01 CA-05, CA-08; HU-S6-04 CA-04), disponibles para ADMIN y SECRETARY. Desde
 * HU-S16-02 comparten la página con las cuentas de Administración (`RoleAccountsPage`).
 */
const config: RoleAccountsConfig = {
  id: 'secretary-accounts',
  title: 'Cuentas de la Secretaría',
  noun: 'de la Secretaría',
  intro: 'Personal de la Secretaría de Economía que valida y registra a las empresas.',
  createLabel: 'Nueva cuenta de la Secretaría',
  messages: secretaryMessages,
  list: listSecretaryAccounts,
  statusPath: secretaryAccountStatusPath,
  resetPath: SECRETARY_PASSWORD_RESET_PATH,
  createForm: (onCreated) => <SecretaryAccountForm onCreated={onCreated} />,
  resendForm: (initialEmail) => <SecretarySetupLinkForm initialEmail={initialEmail} />,
  createTitleId: 'secretary-account-title',
  resendTitleId: 'secretary-setup-link-title',
}

export function SecretaryAccountsPage() {
  return <RoleAccountsPage config={config} />
}
