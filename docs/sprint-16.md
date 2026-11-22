# Sprint 16 — Gobierno de cuentas ADMIN e instituciones autogestionadas

Sprint vigente desde el 22 de noviembre de 2026. Sprint anterior: [sprint-15.md](sprint-15.md) (histórico).

**Objetivo del Sprint:** dejar cerrada la operación autónoma de la plataforma antes del despliegue.
- Crear el primer Administrador en producción de forma segura, sumar más Administradores y recuperar el acceso sin depender de otra persona.
- Que cada persona recupere su contraseña por sí misma.
- Que las instituciones, como las empresas, se den de alta con lo mínimo y mantengan su propio perfil.

**Story Points:** 33 (HU-S16-01 a HU-S16-08).

**Rama:** `feat/s16-admin-and-institutions`.

**Ejecución en dos bloques, con pausa de revisión entre ambos:**
- **Bloque A** (HU-S16-01 a HU-S16-04): gobierno, escalamiento y recuperación de cuentas `ADMIN`, y «Olvidé mi contraseña».
- **Bloque B** (HU-S16-05 a HU-S16-08): instituciones autogestionadas.

## Hallazgos que motivan el Sprint (auditoría del 22 de noviembre de 2026)

- **No hay forma de crear un `ADMIN` en producción.**
  - `auth:create-user` solo corre en local y de forma interactiva.
  - Ninguna ruta ni pantalla gestiona cuentas `ADMIN`.
  - Nadie puede restablecer la contraseña de un `ADMIN`.
- **No existe «Olvidé mi contraseña» para ningún rol.** Solo hay restablecimientos iniciados por `ADMIN` (instituciones) o por `SECRETARY` (su personal y las empresas).
- **`account_audit_events.actor_id` es obligatorio,** así que un comando de consola no tiene actor que registrar.
- **Las instituciones exigen todo su perfil al darse de alta,** y varios consumidores fallarían con un nombre o un contacto nulos:
  - el inicio de sesión;
  - los correos de mensajes nuevos;
  - la bandeja de la empresa, el chat, la búsqueda de talento, la galería, el reporte y la bitácora;
  - las vistas de Administración.

## Decisiones del responsable (22 de noviembre de 2026)

- **D1. Sin ruta `/setup`:** el primer `ADMIN` se crea solo con `php artisan admin:bootstrap` desde el servidor.
- **D2. «Olvidé mi contraseña» para los 4 roles:**
  - respuesta neutra `202` siempre, exista o no la cuenta;
  - envío diferido después de la respuesta;
  - límites de 3 por hora por correo y 10 por minuto por IP;
  - el correo solo se encola con la cuenta activa, su contraseña configurada y su organización (empresa o institución) activa; la respuesta es la misma en todos los casos.
- **D3. Auditoría de los comandos de consola:**
  - `account_audit_events.actor_id` pasa a ser nullable y se agrega `actor_kind` (`user` o `cli`), con `CHECK (actor_id IS NOT NULL OR actor_kind = 'cli')`;
  - `/audit-events` muestra «Consola del servidor» como actor.
- **D4.** `admin:update-email` solo cambia cuentas `ADMIN`. El correo sigue en solo lectura desde la interfaz (D5 del Sprint 14).
- **D5. Alta ligera de instituciones:** el contacto queda vacío (`null`) hasta el onboarding, en simetría con las empresas. El correo de la cuenta no precarga `contact_email`.
- **D6. Mínimo operativo de la institución:** nombre, CCT, nombre y correo del contacto. Se exige para:
  - hacer buscable un alumno en `/talent`;
  - subir un video promocional;
  - aceptar una solicitud.

  Registrar y editar alumnos en el padrón (borradores) no se bloquea.
- **D7.** Las instituciones existentes terminan su onboarding en la migración (`onboarding_dismissed_at = now()`).
- **D8. Bitácora de estados:** inactivar o reactivar una cuenta (`ADMIN`, `SECRETARY`, `COMPANY` o `INSTITUTION`) registra `account_status_changed`, solo con el actor, el sujeto y el estado nuevo, sin datos sensibles.
- **D9.** Entran las 8 historias, en los dos bloques indicados.
- **Precisión técnica:**
  - `/api/me` devuelve `institution.name` con `displayName()` (`string | null`, igual que `company.name`), con el respaldo visual en `auth/user.ts`;
  - los endpoints hacia otros actores usan `label()` («Institución sin nombre»): `/talent`, la bandeja de la empresa, el chat, los videos, los correos, el reporte y la bitácora.

## Orden de implementación

1. **HU-S16-01** Arranque seguro del primer ADMIN.
2. **HU-S16-04** Recuperación de emergencia por consola.
3. **HU-S16-02** Gestión de varias cuentas ADMIN.
4. **HU-S16-03** «Olvidé mi contraseña» de autoservicio.
5. *Pausa de revisión del Bloque A.*
6. **HU-S16-05** Esquema con nulos seguros y consumidores.
7. **HU-S16-06** Alta ligera de instituciones.
8. **HU-S16-07** Onboarding, recordatorio y avance del perfil.
9. **HU-S16-08** Mínimo para operar.

