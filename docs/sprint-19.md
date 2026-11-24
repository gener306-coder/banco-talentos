# Sprint 19 — Correo de acceso verificado y ficha compartida con la empresa

Sprint vigente desde el 24 de noviembre de 2026. Sprint anterior: [sprint-18.md](sprint-18.md) (histórico).

**Objetivo del Sprint:**
- que ningún correo de acceso mal escrito impida activar una cuenta o restablecer su contraseña;
- que la institución pueda compartir con la empresa, por decisión explícita y revocable, una ficha ampliada del alumno tras aceptar la vinculación.

**Ramas y PRs:**
- **PR 1 (correo de acceso):** `feat/s19-access-email`, con T-S19-01 a T-S19-04.
- **PR 2 (ficha compartida):** `feat/s19-student-disclosure`, con T-S19-05 a T-S19-08, después del PR 1.

**Despliegue:** ninguno durante el Sprint. Al fusionar ambos PRs se hace un solo **Build AMI** y **Deploy pilot** con los Sprints 18 y 19 ([runbook](infra/runbook-pilot.md)).

## Diagnóstico (24 de noviembre de 2026)

Auditoría de solo lectura previa al Sprint.

**Correo de acceso:**
- `users` no tiene `email_verified_at` ni `pending_email`; nada usa `MustVerifyEmail`.
- Las invitaciones (institución, cuenta institucional, empresa, cuenta de empresa, cuentas de Administración y de Secretaría, `admin:bootstrap`) admiten entrega por correo o manual. La manual devuelve el enlace a quien invita: completarlo no prueba el buzón.
- Mi cuenta solo cambia el nombre. El único cambio de correo es `admin:update-email` (consola, solo ADMIN).
- Ninguna cuenta pendiente ni activa se corrige desde la interfaz, y el detalle de la institución no lista sus cuentas: reenviar o restablecer exige reescribir el correo.

**Datos del alumno:**
- El alumno no tiene correo ni teléfono en la plataforma.
- Protegidos: identidad (`student_identities`), seguro (`student_social_security`), enlaces (`student_links`), credenciales (`student_certification_credentials`), `students.id`, `location` y `verified_by`.
- La empresa ve el perfil anónimo (búsqueda y solicitud) y el responsable de la institución. Tras aceptar, solo lo que la institución comparta por la conversación (HU-S15-04).
- La regla de privacidad de `CLAUDE.md` y el aviso de privacidad prohibían entregar la identidad a la empresa (ver D1).

## Decisiones del responsable (24 de noviembre de 2026)

- **D1. Excepción de privacidad acotada:** la ficha compartida es una excepción explícita a la regla de `CLAUDE.md` y `AGENTS.md`, y se refleja en el aviso de privacidad. Solo aplica a vinculaciones `ACEPTADA`, por acción explícita y revocable de la institución.
- **D2. Lista blanca estricta** en una constante del modelo, con 3 grupos elegibles: `full_name`, `links` y `credentials`. Nunca la matrícula, ninguna columna ni booleano de `student_social_security`, `students.id`, `location` ni `verified_by`.
- **D3. Consentimiento:** casilla obligatoria del consentimiento del alumno o su tutor, registrada con fecha (`consent_confirmed_at`).
- **D4. Vigencia:** solo en `ACEPTADA`; pasar a `BAJA` la revoca automáticamente.
- **D5. Aviso:** correo con marca a las cuentas activas de la empresa al compartir; ninguno al dejar de compartir.
- **D6. Sin bloqueo:** un correo sin verificar no impide iniciar sesión; se muestra una etiqueta y un aviso no bloqueante.
- **D7. Entrega manual:** completar un enlace entregado de forma manual no verifica el correo; solo lo verifica completar uno enviado por correo.
- **D8. Contacto de la organización:** al confirmar un cambio de correo, si el contacto de la organización tenía el correo anterior, se actualiza también y se registra en la bitácora.
- **D9. `admin:update-email`** sigue siendo inmediato (recuperación de acceso), pero deja `email_verified_at` en nulo.
- **D10. Formato:** tareas técnicas `T-S19-01` a `T-S19-08`, documentadas en este archivo.

## Fuera de alcance

- Verificar el correo de contacto de las organizaciones (no da acceso).
- Corregir el correo de cuentas ya activadas de otras personas: cada persona lo cambia en Mi cuenta (T-S19-03).
- Bloquear el inicio de sesión por correo sin verificar (D6).
- Despliegue en AWS durante el Sprint.

---

## Tareas técnicas

### Etiquetas de estado comunes (PR 1)

Mi cuenta y los listados de cuentas (Administración, Secretaría, empresa y el nuevo de institución) usan las mismas etiquetas:
- `Pendiente de activar`: la cuenta no ha establecido su contraseña.
- `Correo verificado`.
- `Sin verificar`.
- `Cambio pendiente`: hay un correo nuevo esperando confirmación (solo en Mi cuenta).

### T-S19-01 — Estado de verificación del correo

**Estado:** Pendiente.

