import { CHANNEL } from '../linkage/unreadTransport'
import { DISMISSED_KEY } from '../linkage/NotificationPrompt'
import { DRAFT_KEY_PREFIX } from '../linkage/LinkageConversation'
import { NOTIFICATIONS_WORKER } from '../linkage/browserNotifications'
import { THEME_STORAGE_KEY } from '../ui/theme'
import { STORAGE_KEY as TABLE_MEMORY_KEY } from '../ui/useTableMemory'

/**
 * HU-S15-02: inventario verificable de las tecnologías que la plataforma usa en el navegador. Los nombres salen de las
 * constantes reales del código; `technologies.test.ts` falla si un archivo usa almacenamiento del navegador,
 * `BroadcastChannel`, service workers o `document.cookie` y no está declarado aquí.
 *
 * Todas son estrictamente técnicas: no hay cookies publicitarias, analítica ni rastreadores de terceros.
 */

/**
 * Nombre de la cookie de sesión de Laravel: `SESSION_COOKIE`, o el nombre de la aplicación en minúsculas con guiones
 * más `-session` (backend/config/session.php). Si se cambia en el entorno, se actualiza aquí.
 */
export const SESSION_COOKIE = 'banco-de-talentos-session'
export const CSRF_COOKIE = 'XSRF-TOKEN'

export type TechnologyKind = 'Cookie' | 'localStorage' | 'sessionStorage' | 'BroadcastChannel' | 'Service worker'

export interface BrowserTechnology {
  name: string
  kind: TechnologyKind
  purpose: string
  duration: string
  /** Archivos del frontend (relativos a frontend/) que la usan. */
  files: readonly string[]
}

export const browserTechnologies: readonly BrowserTechnology[] = [
  {
    name: SESSION_COOKIE,
    kind: 'Cookie',
    purpose: 'Mantiene tu sesión iniciada. No la puede leer el código de la página (HttpOnly) y solo se envía a la propia plataforma (SameSite=Lax).',
    duration: '120 minutos sin actividad, o hasta cerrar sesión.',
    files: [],
  },
  {
    name: CSRF_COOKIE,
    kind: 'Cookie',
    purpose: 'Protege los formularios contra peticiones falsificadas desde otros sitios (CSRF). La página la lee para firmar cada envío.',
    duration: 'La misma que la sesión.',
    files: ['src/lib/http.ts'],
  },
  {
    name: THEME_STORAGE_KEY,
    kind: 'localStorage',
    purpose: 'Recuerda el tema que elegiste: claro, oscuro o el del sistema.',
    duration: 'Hasta que cambies el tema o borres los datos del sitio.',
    files: ['src/ui/theme.ts', 'index.html'],
  },
  {
    name: DISMISSED_KEY,
    kind: 'localStorage',
    purpose: 'Recuerda que descartaste la invitación a activar los avisos del navegador.',
    duration: 'Hasta que borres los datos del sitio.',
    files: ['src/linkage/NotificationPrompt.tsx'],
  },
  {
    name: TABLE_MEMORY_KEY,
    kind: 'sessionStorage',
    purpose: 'Al regresar a un listado, recupera la fila y la posición en la que estabas.',
    duration: 'Solo esta pestaña; se consume al volver y caduca a los 30 minutos.',
    files: ['src/ui/useTableMemory.ts'],
  },
  {
    name: `${DRAFT_KEY_PREFIX}:…`,
    kind: 'sessionStorage',
    purpose: 'Conserva el borrador de un mensaje mientras consultas el perfil, la oportunidad o la solicitud. No sale de tu navegador.',
    duration: 'Solo esta pestaña; se borra al enviar el mensaje o al cerrar la pestaña.',
    files: ['src/linkage/LinkageConversation.tsx'],
  },
  {
    name: CHANNEL,
    kind: 'BroadcastChannel',
    purpose: 'Comparte entre tus pestañas abiertas el número de mensajes sin leer, para no consultarlo una vez por pestaña. No guarda nada.',
    duration: 'Mientras las pestañas estén abiertas.',
    files: ['src/linkage/unreadTransport.ts'],
  },
  {
    name: NOTIFICATIONS_WORKER,
    kind: 'Service worker',
    purpose: 'Muestra los avisos del navegador de mensajes nuevos, si los activaste, y abre la conversación al tocarlos. No guarda páginas en caché ni recibe notificaciones push.',
    duration: 'Hasta que borres los datos del sitio.',
    files: ['src/linkage/browserNotifications.ts', 'src/linkage/LinkageNotifier.tsx'],
  },
]
