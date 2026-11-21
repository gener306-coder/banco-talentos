# Auditoría QA integral previa a producción

Fecha: 20 y 21 de noviembre de 2026. Rama: `chore/qa-pre-release-audit` (desde `main`, `e0f2993`), sin push.

## 1. Veredicto

**Listo con pendientes de infraestructura.**

- No se encontraron vulnerabilidades críticas ni altas en el código propio. Tampoco fugas de datos privados del alumno, IDOR ni inyección SQL.
- Las dependencias quedaron sin avisos de seguridad.
- Se corrigieron siete hallazgos de severidad media y baja (sección 2). Cada uno tiene su prueba de regresión.
- Antes de publicar falta configurar el entorno: `.env` de producción, servidor web con HTTPS, HSTS y CSP, y los datos jurídicos opcionales (sección 3).

## 2. Hallazgos corregidos

| # | Severidad | Área | Descripción | Causa raíz | Prueba de regresión | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Alta | Dependencias | Avisos de seguridad en Symfony (routing, http-foundation, http-kernel, filesystem: omisión de reglas por ruta o por HEAD, host elegido por el cliente, proxies de confianza) y en Laravel (baja). En npm, 3 altos (vite, zod, undici) y 11 moderados (cadena de eslint, typescript-eslint y vitest). | Versiones con parches pendientes en `composer.lock` y `package-lock.json`. | `composer audit` y `npm audit` en 0; Pest, Vitest y E2E completos en verde tras actualizar. | `c47bc49` |
| 2 | Media | Seguridad HTTP | `Cache-Control: no-store, private` dependía de cada controlador. El catálogo de habilidades y todas las respuestas de error (401, 403, 404, 422, 429) salían con `no-cache`, que permite guardar copias. No había `X-Frame-Options` ni `Referrer-Policy` en la API. | No existía una política global de cabeceras. | `ApiSecurityMatrixTest`: cabeceras en respuestas correctas y de error. | `add0fc3` |
| 3 | Media | Disponibilidad (DoS) | Sin límite de peticiones en la subida de videos (hasta cientos de MB y procesamiento con ffmpeg), en la de comprobantes del seguro y en las exportaciones CSV, que recorren tablas completas. | Las rutas de API no tienen límite global; solo se habían limitado el acceso, la búsqueda, los mensajes y las cuentas. | `ApiSecurityMatrixTest`: `throttle:uploads` (20/min por cuenta) y `throttle:exports` (10/min). | `add0fc3` |
| 4 | Media | Robustez del frontend | Una excepción al pintar cualquier vista dejaba la aplicación en blanco, sin encabezado ni forma de volver. | No había un límite de errores (Error Boundary). | `RouteErrorBoundary.test.tsx`. `AppShell.test.tsx` sigue verificando que no se remonte el árbol. | `d5b3c26` |
| 5 | Baja | Coherencia legal | El Aviso de Privacidad no mencionaba que la empresa ve la institución, el estado y el municipio del alumno, que `/api/talent` sí devuelve. | El texto describía un subconjunto de los campos del perfil disociado. | `LegalPage.test.tsx` comprueba el texto exacto. | `6c66a80` |
| 6 | Baja | Prevención | No había una prueba que impidiera agregar una ruta de API sin sesión, cuenta activa o rol, ni una ruta `DELETE`. | Las protecciones existían ruta por ruta, sin una red general. | `ApiSecurityMatrixTest`: matriz por introspección de todas las rutas. | `add0fc3` |
| 7 | Baja | Rendimiento | No había una guarda automática contra consultas N+1 en los listados con más tráfico. | No se medía; la revisión manual no encontró N+1. | `QueryScalingTest`: bandejas de empresa e institución, padrón y búsqueda de talento, con el mismo número de consultas con 2 y con 6 filas. | `f05e9b3` |
| — | — | Navegador real | El recorrido en Chromium no encontró errores, pero quedó como prueba permanente. | — | `e2e/qa-browser-audit.spec.ts`: 20 escenarios. | `f2e887d` |

