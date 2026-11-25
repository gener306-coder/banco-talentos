# Tokens de marca y CSP

[Índice de la documentación técnica](../README.md)

## Identidad visual y tokens

La paleta oficial está en [identidad-visual.md](../../design/identidad-visual.md) y se declara una sola vez en el bloque `@theme` de `frontend/src/index.css`:

| Token de marca | Valor | Uso |
|---|---|---|
| `--color-brand-primary` | `#991B30` (vino) | Acciones primarias, enlaces y títulos |
| `--color-brand-primary-hover` | `#7A1626` | Estado *hover* del vino |
| `--color-brand-secondary` | `#B99058` (dorado) | **Solo decorativo**: bordes, separadores y detalles. Nunca texto. |
| `--color-brand-neutral` | `#57565B` (gris grafito) | Texto y elementos neutros |

**Las vistas nunca usan estos valores directamente.** Usan **tokens semánticos**, definidos dos veces con los mismos nombres:
- en `:root` (tema claro);
- en `:root[data-theme='dark']` (tema oscuro).

| Familia | Tokens |
|---|---|
| Superficies | `--surface`, `--surface-muted`, `--tint`, `--fill`, `--inverse-surface`, `--media-backdrop` |
| Texto | `--text`, `--text-strong`, `--text-muted`, `--ink`, `--on-accent`, `--on-danger`, `--on-inverse`, `--on-media` |
| Acento | `--accent`, `--accent-hover`, `--accent-fill`, `--accent-fill-hover`, `--accent-secondary`, `--accent-secondary-text` |
| Bordes y foco | `--border`, `--border-strong`, `--focus-ring` |
| Estados | `--danger-*`, `--success-*`, `--status-off-*` |
| Escala tipográfica | `--type-xs` a `--type-2xl` |
| Retícula | `--page-wide` (70 rem, vistas anchas por defecto) y `--content-readable` (45 rem, formularios y detalles) |

### Reglas que se verifican automáticamente

`src/ui/tokens.test.ts` (Vitest) comprueba:
- **Mismos tokens en ambos temas.** El tema oscuro redefine exactamente los mismos tokens que el claro.
- **Contraste de al menos 4.5:1**, en ambos temas, para cada par de texto y fondo: cuerpo, títulos, acento, texto sobre el botón vino, avisos de error y de éxito, estado inactivo, texto sobre video y texto sobre superficies teñidas o con opacidad.
- **Al menos 3:1** entre el filete vino aclarado y el fondo oscuro.
- **Los títulos (`--ink`)** nunca tienen menos contraste que el cuerpo.
- **Nada fuera de las reglas:**
  - ninguna vista fija colores de marca con utilidades de Tailwind (`text-brand-*`, `bg-*`), que ignorarían el tema oscuro;
  - todas las reglas viven en una capa `@layer`;
  - los `:hover` están dentro de `@media (hover: hover)`;
  - los tamaños de letra usan la escala `--type-*`.

**Capas.** `layers.css` fija el orden `theme, base, legacy, components, utilities`. Tailwind 4 se usa sin Preflight, solo para utilidades de disposición, y el CSS existente vive en `legacy` y `components`.

**Tema.** `public/theme-init.js` aplica el tema antes del primer pintado. `ui/theme.ts` lo mantiene al día:
- guarda la preferencia (`bt-theme`: claro, oscuro o sistema);
- sigue los cambios del sistema y de otras pestañas;
- actualiza `<meta name="theme-color">`.

## Content-Security-Policy

Caddy envía la CSP en las respuestas de la SPA (`infra/packer/files/caddy/Caddyfile`):

```text
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: blob: {$S3_ORIGIN}; media-src 'self' blob: {$S3_ORIGIN};
connect-src 'self'; worker-src 'self'; font-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

`bt-boot.sh` arma `S3_ORIGIN` a partir del bucket y la región de SSM, con dos orígenes: `https://<bucket>.s3.amazonaws.com` y `https://<bucket>.s3.us-east-2.amazonaws.com`. El SDK firma con el regional fuera de `us-east-1`.

### Contraste con los recursos reales de la SPA

