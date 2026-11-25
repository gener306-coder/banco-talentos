# Catálogo resumido de la API

[Índice de la documentación técnica](../README.md)

La API tiene **111 rutas**:
- `routes/api.php`: 105 rutas (40 `GET`, 29 `POST`, 21 `PATCH` y 15 `PUT`);
- `routes/web.php`: 6 rutas `POST` con prefijo `/api`, las que no exigen sesión o la abren y cierran.

**No hay ninguna ruta `DELETE`.** Este catálogo agrupa las rutas por recurso. El rol que admite cada una está en la [matriz de permisos](../02-dominio-y-proceso/02-matriz-de-permisos.md), y el contrato detallado de cada historia, en su reporte `docs/HU-SN-NN.md`.

## Convenciones del contrato

- **JSON siempre**, también en los errores, y con `Cache-Control: no-store, private` (los medios firmados usan `private, max-age=3600`).
- **Sesión por cookie.** La SPA envía `X-XSRF-TOKEN` y `credentials: 'include'`.
- **Errores:**

  | Código | Significado |
  |---|---|
  | `401` | Sin sesión, o con un `code` como `COMPANY_INACTIVE` |
  | `403` | Rol o pertenencia |
  | `404` | Inexistente o ajeno: no se distinguen |
  | `409` | Conflicto, por ejemplo `EMAIL_TAKEN` |
  | `419` | Token CSRF vencido |
  | `422` | `errors` por campo, o un `code` de dominio |
  | `429` | Límite de peticiones |
- **Paginación** del lado del servidor, con estos tamaños de página:

  | Tamaño | Listados |
  |---|---|
  | 12 | Galería |
  | 20 | Talento, oportunidades y bandejas |
  | 30 | Bitácora |
  | 50 | Padrón, instituciones, empresas y cuentas |
  | 100 | Mensajes |
- **Baja lógica** con `PATCH …/status`. **Estados de la vinculación** con rutas dedicadas: `decision`, `cancel` y `termination`.
- **Identificadores.** Numéricos acotados a 18 dígitos. Los alumnos se identifican por `public_id` (UUID) en las rutas de la empresa, y los videos por su `public_id`.
- **Exportaciones CSV** con `throttle:exports`: la bandeja institucional y el reporte ejecutivo.

## Sesión, acceso y cuenta propia

| Método y ruta | Para qué |
|---|---|
| `POST /api/login`, `POST /api/logout` | Abrir y cerrar sesión |
| `GET /api/me` | Cuenta de la sesión, con su rol, organización y estado del correo |
| `PATCH /api/me`, `PUT /api/me/password` | Nombre y contraseña (la contraseña actual es obligatoria) |
| `POST /api/me/email`, `…/resend`, `…/cancel`, `…/verification` | Pedir un cambio de correo, reenviar o cancelar el enlace, y verificar el correo actual |
| `POST /api/account-email/confirm` | Confirmar con el token del enlace, sin sesión |
| `POST /api/password/forgot` | «Olvidé mi contraseña» (respuesta neutra `202`) |
| `POST /api/institution-accounts/password-setup`, `…/password-reset` | Establecer o restablecer la contraseña con el enlace de un solo uso (para cualquier rol) |
| `GET /api/dashboard` | Indicadores del inicio según el rol |

## Gobierno de cuentas y organizaciones

| Método y ruta | Para qué |
|---|---|
| `GET, POST /api/institutions` · `GET, PUT /api/institutions/{id}` · `PATCH …/status` | Instituciones (ADMIN) |
| `GET /api/institutions/{id}/accounts` · `PATCH …/accounts/{account}/email` | Cuentas de una institución y corrección del correo de una cuenta pendiente |
| `POST /api/institution-accounts` · `…/resend-setup` · `…/password-reset/start` | Invitar cuentas institucionales, reenviar el enlace e iniciar un restablecimiento |
| `GET, POST /api/admin-accounts` · `PATCH …/{account}/status` · `PATCH …/{account}/email` · `POST …/resend-setup` · `POST …/password-reset/start` | Cuentas de Administración |
| `GET, POST /api/secretary-accounts` · mismas operaciones | Cuentas de la Secretaría (ADMIN y SECRETARY) |
| `GET, POST /api/companies` · `GET, PUT /api/companies/{id}` · `PATCH …/status` | Empresas validadas (SECRETARY) |
| `GET, POST /api/companies/{id}/accounts` · `PATCH …/accounts/{account}/status` · `PATCH …/accounts/{account}/email` · `POST …/resend-setup` · `POST …/password-reset/start` | Cuentas de una empresa |
| `GET, PUT /api/organization/profile` · `POST …/postpone` | Perfil de la organización de la sesión, y posponer su llenado (INSTITUTION y COMPANY) |