## Lo verificado sin hallazgos

### Fase 1: seguridad
- **Matriz de rutas:** 100 % de las rutas `/api` exigen `auth:sanctum`, `active` y `role:`, salvo `login`, `password-setup` y `password-reset` (con límite de intentos) y `media` (con URL firmada `signed:relative`).
- **Inactivación:** si la cuenta o su organización está inactiva, `EnsureUserIsActive` cierra la sesión en la siguiente petición y responde con el código del motivo.
- **Anti-IDOR:**
  - toda consulta de alumnos, solicitudes, mensajes, videos y oportunidades filtra por la organización de la sesión;
  - las cuentas de la Secretaría y de las empresas se acotan por rol y por empresa con `FOR UPDATE`;
  - nadie puede inactivar su propia cuenta;
  - un recurso ajeno responde 404 igual que uno inexistente (cubierto por la suite existente).
- **SQL crudo:** todas las consultas `whereRaw`, `selectRaw`, `orderByRaw` y de PostGIS usan parámetros. Las interpolaciones de `AuditEventController` vienen de constantes internas. `Municipality::locationFor` usa `PDO::quote`.
- **XSS y redirecciones:**
  - no hay `dangerouslySetInnerHTML` ni `innerHTML`;
  - `credential_url` se valida con `SafeHttpsUrl` en el backend y en el frontend;
  - los regresos (`backLink`) solo aceptan rutas internas;
  - los enlaces externos llevan `noopener noreferrer`.
- **CSV:** `CsvExport::neutralize` antepone una comilla a las celdas que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno de carro.
- **Subidas y medios:**
  - el comprobante es PDF validado por extensión, `mimes` y `mimetypes`, en un disco privado; se descarga con `nosniff` y `no-store`;
  - el video es MP4, MOV o WebM con tamaño máximo; se procesa quitando metadatos;
  - `MediaController` limita la ruta con una expresión regular, bloquea `..` y responde `nosniff`.
- **Privacidad:**
  - `/talent` usa una lista explícita de campos, sin identidad, NSS, póliza ni `students.id`;
  - la bitácora guarda solo nombres de campos;
  - los correos y avisos no incluyen el texto de los mensajes;
  - los logs registran solo `user_id`, el tipo de excepción y el `public_id` de los videos, nunca tokens, URLs de contraseña ni datos personales;
  - no hay `dd()`, `dump()` ni `console.log` en el código.

### Fase 2: base de datos
- Las migraciones corren desde cero en cada prueba (`RefreshDatabase`, 1668 pruebas).
- Existen los CHECK de formato del RFC y los índices únicos de RFC, CCT, correo, matrícula por institución (`lower`) y NSS por institución (HMAC).
- `account_audit_events` y `linkage_messages` tienen triggers que impiden editar o borrar.
- No hay N+1 en los listados medidos. Los demás cargan sus relaciones de antemano con campos explícitos (`with([...:id,name])`).

### Fase 3: reglas de negocio
Revisión de código, cubierta por la suite existente:
- el cupo atómico, que bloquea la oportunidad antes que la solicitud;
- el `422` con el cupo lleno;
- no bajar `vacancies` debajo de las aceptadas;
- `BAJA` con chat en solo lectura;
- el `422` de `radius_km` sin origen;
- M1 al publicar y al solicitar;
- el cambio de contraseña: cierra las demás sesiones, rota `remember_token`, invalida tokens y envía el correo;
- los límites de acceso.

### Fase 4: frontend
- Recorrido en Chromium de los 4 roles y el visitante, en 1440 y 390 px y en claro y oscuro: 0 errores de consola, 0 excepciones, 0 peticiones fallidas no intencionales y 0 desbordes.
- `noInai`, `technologies`, `copy` y `tokens` en verde. No quedan textos de borrador.

## 3. Hallazgos no modificados: requieren decisión humana o acción de despliegue

