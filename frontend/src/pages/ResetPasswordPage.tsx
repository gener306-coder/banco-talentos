import { resetPassword } from '../auth/api'
import { NewPasswordForm } from './NewPasswordForm'

export function ResetPasswordPage() {
  return (
    <NewPasswordForm
      path="/reset-password"
      title="Restablecer contraseña"
      intro="Establece una nueva contraseña para tu cuenta institucional. Las sesiones abiertas con la contraseña anterior se cerrarán."
      submitLabel="Restablecer contraseña"
      pendingLabel="Restableciendo contraseña…"
      successMessage="Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña."
      invalidLinkMessage="El enlace de restablecimiento no es válido, ha caducado o ya fue utilizado."
      invalidLinkHelp="Solicita a administración un nuevo restablecimiento de contraseña."
      failureMessage="No pudimos restablecer la contraseña. Inténtalo de nuevo."
      submit={resetPassword}
    />
  )
}
