# Frontend: arquitectura de la SPA

[Índice de la documentación técnica](../README.md)

El frontend es una SPA en React 19 y TypeScript 5.9, compilada con Vite 8. No hay renderizado en el servidor: Caddy sirve los archivos estáticos de `frontend/dist`, y cualquier ruta desconocida recibe `index.html` (`try_files {path} /index.html`). Solo hay tres dependencias de ejecución: `react`, `react-dom` y `react-router`. No se usan librerías de estado, de formularios ni de componentes.

## Arranque

1. **`index.html`.**
   - Carga `/theme-init.js`, un script clásico y síncrono que fija `data-theme` antes del primer pintado para evitar un destello.
   - Ese script está fuera del HTML para que la CSP admita solo `script-src 'self'` (T-S17-03).
   - El HTML declara `<meta name="referrer" content="no-referrer">`.
2. **`src/main.tsx`.**
   - Importa `layers.css` antes que cualquier hoja: fija el orden de capas `theme, base, legacy, components, utilities`.
   - Después importa `index.css` (tokens) y `ui/ui.css`.
   - Llama a `watchTheme()` y monta `<App />` dentro de `BrowserRouter` y `StrictMode`.
3. **`App.tsx`.** Pinta el armazón (encabezado con el logotipo, el coemblema de la Secretaría, los mensajes y el menú de cuenta, y el pie con los enlaces legales) y resuelve las rutas.

## Enrutamiento

React Router 7, en modo declarativo (`<Routes>`):

| Grupo | Rutas | Sesión |
|---|---|---|
| Enlaces de contraseña | `/set-initial-password`, `/reset-password`, `/forgot-password` | Sin sesión y fuera del proveedor de sesión |
| Públicas dentro del proveedor | `/confirm-email`, `/legal/:document` | Con o sin sesión. Con sesión, la barra muestra los menús. |
| Acceso | `/login` | — |
| Protegidas | `/` (inicio por rol), `/account`, `/welcome` y las de cada rol (`/institutions`, `/companies`, `/students`, `/talent`, `/opportunities`, `/linkage-requests`, `/institution/linkage-requests`, `/institution/videos`, `/promocion`, `/reports`, `/audit-events`, `/admin-accounts`, `/secretary-accounts`) | `ProtectedRoute` |

`ProtectedRoute`:
- sin sesión, redirige a `/login`;
- con un rol no admitido, muestra «Acceso denegado» con un mensaje propio de la vista.

**Es solo una guía de navegación.** La autorización real es la del backend ([matriz de permisos](../02-dominio-y-proceso/02-matriz-de-permisos.md)).

**Detalles de navegación:**
- `/confirm-email` (T-S19-03 y T-S19-04) confirma el token una sola vez al abrirse, también bajo el doble efecto de `StrictMode`, y lo quita de la URL de inmediato.
- Las transiciones entre vistas animan el contenedor según la profundidad de la ruta y respetan `prefers-reduced-motion`.
- Cada vista nueva empieza arriba.
- `RouteErrorBoundary` evita una pantalla en blanco ante un error inesperado.

## Sesión y cliente HTTP

- **Sesión con cookie de Sanctum.** `AuthProvider` carga la cuenta con `GET /api/me` al iniciar.
  - Antes de iniciar sesión, y antes de una escritura si falta el token, se pide `GET /sanctum/csrf-cookie`.
  - `lib/http.ts` envía el token como `X-XSRF-TOKEN` en cada `POST`, `PUT` o `PATCH`, con `credentials: 'include'` y `referrerPolicy: 'origin'`.
- **Errores tipados.** `request()` y `requestBlob()` convierten cualquier fallo en `ApiError`:

  | Valor | Significado |
  |---|---|
  | `status` | Código HTTP, o `0` si no hubo conexión |
  | `errors` | Errores de validación por campo |
  | `code` | Códigos de acceso: `COMPANY_INACTIVE`, `PASSWORD_SETUP_REQUIRED`… |
  | `profileIncomplete` | `true` ante `COMPANY_PROFILE_INCOMPLETE` o `INSTITUTION_PROFILE_INCOMPLETE` |
