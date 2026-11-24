# Sprint 18 — Afinaciones de interfaz y correos con marca

Sprint vigente desde el 24 de noviembre de 2026. Sprint anterior: [sprint-17.md](sprint-17.md) (histórico).

**Objetivo del Sprint:** pulir lo que el piloto en AWS dejó a la vista:
- un campo de contraseña único con mostrar u ocultar;
- el correo de la empresa en la bandeja de la institución;
- el favicon y los logotipos legibles al 100 % de zoom;
- correos con la identidad de la plataforma y en español.

**Ramas y PRs:**
- **PR 1 (interfaz):** `feat/s18-ui-polish`, con T-S18-01 a T-S18-04.
- **PR 2 (correos):** T-S18-05, después del PR 1.

**Despliegue:** ninguno durante el Sprint. Al fusionar ambos PRs se hace un solo **Build AMI** y **Deploy pilot** ([runbook](infra/runbook-pilot.md)).

## Decisiones del responsable (24 de noviembre de 2026)

Diagnóstico de solo lectura del 24 de noviembre de 2026.

- **D1. Formularios de perfil fuera de alcance.** Ya permiten guardar en parcial: `UpdateOrganizationProfileRequest` es `nullable` en todo, y el formulario solo valida formato. El responsable lo confirmó en el piloto.
- **D2. Favicon a color, sin variante clara/oscura:**
  - se recorta el isotipo completo, sin las letras «nodologístico», de `public/brand/logo.png`;
  - la misma versión a color se usa en todas las pestañas; se acepta que la órbita horizontal se distinga menos en modo oscuro;
  - formatos: `favicon.ico` multitamaño, `favicon.png` y `apple-touch-icon.png` de 180 px.
- **D3. Logotipos ~25 % más grandes al 100 % de zoom.** El tamaño actual se validó al 125 %. Se ajustan la altura y el espaciado del encabezado sin amontonar la navegación en escritorio ni romper la vista móvil.
- **D4. Logo de los correos por URL pública:** `<APP_URL>/brand/logo-correo.png`, servido por Caddy desde la SPA. No se usan imágenes incrustadas (CID) ni SVG, que Gmail no muestra.

## Fuera de alcance

- Cambios a los formularios de perfil y al expediente del alumno (D1).
- Variante adaptable del favicon y manifiesto de aplicación web (PWA).
- Despliegue en AWS durante el Sprint.

---

## Tareas técnicas

### T-S18-01 — Campo de contraseña compartido con mostrar u ocultar

**Estado:** Completada (24 de noviembre de 2026).

**Hallazgo:**
- El inicio de sesión (`LoginPage`) tiene el botón de mostrar u ocultar escrito en línea, y Mi cuenta (`AccountPage`) lo tiene en un `PasswordField` local.
- `NewPasswordForm`, que usan la contraseña inicial (`SetInitialPasswordPage`) y el restablecimiento (`ResetPasswordPage`, iniciado por Administración o por «Olvidé mi contraseña»), usa campos sin ese botón.

**Alcance:** `ui/PasswordField.tsx` compartido, usado en las tres pantallas, con la misma accesibilidad que hoy:
- `aria-pressed` y `aria-controls`;
- la etiqueta «Mostrar …»;
- los errores enlazados con `aria-describedby`.

**Resultado:**
- `LoginPage`, `AccountPage` (cambio de contraseña) y `NewPasswordForm` (contraseña inicial y restablecimiento) usan `ui/PasswordField`.
- Acepta una descripción externa (`password-requirements`) y errores en lista.
- Se vuelve a ocultar cuando el campo se vacía, que es lo que hacía el inicio de sesión tras un intento.

**Pruebas:** `ui/PasswordField.test.tsx` (4 pruebas) y una nueva en `SetInitialPasswordPage.test.tsx`; las del inicio de sesión y Mi cuenta siguen en verde.

### T-S18-02 — Correo de la empresa en Instituciones → Vinculación

**Estado:** Completada (24 de noviembre de 2026).

**Hallazgo:**
- La bandeja de la empresa muestra el `EmailMenu` del contacto de la institución.
- La de la institución solo tiene el ícono de mensajes, aunque el detalle y el CSV ya le exponen `company.contact_email`.
- El listado (`InstitutionLinkageRequestController@index`) no carga ese campo.

**Alcance:**
- `contact_email` de la empresa en el listado de la institución; no amplía permisos, porque la institución ya lo ve en el detalle.
- `EmailMenu` junto al ícono de mensajes, como en la bandeja de la empresa.

**Resultado:**
- El listado agrega `company.contact_email` (`null` si la empresa no lo tiene); el teléfono y el nombre del contacto siguen solo en el detalle.
- En el detalle, el campo aparece ahora junto al nombre de la empresa: mismos campos y valores, en otro orden.

**Pruebas:**
- Pest, `InstitutionLinkageInboxTest`: correo presente o `null`, y solo 3 campos de la empresa en el listado.
- Vitest, `InstitutionLinkageRequests.test.tsx`: menú de correo junto a la conversación y ausente sin correo.

### T-S18-03 — Favicon con el isotipo de Nodologístico

**Estado:** Completada (24 de noviembre de 2026).

**Hallazgo:** `index.html` no declara ningún ícono.

**Alcance (D2):**
- isotipo recortado sin letras;
- `favicon.ico` (16, 32 y 48 px), `favicon.png` y `apple-touch-icon.png` (180 px);
- enlaces en `frontend/index.html`.

