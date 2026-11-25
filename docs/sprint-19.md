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

**Estado:** Completada (24 de noviembre de 2026).

**Alcance:**
- `users.email_verified_at` y `users.setup_delivery` (`email` o `manual`), que registra cómo se entregó el último enlace emitido.
- Completar un enlace de contraseña inicial o de restablecimiento entregado por correo marca el correo como verificado; uno manual no (D7).
- Las cuentas existentes quedan sin verificar; `/me` y los listados de cuentas exponen el estado.
- No bloquea el inicio de sesión (D6).

**Resultado:**
- Migración `2026_11_24_000001_add_email_verification_to_users_table`: `email_verified_at`, `setup_delivery`, `pending_email`, `email_token_hash` y `email_token_sent_at`, con restricciones de pareja y un índice único parcial sobre el hash.
- `InitialPasswordLink` e `InstitutionPasswordResetLink` fijan `setup_delivery = manual` al emitir el enlace y lo pasan a `email` solo cuando el transporte acepta el correo. Si el envío falla, nadie lo recibió en el buzón.
- Completar la contraseña inicial o un restablecimiento verifica el correo solo si el enlace llegó por correo (`User::verifyEmailIfLinkWasEmailed`).
- `/me` agrega `email_verified`, `pending_email` y `email_link_sent_at`. Los listados de cuentas agregan `email_verified`. El hash nunca sale (`$hidden`).

**Pruebas:** Pest, `AccessEmailVerificationTest` (bloque T-S19-01): enlace por correo frente a manual, transporte caído y restablecimiento.

### T-S19-02 — Corregir el correo de una cuenta pendiente y reenviar

**Estado:** Completada (24 de noviembre de 2026).

**Alcance:**
- Solo mientras la cuenta está pendiente de activar, con los permisos de hoy: ADMIN para cuentas institucionales, de Administración y de Secretaría; SECRETARY para las de empresa y de Secretaría.
- Al guardar, se invalida el enlace anterior (ligado al correo viejo), se emite uno nuevo de un solo uso y se registra en la bitácora.
- Ventana «Corregir correo de acceso» con el correo actual (solo lectura), el nuevo y la aclaración de que el enlace anterior deja de servir.
- Listado de cuentas institucionales en el detalle de la institución, con su estado.

**Resultado:**
- `PATCH /api/admin-accounts/{id}/email`, `/api/secretary-accounts/{id}/email`, `/api/companies/{company}/accounts/{id}/email` e `/api/institutions/{institution}/accounts/{id}/email`, con los mismos roles y límites que el reenvío del enlace.
- La lógica común está en `ManagesAccountAccess::correctPendingEmail`:
  - solo cuentas activas pendientes de activar;
  - borra el enlace del correo equivocado antes del cambio;
  - envía el nuevo siempre por correo;
  - registra `email_changed` con quien corrigió;
  - a la dirección equivocada no le envía nada;
  - si la cuenta se invitó sin nombre, su nombre provisional era el correo mal escrito (M3) y se corrige junto con él.
- `GET /api/institutions/{institution}/accounts` y `InstitutionAccountsList` en el detalle de la institución.
- Ventana «Corregir correo de acceso» (`accounts/CorrectEmailForm`) en los listados de Administración, Secretaría, empresa e institución.
- Etiquetas comunes (`ui/EmailStatusBadge`) en la celda del correo.

**Pruebas:**
- Pest: corrección, enlace anterior inválido, duplicados, cuenta activa, IDOR entre instituciones, empresa inactiva y roles.
- Vitest, `AccessEmail.test.tsx`: Secretaría e institución.
- E2E, `access-email.spec.ts`: cuenta institucional con el correo mal escrito.

### T-S19-03 — Cambio de correo de acceso en Mi cuenta

**Estado:** Completada (24 de noviembre de 2026).

