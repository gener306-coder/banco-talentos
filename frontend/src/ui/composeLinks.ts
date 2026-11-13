/**
 * Destinos para redactar un correo (T-S12-06): webmails comunes y la app del sistema. El correo va codificado en los
 * enlaces web; en mailto: se deja tal cual, como lo esperan los clientes de correo.
 */
export function composeLinks(email: string) {
  const to = encodeURIComponent(email)
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${to}`,
    system: `mailto:${email}`,
  }
}
