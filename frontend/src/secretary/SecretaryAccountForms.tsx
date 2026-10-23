import { SetupAccountForm, SetupLinkResendForm } from '../accounts/SetupAccountForms'
import { createSecretaryAccount, resendSecretaryAccountSetup, secretaryMessages } from './api'

/** Alta de una cuenta SECRETARY (HU-S4-01 CA-01, CA-03): nombre, correo y entrega del enlace. */
export function SecretaryAccountForm({ onCreated }: { onCreated: () => void }) {
  return (
    <SetupAccountForm idPrefix="secretary-account" title="Nueva cuenta de la Secretaría" submitLabel="Crear cuenta de la Secretaría"
      intro="La persona titular establecerá su propia contraseña mediante un enlace de configuración. Nadie más la define ni la ve."
      messages={secretaryMessages} create={createSecretaryAccount} onCreated={onCreated} />
  )
}

/** Reenvío del enlace de una cuenta SECRETARY pendiente (HU-S4-01 CA-04). */
export function SecretarySetupLinkForm({ initialEmail = '' }: { initialEmail?: string }) {
  return (
    <SetupLinkResendForm idPrefix="secretary-setup-link" initialEmail={initialEmail} messages={secretaryMessages}
      intro="Mientras la cuenta siga pendiente de su primera contraseña puedes reenviar el enlace. El nuevo enlace sustituye al anterior."
      resend={resendSecretaryAccountSetup} />
  )
}