**Resultado:**
- `scripts/brand/build-favicons.py` recorta el isotipo (394×401 px) por la franja vacía que lo separa de la palabra y genera los tres archivos en `frontend/public/`.
- El ícono de iOS va sobre fondo blanco, porque iOS rellena la transparencia de negro.
- A 16 px se distinguen el monograma «nl» y los círculos; la órbita gris se pierde en la pestaña oscura, como se aceptó (D2).

**Pruebas:** `ui/favicon.test.ts`, que verifica los enlaces en `index.html` y los tamaños de los archivos.

### T-S18-04 — Logotipos y encabezado legibles al 100 % de zoom

**Estado:** Completada (24 de noviembre de 2026).

**Alcance (D3):** auditar los encabezados con logotipos (la barra autenticada y las vistas públicas) y aumentar los logos alrededor de un 25 %, con la altura y el espaciado necesarios, verificando escritorio y móvil.

**Auditoría:**
- La barra (`App.tsx`) muestra el logotipo de Nodologístico y el coemblema de la Secretaría en las vistas con sesión, y solo el coemblema en las públicas.
- El inicio de sesión muestra el logotipo grande en su tarjeta (144 px), fuera de la barra; no se cambió.

**Resultado** (capturas de Chromium al 100 % de zoom, escala 1, de 360 a 1440 px, con y sin sesión):

| Medida | Antes | Después |
|---|---|---|
| Logotipo en escritorio | 47×56 px | 61×72 px (`h-18`) |
| Logotipo en móvil | 37×44 px | 47×56 px (`h-14`) |
| Coemblema en escritorio | 204×44 px | 260×56 px (`h-14`) |
| Coemblema en su franja móvil | 167×36 px | 204×44 px (`h-11`) |
| Barra en escritorio | 79 px | 91 px (relleno de 0.7 a 0.55rem) |
| Barra en móvil | 67 px | 75 px |

- La franja propia del coemblema empieza en 640 px (antes 480). Entre 481 y 640 px el coemblema ya se aplastaba a 82 px de ancho, y con el tamaño nuevo no cabía en la barra.
- Sin desborde horizontal en ningún ancho.

**Pruebas:** `App.test.tsx` (la franja móvil, con el nuevo corte) sigue en verde.

### T-S18-05 — Correos con la marca de la plataforma

**Estado:** Completada (24 de noviembre de 2026).

**Hallazgo:**
- Las 5 notificaciones (`SetInitialPassword`, `ResetInstitutionPassword`, `PasswordChanged`, `AccessEmailChanged` y `LinkageMessageReceived`) usan la plantilla Markdown de Laravel sin personalizar.
- No existe `lang/es.json`, así que salen textos en inglés: «Regards,», «If you're having trouble clicking…» y «All rights reserved.».
- El encabezado es solo texto, sin logo.

**Alcance:**
- vistas de correo publicadas y personalizadas con la marca;
- `lang/es.json`;
- logo por URL pública (D4), verificando que Caddy sirva `/brand/logo-correo.png` en el piloto;
- vista previa en Mailpit y con un comando `mail:preview`;
- pruebas Pest sin textos en inglés y con la marca.

**Resultado:**
- **Plantilla:** `resources/views/vendor/mail` solo sobrescribe tres piezas; el resto de componentes sale de Laravel (`config/mail.php`, `markdown`):
  - el encabezado: logotipo, «Educación Dual» y el nombre de la plataforma;
  - el mensaje, en HTML y texto, con un pie en español: «Banco de Talentos – Educación Dual · <dominio>» y «Este correo se envió automáticamente…»;
  - el tema `banco-talentos.css`: vino `#991B30` en títulos, enlaces y botón; grafito `#57565B` en el texto; filete dorado `#B99058` sobre la tarjeta.
- **Textos:** `lang/es.json` traduce el saludo, «Saludos,» y el texto de respaldo del botón. El idioma por defecto pasa a `es` (`config/app.php`), porque en CI no hay `.env` que lo fije.
- **Logo (D4):** `frontend/public/brand/logo-correo.png` (108×128 px, transparente, generado por `scripts/brand/build-mail-logo.py`), por la URL `config('mail.logo_url')`.
  - La URL es `<FRONTEND_URL>/brand/logo-correo.png`, configurable con `MAIL_LOGO_URL`. En el piloto, `FRONTEND_URL` es igual a `APP_URL`. En desarrollo apunta a Vite (`:5173`), así que el logo también se ve en Mailpit.
  - **Verificado con el `Caddyfile` del piloto y la compilación real:** `/brand/logo-correo.png` responde `200 image/png` con los bytes del archivo. Una ruta inexistente responde `200 text/html` (la SPA), así que una ruta equivocada rompería la imagen sin un 404; las pruebas fijan el nombre en ambos lados.
- **Vista previa:** `php artisan mail:preview` guarda los 7 correos y variantes en `storage/app/mail-previews`. Con `--send=<correo>`, además los envía por el mailer configurado (Mailpit en desarrollo, http://localhost:8025). Nunca corre en producción.
- **Mailpit «HTML Check»:** 45 % de soporte total, 35 % parcial. Lo no soportado (`position`, `box-sizing`, `word-break`) viene del tema base de Laravel y no afecta la lectura. Se revisaron en Chromium a 800 y 390 px.

**Pruebas:**
- Pest, `BrandedMailTest` (21 pruebas): los 7 correos en HTML y texto, sin restos en inglés; logotipo, colores y pie; la URL del logo; el idioma por defecto; y `mail:preview` (archivos, envío, correo inválido y producción).
- Vitest, `ui/favicon.test.ts`: el archivo del logo.