### Obligatorio antes de producción (infraestructura)
1. **`.env` de producción:**
   - `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY` generada y fuera de Git;
   - `APP_URL` y `FRONTEND_URL` con `https://`;
   - `SESSION_SECURE_COOKIE=true`, que el Aviso de Privacidad ya afirma;
   - `SESSION_DOMAIN` y `SANCTUM_STATEFUL_DOMAINS` con el dominio real;
   - `LOG_LEVEL=warning` o `error`;
   - `MAIL_*` del proveedor real;
   - `DB_PASSWORD` robusta;
   - si se usa S3, `MEDIA_DISK=s3` con credenciales de mínimo privilegio.
2. **Servidor web y proxy:** el repositorio no trae su configuración. Debe:
   - servir la SPA y la API en el **mismo sitio**: las cookies son `SameSite=Lax` y CORS va sin credenciales;
   - forzar HTTPS con HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`);
   - enviar una CSP (sugerida: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:` más el bucket si hay S3; `style-src 'self'; script-src 'self'`, revisando el script de tema de `index.html`, que requiere un hash o un nonce; `frame-ancestors 'none'`);
   - enviar `X-Content-Type-Options` y `Referrer-Policy: no-referrer` en los estáticos.
3. **Proxies de confianza:** si hay un balanceador, configurar `trustProxies` con sus IP exactas. No usar `*` ni el atajo `private_ranges` (motivo de uno de los avisos de Symfony).
4. **Worker y planificador:** `php artisan queue:work` para las colas `default` y `videos`, con `ffmpeg` instalado, y el cron de `schedule:run` si aplica. Hay que monitorear la cola de videos.
5. **Respaldos** cifrados de PostgreSQL y del disco privado (`storage/app/private`, comprobantes del seguro).

### Decisiones de negocio o mejoras opcionales (no se tocó el código)
6. **Aceptar una solicitud de una oportunidad inactiva:** hoy la institución puede aceptar una solicitud pendiente cuya oportunidad la empresa inactivó después. Ningún Sprint lo decide. Opciones: bloquearlo con un `422`, o cancelar las pendientes al inactivar la oportunidad.
7. **Unicidad normalizada en la base:** el RFC y el CCT se normalizan en la aplicación (mayúsculas), pero los índices únicos son sobre el valor tal cual. Como defensa en profundidad, valorar índices únicos sobre `upper(cct)` y `upper(rfc)`, verificando antes que no haya duplicados heredados.
8. **Cifrado en reposo:** solo `nss` y `policy_number` usan el cast `encrypted`. Valorar cifrar la identidad del alumno (nombre y matrícula) o cifrar el volumen de la base.
9. **Responsable formal:** completar `controller.address` y, cuando se defina, el régimen y el canal ARCO en `legalConfig.ts` (T-S15-02, nota previa a producción 1).
10. **Límite global de API:** las rutas restantes no tienen límite general. Si se expone a internet sin un WAF, valorar `throttle:api` (por ejemplo, 300/min por cuenta) en el grupo `api`.
11. **CORS:** se usa la configuración por defecto de Laravel (orígenes `*` sin credenciales). Es inocua con cookies `SameSite=Lax`, pero en producción conviene publicar `config/cors.php` con el dominio exacto.

## 4. Resultados finales

| Suite | Resultado |
| --- | --- |
| `composer audit` | sin avisos (antes: 8 avisos en 5 paquetes) |
| `npm audit` | 0 vulnerabilidades (antes: 3 altas y 11 moderadas) |
| `npm run lint` | sin errores ni advertencias |
| `npx tsc -b` | sin errores |
| `npx vitest run` | 1528 de 1528 (71 archivos) |
| `npm run build` | correcto |
| `sh scripts/test-backend.sh` (Pest) | 1672 de 1672 (16 719 aserciones), incluidas las 9 pruebas nuevas de seguridad y N+1 |
| `sh scripts/test-e2e.sh` (Playwright) | 75 de 75: 55 previas y los 20 escenarios nuevos del recorrido en Chromium |
| Chromium (4 roles y visitante, 1440 y 390 px, claro y oscuro) | 20 de 20 escenarios sin errores de consola, peticiones fallidas ni desbordes |