## Fuera de alcance

- Cambio del correo de acceso desde la interfaz (D4).
- Autenticación de dos factores.
- Gestión de cuentas de la institución por la propia institución.

---

## HU-S16-01 — Arranque seguro del primer ADMIN

**Estado:** Completada (22 de noviembre de 2026) en `feat/s16-admin-and-institutions`.  
**Diseño técnico y verificación:** [HU-S16-01.md](HU-S16-01.md)  
**Story Points:** 3  
**Rol:** operación (consola del servidor)

### Historia de usuario

**COMO** responsable del despliegue  
**QUIERO** crear el primer Administrador desde el servidor  
**PARA** poner en marcha la plataforma sin exponer un registro público.

### Criterios de aceptación

- **CA-01.** `php artisan admin:bootstrap {email} {--name=} {--manual}`:
  - corre sin interacción en cualquier entorno;
  - valida el correo;
  - se niega si ya existe un `ADMIN` activo;
  - un bloqueo de PostgreSQL impide dos arranques simultáneos.
- **CA-02.** Crea la cuenta `ADMIN` con la contraseña pendiente de configurar y emite el enlace de `/set-initial-password` con el servicio existente (60 minutos, de un solo uso):
  - por correo por defecto;
  - con `--manual`, lo imprime una sola vez en la terminal;
  - nunca lo escribe en los logs.
- **CA-03.** Registra `admin_bootstrapped` en la bitácora con `actor_kind = cli` (D3).
- **CA-04.** Pruebas Pest: crea y envía; se niega con un `ADMIN` activo; `--manual` sin el token en logs; evento de consola.

## HU-S16-04 — Recuperación de emergencia por consola

**Estado:** Completada (22 de noviembre de 2026) en `feat/s16-admin-and-institutions`.  
**Diseño técnico y verificación:** [HU-S16-04.md](HU-S16-04.md)  
**Story Points:** 3  
**Rol:** operación (consola del servidor)

### Historia de usuario

**COMO** responsable de la operación  
**QUIERO** listar a los Administradores, restablecer su contraseña o corregir su correo desde el servidor  
**PARA** recuperar el acceso si un Administrador olvida su contraseña o pierde su correo.

### Criterios de aceptación

- **CA-01.** `admin:list` muestra id, nombre, correo, si está activo, si configuró su contraseña y la fecha de alta, sin secretos.
- **CA-02.** `admin:reset-password {email} {--manual}` aplica solo a cuentas `ADMIN`:
  - emite el enlace de restablecimiento (60 minutos) por correo, o en la terminal con `--manual`;
  - borra las sesiones abiertas, rota `remember_token` e invalida los tokens pendientes;
  - registra `password_reset_issued` con `actor_kind = cli`.
- **CA-03.** `admin:update-email {actual} {nuevo}` aplica solo a cuentas `ADMIN` (D4):
  - valida el formato y la unicidad del correo nuevo;
  - cierra las sesiones;
  - avisa al correo anterior y al nuevo;
  - registra `email_changed` con `actor_kind = cli`, sin los valores.
- **CA-04.** La migración de D3: `actor_id` nullable, `actor_kind` con CHECK y los eventos nuevos en el CHECK de `event`. La bitácora muestra «Consola del servidor».
- **CA-05.** Pruebas Pest de los tres comandos: sesiones borradas, token rotado, avisos, eventos, rechazo de cuentas que no son `ADMIN` y nada sensible en los logs.

## HU-S16-02 — Gestión de varias cuentas ADMIN

**Estado:** Pendiente.  
**Story Points:** 5  
**Rol:** `ADMIN`

### Historia de usuario

**COMO** Administrador  
**QUIERO** invitar a otros Administradores e inactivar sus cuentas  
**PARA** no depender de una sola persona y retirar accesos cuando alguien deja el equipo.

### Criterios de aceptación

- **CA-01.** `GET|POST /api/admin-accounts`, `POST /api/admin-accounts/resend-setup`, `PATCH /api/admin-accounts/{account}/status` y `POST /api/admin-accounts/password-reset/start`:
  - solo para `ADMIN`, con sesión activa;
  - el mismo patrón y los mismos límites que las cuentas de la Secretaría;
  - invitación por correo o con un enlace manual.
- **CA-02.** Nadie puede inactivar su propia cuenta.
- **CA-03.** Inactivar al último `ADMIN` activo responde `422`. Las cuentas `ADMIN` activas se bloquean con `FOR UPDATE` dentro de la transacción, así que dos inactivaciones simultáneas no dejan la plataforma sin Administrador.
- **CA-04.** Inactivar o reactivar cualquier cuenta registra `account_status_changed` (D8).
- **CA-05.** `/admin-accounts`, con la misma tabla, `Sheet` y `ConfirmDialog` que las cuentas de la Secretaría, y una tarjeta de acceso en el inicio del `ADMIN`.
- **CA-06.** Pruebas:
  - Pest: el último `ADMIN` responde 422; orden de bloqueo; acceso solo para `ADMIN`; bitácora; `ApiSecurityMatrixTest`; `QueryScalingTest` del listado;
  - Vitest: la vista;
  - Playwright: invitar e inactivar.

