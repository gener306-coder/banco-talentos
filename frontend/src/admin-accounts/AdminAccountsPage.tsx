import { RoleAccountsPage } from '../accounts/RoleAccountsPage'
import type { RoleAccountsConfig } from '../accounts/RoleAccountsPage'
import { SetupAccountForm, SetupLinkResendForm } from '../accounts/SetupAccountForms'
import { ADMIN_PASSWORD_RESET_PATH, adminAccountMessages, adminAccountStatusPath, createAdminAccount, listAdminAccounts, resendAdminAccountSetup } from './api'

/**
 * Cuentas de Administración (HU-S16-02): un ADMIN invita a otros por correo o con un enlace manual, los inactiva o
 * reactiva e inicia su restablecimiento. Nadie se inactiva a sí mismo y el servidor impide dejar la plataforma sin un
 * Administrador activo (422, que se muestra en el aviso de la acción).
 */
const config: RoleAccountsConfig = {
  id: 'admin-accounts',
  title: 'Cuentas de Administración',
  noun: 'de Administración',
  intro: 'Personas que gestionan las instituciones, sus cuentas y las cuentas de la Secretaría. Siempre debe quedar al menos un Administrador activo.',
  createLabel: 'Nueva cuenta de Administración',
  messages: adminAccountMessages,
  list: listAdminAccounts,
  statusPath: adminAccountStatusPath,
  resetPath: ADMIN_PASSWORD_RESET_PATH,
  createForm: (onCreated) => (
    <SetupAccountForm idPrefix="admin-account" title="Nueva cuenta de Administración" submitLabel="Crear cuenta de Administración"
      intro="La persona titular establecerá su propia contraseña mediante un enlace de configuración. Nadie más la define ni la ve."
      messages={adminAccountMessages} create={createAdminAccount} onCreated={onCreated} />
  ),
  resendForm: (initialEmail) => (
    <SetupLinkResendForm idPrefix="admin-setup-link" initialEmail={initialEmail} messages={adminAccountMessages}
      intro="Mientras la cuenta siga pendiente de su primera contraseña puedes reenviar el enlace. El nuevo enlace sustituye al anterior."
      resend={resendAdminAccountSetup} />
  ),
  createTitleId: 'admin-account-title',
  resendTitleId: 'admin-setup-link-title',
}

export function AdminAccountsPage() {
  return <RoleAccountsPage config={config} />
}