- **Validación del contrato.** Cada módulo tiene su `api.ts` (`students`, `linkage`, `talent`, `videos`…), que **valida la forma de cada respuesta** antes de entregarla a la vista. Una respuesta inesperada se trata como `ApiError(502)` y no se pinta. Hay 125 de estas comprobaciones en el código.
- **Descargas** (CSV, comprobante PDF): `requestBlob()` y un enlace temporal `blob:`.
- **En desarrollo**, Vite reenvía `/api`, `/sanctum` y `/up` al backend (`API_PROXY_TARGET`), así que la SPA y la API comparten origen igual que en producción.

## Tiempo casi real sin WebSockets

Los mensajes sin leer se consultan por sondeo con `GET …/unread-summary`:
- cada **10 s** con la pestaña visible;
- cada **60 s** en segundo plano.

`MessagesMenu` y `UnreadSummaryProvider` comparten un solo resumen para toda la aplicación, y las pestañas abiertas de la misma cuenta lo intercambian por `BroadcastChannel` (`bt-unread`).

Las notificaciones del navegador usan un *service worker* mínimo (`public/notifications-sw.js`, T-S13-08):
- solo muestra el aviso y, al hacer clic, enfoca o abre la conversación;
- no intercepta `fetch` ni cachea nada.

## Organización del código

Un directorio por dominio, cada uno con sus páginas, su `api.ts` y sus pruebas:

| Grupo | Carpetas |
|---|---|
| Dominios | `auth`, `account`, `onboarding`, `accounts`, `admin-accounts`, `institutions`, `secretary`, `companies`, `students`, `talent`, `opportunities`, `linkage`, `dashboard`, `reports`, `audit`, `videos`, `legal` |
| Transversal | `ui` (componentes, hooks y tokens), `lib` (HTTP y descargas), `pages` (acceso y confirmaciones), `test` (configuración de Vitest) |

## Ficha compartida en la interfaz (Sprint 19)

| Lado | Componente | Comportamiento |
|---|---|---|
| Institución | `linkage/StudentDisclosureSection.tsx`, en el detalle de la solicitud | Pendiente: una nota de que podrá compartirse tras aceptar. Aceptada sin compartir: «Ficha privada» y «Compartir ficha con la empresa» (grupos y consentimiento en un `Sheet`). Compartida: fecha y «Dejar de compartir» con `ConfirmDialog`. En los demás estados no muestra nada. |
| Empresa | `linkage/SharedProfileSection.tsx`, en el detalle de la vinculación | Muestra la fecha y los grupos compartidos: nombre, enlaces con `target="_blank"` y `rel="noopener noreferrer"`, y credenciales. Si no hay ficha, muestra «Ficha profesional no disponible». |
| Ambos | `linkage/disclosureApi.ts` | Llamadas y validación del contrato. Los nombres de los grupos vienen de `disclosureFieldLabels`. |

## Fuentes en el repositorio

- `frontend/index.html`, `frontend/public/theme-init.js`, `frontend/public/notifications-sw.js`
- `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/layers.css`
- `frontend/src/auth/` (`AuthProvider.tsx`, `ProtectedRoute.tsx`, `api.ts`)
- `frontend/src/lib/http.ts`, `frontend/src/lib/download.ts`
- `frontend/src/pages/ConfirmEmailPage.tsx`
- `frontend/src/linkage/` (`StudentDisclosureSection.tsx`, `SharedProfileSection.tsx`, `disclosureApi.ts`, `unreadTransport.ts`, `browserNotifications.ts`)
- `frontend/vite.config.ts`, `frontend/package.json`
- `infra/packer/files/caddy/Caddyfile`