**Alcance:**
- `users.email_verified_at` y `users.setup_delivery` (`email` o `manual`), que registra cómo se entregó el último enlace emitido.
- Completar un enlace de contraseña inicial o de restablecimiento entregado por correo marca el correo como verificado; uno manual no (D7).
- Las cuentas existentes quedan sin verificar; `/me` y los listados de cuentas exponen el estado.
- No bloquea el inicio de sesión (D6).

### T-S19-02 — Corregir el correo de una cuenta pendiente y reenviar

**Estado:** Pendiente.

**Alcance:**
- Solo mientras la cuenta está pendiente de activar, con los permisos de hoy: ADMIN para cuentas institucionales, de Administración y de Secretaría; SECRETARY para las de empresa y de Secretaría.
- Al guardar, se invalida el enlace anterior (ligado al correo viejo), se emite uno nuevo de un solo uso y se registra en la bitácora.
- Ventana «Corregir correo de acceso» con el correo actual (solo lectura), el nuevo y la aclaración de que el enlace anterior deja de servir.
- Listado de cuentas institucionales en el detalle de la institución, con su estado.

### T-S19-03 — Cambio de correo de acceso en Mi cuenta

**Estado:** Pendiente.

**Alcance:**
- Formulario con `Nuevo correo de acceso` y `Contraseña actual` (`ui/PasswordField`). El correo actual sigue activo hasta confirmar el enlace, vigente 60 minutos.
- Se guarda en `pending_email` y se envía un enlace firmado a la dirección nueva; la actual recibe un aviso. Otra solicitud reemplaza la pendiente e invalida su enlace.
- Bloque «Confirmación de correo pendiente» con **Reenviar enlace** (espera visible de 60 segundos) y **Cancelar cambio**.
- Pantalla pública de confirmación, con o sin sesión: éxito; enlace vencido, usado o cancelado; correo ya registrado en otra cuenta.
- Al confirmar: correo verificado, enlaces y demás sesiones invalidados, aviso a ambas direcciones, bitácora y contacto de la organización (D8).

### T-S19-04 — Verificar el correo actual

**Estado:** Pendiente.

**Alcance:**
- Aviso discreto en Mi cuenta para cuentas sin verificar, con «Enviar enlace de verificación»: explica que garantiza poder restablecer la contraseña.
- `admin:update-email` deja el correo sin verificar (D9).
- Todos los correos nuevos usan la plantilla con marca del Sprint 18 y se cubren en `mail:preview` y `BrandedMailTest`.

### T-S19-05 — Ficha compartida: modelo y API con lista blanca

**Estado:** Pendiente.

**Alcance:**
- Registro por vinculación con los grupos compartidos, el consentimiento (D3), quién y cuándo compartió, y quién y cuándo dejó de compartir.
- Lista blanca en el modelo (D2); cualquier otra clave se rechaza y la respuesta se arma con campos explícitos.
- La institución comparte o deja de compartir solo en `ACEPTADA`; la `BAJA` lo revoca (D4).
- La empresa lee la ficha en vivo: 404 si no se compartió, se dejó de compartir, la vinculación no está `ACEPTADA` o la solicitud es de otra empresa.
- Bitácora de compartir y dejar de compartir.

### T-S19-06 — Ficha compartida: interfaz

**Estado:** Pendiente.

**Alcance:**
- **Institución**, en el detalle de la vinculación:
  - pendiente: sin botón, con una nota de que podrá compartirse tras aceptar;
  - `ACEPTADA` sin compartir: etiqueta `Ficha privada` y **Compartir ficha con la empresa**;
  - `ACEPTADA` compartida: etiqueta `Ficha compartida` con fecha y **Dejar de compartir**.
- Ventana de compartir: casillas `Nombre completo`, `Enlaces y portafolio` y `Credenciales de certificaciones`; consentimiento obligatorio; aclaración de que la matrícula, los datos y el comprobante del seguro y los campos internos siguen privados y de que el acceso puede retirarse.
- Dejar de compartir (`ConfirmDialog`): la empresa pierde el acceso de inmediato; la vinculación y los mensajes siguen.
- **Empresa:** «Ficha profesional no disponible…» mientras no se comparta; «Ficha profesional compartida» con fecha y el pie de confidencialidad cuando sí. Enlaces solo `http(s)` con `rel="noopener noreferrer"`.

### T-S19-07 — Aviso a la empresa

**Estado:** Pendiente.

**Alcance:** correo con marca a las cuentas activas de la empresa al compartir la ficha; ninguno al dejar de compartir (D5). En `mail:preview` y `BrandedMailTest`.

### T-S19-08 — Textos, aviso de privacidad y convención

**Estado:** Pendiente.

**Alcance:** `privacy.tsx`, `terms.tsx`, `CvLinksSection.tsx`, `CvCertificationsSection.tsx`, `LinkageRequestDetailPage.tsx`, `TalentProfilePage.tsx`, `StudentDetailPage.tsx`, los comentarios de las tablas, y la excepción en `CLAUDE.md` y `AGENTS.md` (D1).