| Directiva | Qué carga la SPA | Resultado |
|---|---|---|
| `script-src 'self'` | El `dist/index.html` compilado solo tiene `<script src="/theme-init.js">` y el módulo `/assets/index-*.js`. No hay scripts en línea, `eval` ni CDNs. | Compatible. Por eso el script de tema salió del HTML (T-S17-03). |
| `style-src 'self'` | Una hoja `/assets/index-*.css`. No hay `<style>` en línea. Las 10 propiedades `style={{…}}` de React y `element.animate()` se aplican por CSSOM, que la CSP no bloquea. | Compatible |
| `img-src 'self' data: blob: S3` | Logotipos y favicons propios, y pósteres con URL prefirmada del bucket. Hoy ninguna imagen usa `blob:`: queda admitido por margen. Las descargas de CSV y PDF usan un enlace `blob:` con `download`; eso es navegación, no carga de imagen. | Compatible |
| `media-src 'self' blob: S3` | `<video>` con el MP4 o WebM prefirmado del bucket, sin `crossorigin`, así que el bucket no necesita CORS. `blob:` para la vista previa local del video antes de subirlo (`VideoDropzone`). | Compatible |
| `connect-src 'self'` | `fetch` solo a `/api`, `/sanctum` y `/up` del mismo origen. Los medios no se piden con `fetch`. | Compatible |
| `worker-src 'self'` | `/notifications-sw.js`, el *service worker* de los avisos | Compatible |
| `font-src 'self'` | No hay fuentes web: se usa `system-ui` | Compatible |
| `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` | Sin `<object>`, `<base>` ni formularios hacia otro origen. La aplicación no se puede incrustar. | Compatible |

Los enlaces externos (Gmail y Outlook del `EmailMenu`, enlaces de la ficha compartida, documentos legales) son navegación con `target="_blank"` y `rel="noopener noreferrer"`. La CSP no los restringe.

### Otras cabeceras de la SPA y de la API

| Cabecera | Valor | Dónde |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Caddy, en todo el sitio |
| `X-Content-Type-Options` | `nosniff` | Caddy y `ApiSecurityHeaders` |
| `Referrer-Policy` | `no-referrer` | Caddy, `ApiSecurityHeaders` y `<meta name="referrer">` |
| `X-Frame-Options` | `DENY` | Caddy y `ApiSecurityHeaders` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Caddy |
| `Server` | Se elimina | Caddy |
| `Cache-Control` | `public, max-age=31536000, immutable` en `/assets/*` (nombres con hash); `no-cache` en `index.html`, `theme-init.js` y `notifications-sw.js` | Caddy |

### Cómo se verifica

- **En cada despliegue**, `infra/scripts/smoke.sh` exige:
  - HSTS exacto;
  - una CSP con `script-src 'self';` y `frame-ancestors 'none'`;
  - `nosniff` y `no-referrer`;
  - que no salga la cabecera `Server`;
  - `401` con `no-store` en `/api/me` sin sesión;
  - la redirección de HTTP a HTTPS.
- **En el piloto**, la validación funcional confirmó la reproducción de videos y pósteres firmados desde el bucket (runbook).
- **Limitación:** en local y en las pruebas E2E la SPA corre con el servidor de Vite, que no envía la CSP. Un recurso nuevo que la viole solo aparece en el piloto. Al agregar un origen externo hay que actualizar el `Caddyfile` y repetir la validación.

## Fuentes en el repositorio

- `frontend/src/index.css`, `frontend/src/layers.css`, `frontend/src/ui/ui.css`, `frontend/src/ui/tokens.test.ts`, `frontend/src/ui/theme.ts`
- `frontend/public/theme-init.js`, `frontend/index.html`
- `frontend/src/videos/VideoPlayer.tsx`, `frontend/src/videos/VideoDropzone.tsx`, `frontend/src/lib/download.ts`
- `infra/packer/files/caddy/Caddyfile`, `infra/packer/files/sbin/bt-boot.sh` (`S3_ORIGIN`)
- `backend/app/Http/Middleware/ApiSecurityHeaders.php`
- `infra/scripts/smoke.sh`, `docs/infra/runbook-pilot.md`
- `docs/design/identidad-visual.md`, `docs/infra/pilot-aws-plan.md` §1.3