## Alumnos (institución)

| Método y ruta | Para qué |
|---|---|
| `GET, POST /api/students` · `GET /api/students/{id}` | Padrón con búsqueda y filtros, alta y detalle |
| `PUT …/{id}/profile` · `PUT …/{id}/identity` · `PATCH …/{id}/status` | Expediente académico y geográfico, identidad y baja lógica |
| `GET, PUT …/{id}/social-security` · `POST, GET …/{id}/social-security/document` | Seguro facultativo, y subida o descarga del comprobante PDF |
| `GET …/{id}/cv` · `PUT …/cv/headline`, `…/skills`, `…/languages`, `…/certifications`, `…/projects`, `…/links` | CV normalizado: cada lista se reemplaza completa |
| `PATCH …/{id}/cv/certifications/{certification}/verification` | La institución verifica una certificación |

## Catálogos

| Método y ruta | Para qué |
|---|---|
| `GET /api/catalogs/states/{state}/municipalities` | Municipios INEGI de un estado (`01` a `32`) |
| `GET /api/skills` | Autocompletado de habilidades (INSTITUTION y COMPANY) |

## Búsqueda, oportunidades y vinculación

| Método y ruta | Para qué |
|---|---|
| `GET /api/talent` · `GET /api/talent/{publicId}` | Buscador anónimo y perfil público (COMPANY). Filtros: carrera, habilidades, idiomas, certificaciones y radio en km desde un municipio |
| `GET, POST /api/opportunities` · `GET …/defaults` · `GET …/options` · `GET, PUT …/{id}` · `PATCH …/{id}/status` | Oportunidades Duales de la empresa |
| `GET, POST /api/linkage-requests` · `GET …/{id}` · `PATCH …/{id}/cancel` · `PATCH …/{id}/termination` | Solicitudes de la empresa |
| `GET /api/linkage-requests/{id}/disclosure` | Ficha compartida vigente |
| `GET /api/institution/linkage-requests` · `GET …/export.csv` · `GET …/{id}` · `PATCH …/{id}/decision` · `PATCH …/{id}/termination` | Bandeja institucional |
| `POST /api/institution/linkage-requests/{id}/disclosure` · `PATCH …/disclosure/revoke` | Compartir o dejar de compartir la ficha |
| `GET, POST …/{id}/messages` · `POST …/{id}/messages/read` · `GET …/unread-summary` | Conversación de la vinculación (en ambas bandejas) |

## Medios y promoción

| Método y ruta | Para qué |
|---|---|
| `GET, POST /api/institution/videos` · `PUT …/{video}` · `PATCH …/{video}/status` · `PATCH …/{video}/deletion` | Videos de la institución. La subida responde `202` y el procesamiento sigue en la cola |
| `GET /api/promotional-videos` · `PATCH …/{video}/status` | Galería (los 4 roles) e inactivación (ADMIN) |
| `GET /api/media/{path}` | Medios del disco local con URL firmada (sin uso con `MEDIA_DISK=s3`) |

## Seguimiento

| Método y ruta | Para qué |
|---|---|
| `GET /api/reports/dual-program` · `GET …/export.csv` | Reporte ejecutivo: solo conteos agregados (ADMIN y SECRETARY) |
| `GET /api/audit-events` | Bitácora (ADMIN) |
| `GET /up` | Salud de la aplicación (Laravel), para la prueba de humo |

## Fuentes en el repositorio

- `backend/routes/api.php`, `backend/routes/web.php`
- `backend/bootstrap/app.php` (respuestas JSON de error)
- `backend/app/Http/Controllers/` (constantes `PER_PAGE`)
- `docs/HU-*.md` (contrato por historia)
