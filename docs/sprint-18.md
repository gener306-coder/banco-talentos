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

**Estado:** Pendiente.

**Hallazgo:**
- El inicio de sesión (`LoginPage`) tiene el botón de mostrar u ocultar escrito en línea, y Mi cuenta (`AccountPage`) lo tiene en un `PasswordField` local.
- `NewPasswordForm`, que usan la contraseña inicial (`SetInitialPasswordPage`) y el restablecimiento (`ResetPasswordPage`, iniciado por Administración o por «Olvidé mi contraseña»), usa campos sin ese botón.

**Alcance:** `ui/PasswordField.tsx` compartido, usado en las tres pantallas, con la misma accesibilidad que hoy:
- `aria-pressed` y `aria-controls`;
- la etiqueta «Mostrar …»;
- los errores enlazados con `aria-describedby`.

### T-S18-02 — Correo de la empresa en Instituciones → Vinculación

**Estado:** Pendiente.

**Hallazgo:**
- La bandeja de la empresa muestra el `EmailMenu` del contacto de la institución.
- La de la institución solo tiene el ícono de mensajes, aunque el detalle y el CSV ya le exponen `company.contact_email`.
- El listado (`InstitutionLinkageRequestController@index`) no carga ese campo.

**Alcance:**
- `contact_email` de la empresa en el listado de la institución; no amplía permisos, porque la institución ya lo ve en el detalle.
- `EmailMenu` junto al ícono de mensajes, como en la bandeja de la empresa.

### T-S18-03 — Favicon con el isotipo de Nodologístico

**Estado:** Pendiente.

**Hallazgo:** `index.html` no declara ningún ícono.

**Alcance (D2):**
- isotipo recortado sin letras;
- `favicon.ico` (16, 32 y 48 px), `favicon.png` y `apple-touch-icon.png` (180 px);
- enlaces en `frontend/index.html`.

### T-S18-04 — Logotipos y encabezado legibles al 100 % de zoom

**Estado:** Pendiente.

**Alcance (D3):** auditar los encabezados con logotipos (la barra autenticada y las vistas públicas) y aumentar los logos alrededor de un 25 %, con la altura y el espaciado necesarios, verificando escritorio y móvil.

### T-S18-05 — Correos con la marca de la plataforma

**Estado:** Pendiente (PR 2).

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