## HU-S16-03 — «Olvidé mi contraseña» de autoservicio

**Estado:** Pendiente.  
**Story Points:** 3  
**Rol:** público (los 4 roles)

### Historia de usuario

**COMO** persona con una cuenta en el Banco de Talentos  
**QUIERO** pedir un enlace para restablecer mi contraseña desde el inicio de sesión  
**PARA** recuperar mi acceso sin pedirlo a Administración ni a la Secretaría.

### Criterios de aceptación

- **CA-01.** `POST /api/password/forgot` con `{email}` responde siempre `202` con el mismo cuerpo, exista o no la cuenta (D2).
- **CA-02.** El enlace de restablecimiento (60 minutos, de un solo uso) solo se encola, después de la respuesta, si:
  - la cuenta existe y está activa;
  - configuró su contraseña;
  - su organización, si tiene, está activa.
- **CA-03.** Límites de 3 por hora por correo y 10 por minuto por IP.
- **CA-04.** `/login` ofrece «¿Olvidaste tu contraseña?», que lleva a `/forgot-password`:
  - tarjeta angosta con el aviso simplificado y el footer;
  - un mensaje neutro al enviar.
- **CA-05.** Pruebas:
  - Pest: respuesta idéntica en todos los casos; límites; cuenta inactiva, pendiente o de una organización inactiva sin correo; `ApiSecurityMatrixTest` (ruta pública con límite);
  - Vitest: la vista;
  - Playwright: el recorrido con Mailpit.

---

## HU-S16-05 — Esquema con nulos seguros y consumidores

**Estado:** Pendiente.  
**Story Points:** 8  
**Rol:** todos

### Criterios de aceptación

- **CA-01.** Migración de `institutions`:
  - `name`, `cct` y `contact_email` nullable;
  - CHECK de texto no vacío en nombre, CCT y los cuatro datos de contacto;
  - `onboarding_dismissed_at`, terminado en las instituciones existentes (D7);
  - `institution_invited` en el CHECK de la bitácora.
- **CA-02.** `Institution::displayName()`, `label()` («Institución sin nombre»), `MINIMUM`, `missing()` y `profileStatus()`, como en `Company`.
- **CA-03.** Hacia otros actores, todo texto usa `label()` (precisión técnica). `/api/me` usa `displayName()`.
- **CA-04.** El listado de instituciones del `ADMIN` pagina y busca por nombre, CCT y correo de la cuenta, con los nombres vacíos al final, y muestra el estado del perfil.
- **CA-05.** Los parsers y las vistas propias de la institución y del `ADMIN` aceptan nulos y muestran «Sin capturar».
- **CA-06.** Pruebas de nulos en cada consumidor de la matriz.

## HU-S16-06 — Alta ligera de instituciones

**Estado:** Pendiente.  
**Story Points:** 3  
**Rol:** `ADMIN`

### Criterios de aceptación

- **CA-01.** `POST /api/institutions`:
  - solo exige el correo de la cuenta;
  - `name` y `person_name` son opcionales; sin nombre de la persona, la cuenta guarda el correo como nombre provisional (M3);
  - el contacto queda vacío (D5);
  - entrega por correo o manual.
- **CA-02.** Registra `institution_invited` en la bitácora.
- **CA-03.** La edición del `ADMIN` conserva todos los campos, opcionales.

## HU-S16-07 — Onboarding, recordatorio y avance del perfil

**Estado:** Pendiente.  
**Story Points:** 5  
**Rol:** `INSTITUTION`

### Criterios de aceptación

- **CA-01.** `/api/me` y el perfil de la organización exponen `missing`, `onboarding` y `can_operate` para la institución. «Completar más tarde» también aplica a instituciones.
- **CA-02.** `/welcome` recibe a la institución con:
  - guardado parcial;
  - «Soy yo» (`useSelfContact`);
  - «Completar más tarde».
- **CA-03.** El inicio de la institución muestra el recordatorio del perfil sin competir con los pendientes del padrón.
- **CA-04.** `/account#organization` muestra el avance con los 4 datos mínimos.

## HU-S16-08 — Mínimo para operar

**Estado:** Pendiente.  
**Story Points:** 3  
**Rol:** `INSTITUTION`

### Criterios de aceptación

- **CA-01.** Sin el mínimo (D6), las siguientes acciones responden `422` con `INSTITUTION_PROFILE_INCOMPLETE` y lo que falta:
  - hacer buscable a un alumno en `/talent`;
  - subir un video;
  - aceptar una solicitud.

  Rechazar y registrar o editar alumnos siguen permitidos.
- **CA-02.** La interfaz explica el bloqueo con un enlace a `/account#organization`.
- **CA-03.** Pruebas Pest, Vitest y Playwright del bloqueo y su desbloqueo.

---

## Notas previas a producción

1. Tras el primer despliegue, crear el Administrador con `php artisan admin:bootstrap <correo>` (HU-S16-01).
2. El correo de producción debe estar configurado antes del arranque, o usar `--manual`.
