# Matriz de permisos

[Índice de la documentación técnica](../README.md)

La autorización vive en el backend. Cada grupo de rutas declara el rol que admite (`role:`), y cada controlador filtra además por la organización de la sesión. La interfaz solo oculta lo que el backend ya prohíbe.

## Cadena de autorización

Cada petición autenticada pasa, en orden, por:

| Paso | Middleware | Si falla |
|---|---|---|
| 1 | `auth:sanctum`: sesión válida (cookie y `X-XSRF-TOKEN`) | `401` |
| 2 | `active` (`EnsureUserIsActive`): la cuenta está activa, su organización está activa y ya estableció su contraseña | `401` con `INSTITUTION_INACTIVE`, `COMPANY_INACTIVE` o `PASSWORD_SETUP_REQUIRED`; cierra la sesión |
| 3 | `role:…` (`EnsureRole`): el rol está entre los admitidos por la ruta | `403` |
| 4 | `institution.member` u `organization.member`: la cuenta pertenece a una institución o empresa | `403` |
| 5 | Filtro por organización en el controlador (`FindsOwnedStudent`, `where('institution_id' \| 'company_id', …)`) | `404`, idéntico a un recurso inexistente |
| 6 | Perfil mínimo de la organización, en las acciones que lo exigen | `422` con `COMPANY_PROFILE_INCOMPLETE` o `INSTITUTION_PROFILE_INCOMPLETE` |

Todas las respuestas de la API llevan `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: no-referrer` (`ApiSecurityHeaders`). Los límites por nombre (`throttle:login`, `throttle:uploads`, etc.) se suman al límite general de `ThrottleApiRequests`.

## Matriz por recurso

✓ = permitido · — = sin acceso.

| Recurso y operaciones | ADMIN | SECRETARY | INSTITUTION | COMPANY |
|---|:-:|:-:|:-:|:-:|
| Sesión propia: `GET /me`, Mi cuenta (`PATCH /me`, `PUT /me/password`, `/me/email/*`) | ✓ | ✓ | ✓ | ✓ |
| Inicio con indicadores: `GET /dashboard` | ✓ | ✓ | ✓ | ✓ |
| Catálogo INEGI: `GET /catalogs/states/{state}/municipalities` | ✓ | ✓ | ✓ | ✓ |
| Galería de promoción dual: `GET /promotional-videos` | ✓ | ✓ | ✓ | ✓ |
| Reporte ejecutivo y CSV: `GET /reports/dual-program[/export.csv]` | ✓ | ✓ | — | — |
| Cuentas de la Secretaría: `/secretary-accounts` (listar, invitar, reenviar, estado, corregir correo, restablecer) | ✓ | ✓ | — | — |
| Instituciones: `/institutions` (listar, crear, ver, editar, estado, cuentas, corregir correo) | ✓ | — | — | — |
| Cuentas institucionales: `/institution-accounts` (crear, reenviar enlace, iniciar restablecimiento) | ✓ | — | — | — |
| Cuentas de Administración: `/admin-accounts` | ✓ | — | — | — |
| Bitácora: `GET /audit-events` | ✓ | — | — | — |
| Inactivar un video promocional: `PATCH /promotional-videos/{video}/status` | ✓ | — | — | — |
| Empresas validadas y sus cuentas: `/companies`, `/companies/{company}/accounts` | — | ✓ | — | — |
| Perfil de la organización: `/organization/profile` (ver, editar, posponer) | — | — | ✓ | ✓ |
| Catálogo de habilidades: `GET /skills` | — | — | ✓ | ✓ |
| Padrón, expediente, CV y seguro: `/students/*` | — | — | ✓ propios | — |
| Bandeja institucional: `/institution/linkage-requests` (listar, CSV, ver, decidir, baja) | — | — | ✓ propias | — |
| Compartir o revocar la ficha: `POST …/disclosure`, `PATCH …/disclosure/revoke` | — | — | ✓ propias | — |
| Videos de la institución: `/institution/videos` (subir, editar, estado, eliminar archivos) | — | — | ✓ propios | — |
| Buscador de talento: `GET /talent`, `GET /talent/{publicId}` | — | — | — | ✓ |
| Oportunidades Duales: `/opportunities` | — | — | — | ✓ propias |
| Solicitudes de la empresa: `/linkage-requests` (listar, crear, ver, cancelar, baja) | — | — | — | ✓ propias |
| Ficha compartida: `GET /linkage-requests/{id}/disclosure` | — | — | — | ✓ vigente |
| Conversación: `…/messages` y `unread-summary` | — | — | ✓ propias | ✓ propias |

«Propios» y «propias» significa que el controlador filtra por la institución o la empresa de la sesión; un recurso ajeno responde `404`. La ficha compartida exige además que la vinculación esté `ACEPTADA` y la ficha vigente.

## Rutas sin sesión

Definidas en `routes/web.php` con el prefijo `/api`, cada una con su propio límite:

| Ruta | Para qué | Límite |
|---|---|---|
| `POST /api/login` | Iniciar sesión | `throttle:login` |
| `POST /api/password/forgot` | «Olvidé mi contraseña» (respuesta idéntica exista o no la cuenta) | `throttle:password-forgot` |
| `POST /api/institution-accounts/password-setup` | Establecer la contraseña con el enlace de invitación | `throttle:password-setup` |
| `POST /api/institution-accounts/password-reset` | Restablecer la contraseña con el enlace | `throttle:password-reset` |
| `POST /api/account-email/confirm` | Confirmar la verificación o el cambio del correo de acceso | `throttle:email-confirm` |
| `GET /api/media/{path}` | Medios del disco local con URL firmada y temporal (solo si `MEDIA_DISK` no es `s3`) | Firma `signed:relative`, sin límite general |

`POST /api/logout` exige una sesión activa.

## Reglas que van más allá del rol

- **Ninguna institución modifica alumnos de otra.** Lo impiden el filtro de `FindsOwnedStudent` y las FK compuestas `(student_id, institution_id)`.
- **Ninguna empresa modifica alumnos.** No existe ninguna ruta de escritura de alumnos para `COMPANY`.
- **La Secretaría no administra expedientes académicos.** No tiene acceso a `/students`.
- **El administrador no sustituye a los actores de una vinculación.** No tiene acceso a las bandejas, la conversación ni la ficha.
- **Sin `DELETE`.** Las bajas son lógicas por `PATCH .../status`. Las únicas excepciones con efecto de borrado son:
  - `PATCH /institution/videos/{video}/deletion`, que borra los archivos del video para liberar espacio y conserva el registro;
  - las revocaciones de la ficha, que se registran como una nueva fila.

## Fuentes en el repositorio

- `backend/routes/api.php`, `backend/routes/web.php`
- `backend/bootstrap/app.php` (alias del middleware)
- `backend/app/Http/Middleware/` (`EnsureUserIsActive`, `EnsureRole`, `EnsureInstitutionMember`, `EnsureOrganizationMember`, `ApiSecurityHeaders`, `ThrottleApiRequests`)
- `backend/app/Models/User.php` (`accessRestriction`)
- `backend/app/Exceptions/AccountAccessDenied.php`, `CompanyProfileIncomplete.php`, `InstitutionProfileIncomplete.php`
- `backend/app/Http/Controllers/Concerns/FindsOwnedStudent.php`
- `CLAUDE.md` (Reglas de seguridad)