**Alcance:**
- Formulario con `Nuevo correo de acceso` y `Contraseña actual` (`ui/PasswordField`). El correo actual sigue activo hasta confirmar el enlace, vigente 60 minutos.
- Se guarda en `pending_email` y se envía un enlace firmado a la dirección nueva; la actual recibe un aviso. Otra solicitud reemplaza la pendiente e invalida su enlace.
- Bloque «Confirmación de correo pendiente» con **Reenviar enlace** (espera visible de 60 segundos) y **Cancelar cambio**.
- Pantalla pública de confirmación, con o sin sesión: éxito; enlace vencido, usado o cancelado; correo ya registrado en otra cuenta.
- Al confirmar: correo verificado, enlaces y demás sesiones invalidados, aviso a ambas direcciones, bitácora y contacto de la organización (D8).

**Resultado:**
- `AccountEmailController`:
  - `POST /api/me/email`, `/resend`, `/cancel` y `/verification`, con sesión y el límite `account-email`;
  - `POST /api/account-email/confirm`, pública, con el límite `email-confirm` por IP.
- **Enlace (`AccessEmailLink`):** token aleatorio de 64 caracteres; solo se guarda su SHA-256.
  - Vence a los 60 minutos.
  - Emitir otro enlace (reenvío o nueva solicitud) reemplaza el hash, así que el anterior deja de servir.
  - Se usa en lugar de una URL firmada de Laravel porque así el enlace es de un solo uso y se puede cancelar. Además, la URL no lleva el id de la cuenta.
- **Al confirmar:**
  - se vuelve a comprobar que el correo esté libre (409 `EMAIL_TAKEN`, y se descarta el cambio);
  - se borran los enlaces de contraseña del correo anterior;
  - se rota el `remember_token` y se cierran las demás sesiones; si se confirma con la sesión de la misma cuenta, esa sigue abierta;
  - se registra `email_changed` y, con D8, `organization_profile_updated` (`contact_email`);
  - se avisa con `AccessEmailChanged` a ambas direcciones (su texto ya no menciona solo a Administración).
- **Correos nuevos con la plantilla del Sprint 18:**
  - `ConfirmAccessEmail`, al correo nuevo o al actual;
  - `AccessEmailChangeRequested`, aviso sin enlace a la dirección actual.
- **Mi cuenta (`account/AccessEmailSection`):**
  - etiqueta del correo y **Cambiar correo**, en una hoja con `ui/PasswordField`;
  - bloque «Confirmación de correo pendiente» con **Reenviar enlace**, que muestra la espera de 60 s, y **Cancelar cambio**.
- **Pantalla pública `/confirm-email`:**
  - confirma al abrir, una sola vez, y quita el token de la URL;
  - tres mensajes: éxito, enlace inválido y correo ya registrado;
  - con sesión, actualiza la identidad de la barra.

**Pruebas:**
- Pest (bloque T-S19-03): contraseña, correo igual u ocupado, aviso a la dirección actual, sesiones, D8, sin sesión, vencido, reemplazado, cancelado, doble uso, conflicto y espera del reenvío.
- Vitest: Mi cuenta y la pantalla de confirmación.
- E2E: cambio confirmado desde otro navegador e inicio de sesión con el correo nuevo.

### T-S19-04 — Verificar el correo actual

**Estado:** Completada (24 de noviembre de 2026).

**Alcance:**
- Aviso discreto en Mi cuenta para cuentas sin verificar, con «Enviar enlace de verificación»: explica que garantiza poder restablecer la contraseña.
- `admin:update-email` deja el correo sin verificar (D9).
- Todos los correos nuevos usan la plantilla con marca del Sprint 18 y se cubren en `mail:preview` y `BrandedMailTest`.

**Resultado:**
- Aviso «Verifica tu correo de acceso» en Mi cuenta, con **Enviar enlace de verificación** y después **Reenviar enlace**. No aparece con un cambio pendiente: el servidor lo rechaza.
- `admin:update-email` deja `email_verified_at` en nulo y descarta cualquier cambio pendiente (D9).
- `mail:preview` genera 10 vistas previas: se agregan `confirmar-correo-nuevo`, `verificar-correo` y `aviso-cambio-de-correo`.
- `BrandedMailTest` cubre los 3 correos en HTML y texto, sin restos en inglés.

**Pruebas:**
- Pest (bloque T-S19-04) y `BrandedMailTest`.
- Vitest: aviso y envío.
- E2E: una cuenta con enlace manual verifica su correo desde Mailpit.

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
