# Banco de Talentos – Educación Dual

Plataforma web que vincula instituciones educativas, empresas y la Secretaría de Economía mediante un Banco de Talentos para la Educación Dual. Monolito modular Laravel + React. Los alumnos no son usuarios: los administra su institución.

La visión completa del proyecto, su arquitectura, el modelo de datos y las diferencias con la propuesta original están en el [Documento General](docs/Banco_de_Talentos_Documento_General.md).

Sprint vigente: [Sprint 7](docs/sprint-7.md), completo. Historias construidas (cada una con su diseño técnico en `docs/HU-SN-0X.md`):

| Sprint | Historias |
|---|---|
| [1](docs/sprint-1.md) | Autenticación y control de acceso; gestión de instituciones; cuentas institucionales; restablecimiento de contraseña iniciado por ADMIN |
| [2](docs/sprint-2.md) | Enlace de invitación manual; padrón estudiantil; expediente académico y geográfico; baja lógica de alumnos |
| [3](docs/sprint-3.md) | CV normalizado; seguro facultativo (IMSS) |
| [4](docs/sprint-4.md) | Cuentas de la Secretaría; empresas validadas y sus cuentas; catálogo INEGI de municipios; buscador de talento anónimo |
| [5](docs/sprint-5.md) | Indicadores del inicio; Oportunidades Duales y su baja lógica; solicitud de vinculación directa; bandeja de la empresa |
| [6](docs/sprint-6.md) | Bandeja institucional; respuesta `ACEPTADA`/`RECHAZADA`; indicadores de vinculación; inactivación y restablecimiento de cuentas de Secretaría y empresa |
| [7](docs/sprint-7.md) | Reporte ejecutivo; exportación CSV; bitácora de trazabilidad; actualización del Documento General |

No hay registro público ni recuperación de contraseña iniciada por la propia cuenta.

## Stack y estructura

- Laravel 13 / PHP 8.4, Sanctum 4 con sesiones y CSRF, PostgreSQL 17 + PostGIS 3.5.
- React 19 / TypeScript 5.9 / Vite 8 sobre Node 24; Tailwind CSS 4 con los tokens de marca de [docs/design/identidad-visual.md](docs/design/identidad-visual.md). Solo tema claro; el modo oscuro está preparado pero no activado (ver «Modo oscuro» en ese documento).
- Pest, Vitest + React Testing Library y Playwright/Chromium.

```text
backend/                 API REST Laravel: acceso, instituciones, empresas, cuentas, alumnos, búsqueda,
                         oportunidades, vinculación, indicadores, reportes, bitácora y pruebas Pest
frontend/                SPA React por módulos (auth, institutions, companies, secretary, students, talent,
                         opportunities, linkage, reports, audit, ui), pruebas Vitest y E2E en frontend/e2e
docker/                  Imágenes y configuración de desarrollo/pruebas
docs/                    Documento General, Sprints, diseño técnico de cada historia e identidad visual (docs/design/)
compose.yaml             Entorno de desarrollo (incluye Mailpit)
compose.testing.yaml     Entorno aislado de pruebas
scripts/test-backend.sh   Ejecuta Pest con PostgreSQL temporal
scripts/test-e2e.sh       Ejecuta Chromium con API y base de pruebas reales
```

`backend/composer.lock` y `frontend/package-lock.json` fijan las dependencias.

## Desarrollo local

Requiere Docker Engine/Desktop con Docker Compose. PHP, Node y PostgreSQL se ejecutan dentro de los contenedores.

La primera vez:

```bash
cp .env.example .env
```

En Linux, configura `LOCAL_UID` y `LOCAL_GID` en `.env` con los resultados de `id -u` e `id -g` para que los archivos generados pertenezcan a tu usuario.

```bash
docker compose up --build -d
docker compose exec backend php artisan migrate
docker compose exec backend php artisan auth:create-user
```

`auth:create-user` sólo funciona de forma interactiva en el entorno local. Solicita un rol explícito (`ADMIN`, `INSTITUTION` o `SECRETARY`; las cuentas `COMPANY` se crean desde su empresa), estado activo y contraseña oculta con confirmación; no hay cuentas o contraseñas predeterminadas. Los usuarios de las pruebas se crean exclusivamente en bases de pruebas. No utilices factories para aprovisionar cuentas reales.

| Servicio | Dirección predeterminada |
| --- | --- |
| SPA | <http://localhost:5173> |
| API | <http://localhost:8000> |
| Salud | <http://localhost:8000/up> |
| PostgreSQL | `localhost:5432` |
| Mailpit (buzón local) | <http://localhost:8025> |

Los puertos se publican sólo en `127.0.0.1` y se configuran mediante `FRONTEND_PORT`, `BACKEND_PORT`, `DB_PORT` y `MAILPIT_PORT`. El SMTP de Mailpit (`mailpit:1025`) sólo es accesible dentro de la red Docker. Utiliza de forma consistente `localhost` o `127.0.0.1`; sus cookies son distintas. Vite reenvía `/api`, `/sanctum` y `/up` al backend. Compose ajusta los dominios de Sanctum al puerto del frontend.

El backend instala dependencias, crea `backend/.env` y genera `APP_KEY` cuando faltan. El frontend ejecuta `npm ci`. **Las migraciones se aplican explícitamente**, no durante el arranque: tras actualizar el código ejecuta `docker compose exec backend php artisan migrate` (por ejemplo, HU-S1-04 añade la tabla `institution_password_reset_tokens`).

## Autenticación y roles

La SPA consulta `GET /api/me` al cargar. Para iniciar sesión obtiene primero `GET /sanctum/csrf-cookie` y envía `POST /api/login` con correo y contraseña. `POST /api/logout` destruye la sesión actual. No se emiten tokens de acceso ni se guardan credenciales en `localStorage` o `sessionStorage`.

La cookie de sesión es `HttpOnly`, de dominio local y `SameSite=Lax`. El cliente envía el token CSRF mediante `X-XSRF-TOKEN`. El identificador de sesión se regenera al autenticar; el cierre de sesión impide reutilizar la cookie anterior. Las sesiones locales expiran tras 120 minutos de inactividad. Las opciones de cookies y duración están en `backend/.env.example`.

Los roles son `ADMIN`, `INSTITUTION`, `COMPANY` y `SECRETARY`. Todos requieren una cuenta activa. Las cuentas `INSTITUTION` y `COMPANY` requieren además que su institución o empresa esté activa.
- ADMIN gestiona las instituciones y sus cuentas, y consulta la bitácora.
- ADMIN y `SECRETARY` gestionan las cuentas de la Secretaría y consultan el reporte ejecutivo.
- `SECRETARY` gestiona las empresas validadas y sus cuentas.
- `INSTITUTION` administra a sus alumnos y responde las solicitudes de vinculación que recibe.
- `COMPANY` busca talento anónimo, gestiona las Oportunidades Duales de su empresa y envía solicitudes de vinculación.

El acceso se restringe tanto en las rutas React como en la API con Sanctum y el middleware `role`.

Después de iniciar sesión como ADMIN, abre **Instituciones**. El listado incluye instituciones activas e inactivas. El registro y la edición solicitan nombre, CCT y correo de contacto; el detalle ofrece la acción para activar o inactivar. El CCT es único incluso entre instituciones inactivas y no existe eliminación. Consulta el contrato y la matriz de pruebas en [docs/HU-S1-02.md](docs/HU-S1-02.md).

## Inicio por rol

La página de inicio (`/`) saluda a la cuenta, ofrece la acción principal de su rol y muestra tarjetas de acceso a sus secciones. Sobre las tarjetas aparecen los indicadores de `GET /api/dashboard` (HU-S5-01), calculados solo con los datos de la organización de la sesión:
- ADMIN: instituciones activas e inactivas, cuentas de la Secretaría activas y pendientes, oportunidades activas de empresas activas y vinculaciones aceptadas;
- `SECRETARY`: empresas activas e inactivas, cuentas de la Secretaría pendientes, oportunidades activas de empresas activas y vinculaciones aceptadas;
- `INSTITUTION`: alumnos activos, visibles en el buscador y con «Municipio por confirmar», y solicitudes de vinculación pendientes de su respuesta. Si hay alumnos por confirmar, un aviso enlaza al padrón; si hay solicitudes pendientes, un aviso destacado enlaza a su bandeja;
- `COMPANY`: perfiles disponibles en el buscador, oportunidades activas de su empresa y solicitudes pendientes de la institución.

Una cuenta sin organización vinculada no recibe indicadores. Si la consulta falla, el inicio muestra un aviso discreto y las secciones siguen disponibles. Contrato y cobertura en [docs/HU-S5-01.md](docs/HU-S5-01.md) y, para oportunidades y solicitudes, en [docs/HU-S6-03.md](docs/HU-S6-03.md).

## Cuentas institucionales

En el detalle de una institución activa, la sección **Cuentas institucionales** abre cada formulario en una hoja (inferior y arrastrable en móvil, panel centrado en escritorio): **Nueva cuenta institucional**, **Reenviar enlace** y **Restablecer contraseña**. ADMIN crea una cuenta indicando nombre y correo de acceso. El servidor asigna el rol `INSTITUTION` y la institución; ADMIN nunca define ni ve la contraseña. El backend envía al correo registrado un enlace de un solo uso que caduca en 60 minutos. La persona titular lo abre en `/set-initial-password`, establece su contraseña (de 12 caracteres a 72 bytes) y después inicia sesión.

En local los correos llegan a Mailpit (<http://localhost:8025>); inícialo con `docker compose up -d mailpit`. Mientras la cuenta siga pendiente, ADMIN puede reenviar el enlace desde el mismo detalle; el reenvío invalida el enlace anterior.

En el alta y en el reenvío, **Entrega del enlace de configuración** permite elegir entre el correo (predeterminado) y **generar un enlace para compartirlo**: no se envía correo y el enlace aparece como texto de solo lectura con el botón **Copiar enlace**. Es el mismo enlace de un solo uso y 60 minutos; compártelo solo con la persona titular. Cada enlace manual queda registrado en el log con el ADMIN que lo generó ([docs/HU-S2-01.md](docs/HU-S2-01.md)). Tras iniciar sesión, `GET /api/me` incluye la institución vinculada.

Si una institución pasa a `INACTIVA`, sus cuentas no pueden iniciar sesión y las sesiones abiertas se invalidan en la siguiente petición. Contrato, flujo de contraseña inicial y cobertura en [docs/HU-S1-03.md](docs/HU-S1-03.md).

### Restablecimiento de contraseña

En el mismo detalle, **Iniciar restablecimiento de contraseña** solicita solo el correo de una cuenta institucional activa que ya estableció su contraseña. ADMIN nunca ve ni escribe contraseñas. El backend envía al correo registrado un enlace de un solo uso que caduca en 60 minutos; la persona titular lo abre en `/reset-password` y establece su nueva contraseña. La contraseña actual sigue vigente hasta entonces; al cambiarla, **todas las sesiones abiertas de esa cuenta se cierran**. Entre dos inicios para la misma cuenta hay que esperar 60 segundos. Las cuentas pendientes de su primera contraseña usan el reenvío del enlace de configuración. Contrato y cobertura en [docs/HU-S1-04.md](docs/HU-S1-04.md).

Las credenciales incorrectas y las cuentas inactivas producen el mismo mensaje. Con credenciales correctas, una institución inactiva responde `401` con código `INSTITUTION_INACTIVE` y una cuenta pendiente de contraseña inicial con `PASSWORD_SETUP_REQUIRED`. La API devuelve errores JSON controlados: `401` sin sesión válida, `403` por autorización, `419` por CSRF, `422` por validación y `429` al superar los límites de login, configuración, reenvío o restablecimiento. Una cuenta desactivada durante la sesión pierde acceso en su siguiente petición protegida. El frontend trata errores de red sin afirmar que un logout fallido haya cerrado la sesión.

Consulta [backend/README.md](backend/README.md) para detalles del contrato HTTP y del alta local. La matriz de aceptación, los resultados y el inventario de cambios están en [docs/HU-S1-01.md](docs/HU-S1-01.md).

## Cuentas de la Secretaría

ADMIN y `SECRETARY` abren **Cuentas de la Secretaría** desde el inicio (`/secretary-accounts`). El listado muestra el nombre, el correo, el estado (activa, pendiente de su primera contraseña o inactiva) y la fecha de alta. **Nueva cuenta de la Secretaría** pide solo nombre y correo: el servidor asigna el rol `SECRETARY` y registra quién creó la cuenta (`created_by`). La persona titular establece su contraseña con el mismo enlace de un solo uso y 60 minutos de las cuentas institucionales, enviado por correo o generado para compartirlo. Mientras siga pendiente, **Reenviar enlace** lo sustituye; hay que esperar un minuto entre dos reenvíos de la misma cuenta. No hay edición de estas cuentas. `SECRETARY` no gestiona instituciones ni sus cuentas. Contrato y cobertura en [docs/HU-S4-01.md](docs/HU-S4-01.md).

Una cuenta que ya estableció su contraseña tiene **Inactivar** (previa confirmación) o **Activar**, y **Restablecer contraseña**. Nadie puede inactivar su propia cuenta. La cuenta inactivada no puede iniciar sesión y su sesión abierta se cierra en la siguiente petición. El restablecimiento envía por correo el mismo enlace de un solo uso y 60 minutos de las cuentas institucionales; la persona titular elige su nueva contraseña en `/reset-password` y sus sesiones abiertas se cierran. Contrato y cobertura en [docs/HU-S6-04.md](docs/HU-S6-04.md).

## Empresas

`SECRETARY` abre **Empresas** desde el inicio (`/companies`). El listado incluye empresas activas e inactivas, de 50 en 50, con búsqueda por razón social, nombre comercial o RFC. **Nueva empresa** pide solo lo esencial, porque la Secretaría ya validó a la empresa:
- **Obligatorios:** razón social, RFC (persona moral o física, guardado en mayúsculas y único aun entre inactivas), sector SCIAN, estado y municipio del catálogo INEGI, y nombre y correo del contacto del programa dual.
- **Opcionales:** nombre comercial, teléfono y folio de validación.

No se pide domicilio ni documentos. El servidor ubica a la empresa en la cabecera de su municipio para la futura búsqueda por distancia y registra qué cuenta la dio de alta. El detalle permite editarla e inactivarla, previa confirmación, o reactivarla; no existe eliminación. Contrato y cobertura en [docs/HU-S4-02.md](docs/HU-S4-02.md).

En el mismo detalle, **Cuentas de la empresa** lista las cuentas `COMPANY` con su estado. Con la empresa activa permite crear nuevas, indicando nombre y correo, y reenviar el enlace de las pendientes. Funcionan igual que las cuentas de la Secretaría: el servidor asigna el rol y la empresa, y la titular establece su contraseña con el enlace de un solo uso. Tras iniciar sesión, la cuenta ve el nombre de su empresa. Si la Secretaría inactiva la empresa, sus cuentas reciben `401` con código `COMPANY_INACTIVE` al iniciar sesión, y las sesiones abiertas se cierran en la siguiente petición. La base de datos impide cuentas `COMPANY` sin empresa, y `auth:create-user` ya no crea cuentas de empresa. Contrato y cobertura en [docs/HU-S4-03.md](docs/HU-S4-03.md).

Con la empresa activa, cada cuenta que ya estableció su contraseña tiene también **Inactivar** (previa confirmación) o **Activar**, y **Restablecer contraseña**, con las mismas reglas que las cuentas de la Secretaría ([docs/HU-S6-04.md](docs/HU-S6-04.md)).

## Buscador de talento

Una cuenta `COMPANY` de una empresa activa abre **Buscar talento** desde el inicio (`/talent`). El panel de filtros combina:
- habilidades, todas requeridas;
- idioma con nivel mínimo;
- carrera, periodo mínimo y certificación revisada;
- disponibilidad dual y para reubicarse;
- estado y distancia máxima (10, 25, 50, 100 o 200 km), medida desde el municipio de la empresa o desde otro municipio del catálogo.

No hay mapa: los resultados son tarjetas anónimas ordenadas por distancia, de 20 en 20. Cada tarjeta muestra titular, carrera, periodo, institución, ubicación aproximada, habilidades, idiomas y disponibilidad. **Ver perfil** (`/talent/:public_id`) muestra el CV público completo, sin botón de contacto. Las empresas nunca reciben la identidad del alumno, el seguro facultativo, los enlaces ni las credenciales, y lo identifican solo por un UUID aleatorio. Solo aparecen alumnos activos de instituciones activas con su expediente capturado. Contrato, nota de privacidad y cobertura en [docs/HU-S4-05.md](docs/HU-S4-05.md).

Desde el perfil, **Solicitar vinculación** abre una hoja para elegir una de las oportunidades activas de la empresa y escribir un mensaje opcional, sin datos de contacto. La solicitud llega directamente a la institución del alumno, queda pendiente de su respuesta y no requiere a la Secretaría. La empresa sigue sin recibir datos personales. No se puede repetir la solicitud para el mismo perfil y oportunidad mientras siga pendiente o aceptada. Si la empresa no tiene oportunidades activas, la hoja ofrece registrar una. Contrato y cobertura en [docs/HU-S5-04.md](docs/HU-S5-04.md).

## Oportunidades Duales

Una cuenta `COMPANY` de una empresa activa abre **Oportunidades Duales** desde el inicio (`/opportunities`). El listado muestra las oportunidades de su empresa, de la más reciente a la más antigua y de 20 en 20, con título, carrera, municipio, lugares, estado y habilidades principales. **Nueva oportunidad** pide:
- título, actividades y objetivos, y lugares disponibles (1 a 50);
- carrera y periodo mínimo (semestre o cuatrimestre, del 1 al 15);
- habilidades requeridas, opcionales, del catálogo compartido;
- idioma con nivel mínimo, opcional;
- estado y municipio, precargados con los de la empresa;
- si requiere que el alumno se reubique.

Los textos no admiten enlaces, correos ni teléfonos. El servidor asigna la empresa y la cuenta que la registró, y ubica la oportunidad en la cabecera de su municipio sin exponer el punto. El detalle permite editarla e inactivarla, previa confirmación, o reactivarla. Una oportunidad inactiva conserva su información y se puede editar, pero no podrá elegirse para nuevas solicitudes de vinculación. No existe eliminación ([docs/HU-S5-03.md](docs/HU-S5-03.md)). Una oportunidad de otra empresa responde igual que una inexistente. Tras actualizar el código aplica las migraciones con `docker compose exec backend php artisan migrate`. Contrato y cobertura en [docs/HU-S5-02.md](docs/HU-S5-02.md).

## Solicitudes de vinculación

Una cuenta `COMPANY` abre **Solicitudes de vinculación** desde el inicio (`/linkage-requests`). La bandeja muestra las solicitudes que envió su empresa, de la más reciente a la más antigua y de 20 en 20, y se puede filtrar por estado: pendiente de la institución, aceptada, rechazada o cancelada. Cada fila enlaza al perfil anónimo y a la oportunidad, y muestra el nombre y el correo de contacto de la institución para coordinar el proceso fuera de la plataforma. Nunca aparece la identidad del alumno. Una solicitud pendiente se puede cancelar, previa confirmación; después se puede volver a solicitar el mismo perfil. El perfil anónimo avisa para qué oportunidades ya se solicitó. Contrato y cobertura en [docs/HU-S5-05.md](docs/HU-S5-05.md).

Una cuenta `INSTITUTION` abre **Solicitudes de vinculación** desde el inicio (`/institution/linkage-requests`) para ver las que las empresas enviaron para sus alumnos, de la más reciente a la más antigua, de 20 en 20 y con filtro por estado. Cada fila identifica al alumno por apellidos, nombre y matrícula, con la empresa, la oportunidad, la fecha y el estado. El detalle (`/institution/linkage-requests/:id`) muestra el mensaje de la empresa, la identidad del alumno con enlace a su expediente, si tiene capturados el NSS y el comprobante del IMSS (sin mostrarlos; si falta alguno, un aviso enlaza al expediente), la oportunidad completa y el contacto del programa dual de la empresa con su correo y teléfono. Una solicitud para un alumno de otra institución responde igual que una inexistente, y la empresa sigue sin ver la identidad del alumno. Contrato y cobertura en [docs/HU-S6-01.md](docs/HU-S6-01.md).

Mientras una solicitud está pendiente, su detalle ofrece **Aceptar solicitud** o **Rechazar solicitud** con un mensaje opcional para la empresa (hasta 500 caracteres, sin enlaces, correos ni teléfonos), previa confirmación. La respuesta es definitiva: se registra quién respondió y cuándo, y el detalle lo muestra junto con el mensaje. La empresa ve en su bandeja la decisión, la fecha y el mensaje, pero no quién respondió, y ya no puede cancelarla. Tras actualizar el código aplica las migraciones con `docker compose exec backend php artisan migrate`. Contrato y cobertura en [docs/HU-S6-02.md](docs/HU-S6-02.md).

En su bandeja, la institución tiene **Descargar CSV**: un archivo con todas las solicitudes del estado elegido, con folio, fechas, estado, matrícula y nombre del alumno, carrera, empresa con su contacto y oportunidad. Nunca incluye el NSS ni solicitudes de otras instituciones, y los textos que una hoja de cálculo ejecutaría como fórmula se neutralizan. Contrato y cobertura en [docs/HU-S7-02.md](docs/HU-S7-02.md).

## Reporte ejecutivo

`ADMIN` y `SECRETARY` abren **Reporte ejecutivo** desde el inicio (`/reports`). El reporte muestra, solo con conteos agregados:

- las solicitudes de vinculación por estado, con su proporción;
- cada institución educativa con su estado, alumnos activos, perfiles buscables, solicitudes recibidas y aceptadas;
- cada sector SCIAN con empresas activas, oportunidades activas y solicitudes aceptadas.

No incluye nombres, matrículas, NSS ni ubicaciones de alumnos. **Descargar CSV** baja el desglose por institución y por sector en un archivo compatible con Excel. Contrato y cobertura en [docs/HU-S7-01.md](docs/HU-S7-01.md) y, para la exportación, en [docs/HU-S7-02.md](docs/HU-S7-02.md).

## Bitácora

`ADMIN` abre **Bitácora** desde el inicio (`/audit-events`) para revisar, de 30 en 30 y del más reciente al más antiguo, quién creó cada cuenta, empresa y oportunidad, y quién solicitó o respondió cada vinculación. Se puede filtrar por tipo de evento. Cada evento muestra la fecha, la cuenta que lo realizó con su rol y una descripción pública del recurso; nunca contraseñas, tokens, NSS ni la identidad de alumnos. Los eventos salen de las columnas de autoría ya registradas, sin tabla adicional. Contrato y cobertura en [docs/HU-S7-03.md](docs/HU-S7-03.md).

## Alumnos

Una cuenta `INSTITUTION` con institución vinculada ve **Alumnos** en su página de sesión. El padrón (`/students`) lista solo los alumnos de su institución, 50 por página, ordenados por apellidos. **Registrar alumno** abre una hoja que pide matrícula o control interno, nombre(s), primer apellido y segundo apellido opcional; tras guardar queda lista para el siguiente. La matrícula es única dentro de la institución sin distinguir mayúsculas. El servidor asigna la institución, y la matrícula y el nombre se guardan aparte (`student_identities`) como datos de uso exclusivo de la institución. No existe eliminación. Contrato y cobertura en [docs/HU-S2-02.md](docs/HU-S2-02.md).

Los apellidos de cada alumno abren su detalle (`/students/:id`). Ahí **Corregir identidad** permite cambiar la matrícula y el nombre, y el **Expediente público** guarda carrera o programa, periodo actual (semestre o cuatrimestre, del 1 al 15), disponibilidad para el programa dual, estado y municipio (catálogos del INEGI), y disponibilidad para reubicarse. Es la información con la que las empresas podrán encontrar al alumno sin conocer su identidad. Un alumno de otra institución responde igual que uno inexistente. Tras actualizar el código aplica las migraciones con `docker compose exec backend php artisan migrate`. Contrato y cobertura en [docs/HU-S2-03.md](docs/HU-S2-03.md). El municipio se elige del catálogo INEGI con un filtro por texto, y la ubicación aproximada del alumno es la cabecera de ese municipio; los municipios capturados como texto antes del catálogo aparecen como «Municipio por confirmar» ([docs/HU-S4-04.md](docs/HU-S4-04.md)).

El padrón y el detalle muestran el estado de cada alumno (`ACTIVO`/`INACTIVO`). **Inactivar alumno**, tras una confirmación, lo oculta del Banco de Talentos sin borrar nada; **Reactivar alumno** lo devuelve. Un alumno inactivo sigue en el padrón y su expediente se puede editar. No existe eliminación física. Contrato y cobertura en [docs/HU-S2-04.md](docs/HU-S2-04.md).

En el detalle, la sección **Seguro Facultativo (IMSS)** (HU-S3-02) registra el NSS del alumno (11 dígitos con verificador) y sube su comprobante del IMSS en PDF de hasta 2 MB, que se descarga solo con la sesión de la institución. El NSS se guarda cifrado con `APP_KEY` y con un índice ciego HMAC que impide repetirlo en la institución; el PDF queda en el disco privado `storage/app/private`. Nada de esto viaja con el padrón ni con los datos del expediente que se compartirán con empresas. Contrato y decisiones en [docs/HU-S3-02.md](docs/HU-S3-02.md).

Desde el detalle, **CV profesional** (`/students/:id/cv`, HU-S3-01) construye un CV con el mismo formato para cualquier disciplina: titular, habilidades técnicas y blandas (etiquetas con autocompletado de un catálogo compartido), idiomas con nivel MCER o Nativo, certificaciones que la institución puede marcar como revisadas, y proyectos. Los enlaces externos y las credenciales de las certificaciones son protegidos: revelan la identidad y no se mostrarán en la búsqueda de empresas. Los textos públicos rechazan enlaces, correos y teléfonos. Contrato y decisiones en [docs/HU-S3-01.md](docs/HU-S3-01.md).

## Pruebas

Ejecuta desde la raíz:

```bash
# Pest con PostgreSQL temporal (toda la API). Para un solo archivo: sh scripts/test-backend.sh -- --filter=NombreTest
sh scripts/test-backend.sh

# Vitest, ESLint y build de producción. Requiere el servicio frontend de desarrollo iniciado.
docker compose exec frontend npm run test
docker compose exec frontend npm run lint
docker compose exec frontend npm run build

# Chromium + API real + Mailpit: recorridos de cada rol, incluido el flujo completo
# empresa busca → solicita → institución acepta (e2e/talent-search.spec.ts)
sh scripts/test-e2e.sh
```

Los scripts usan el proyecto Compose independiente `banco-talentos-tests`, sin puertos publicados ni el volumen PostgreSQL de desarrollo. PostgreSQL utiliza almacenamiento temporal; Pest y E2E tienen bases distintas. Las sesiones, cachés y clave de aplicación de ese entorno también son independientes. Las pruebas Pest comprueban la base de destino antes de aplicar migraciones destructivas. El E2E incluye un Mailpit efímero, sin puertos publicados, del que lee los correos que envía el backend; Pest no lo utiliza y conserva el mailer `array`.

Cada script limpia sus contenedores y red al terminar; el volumen `test_vendor` conserva sólo dependencias. Ejecuta los dos scripts secuencialmente, porque comparten el proyecto de pruebas. El E2E genera credenciales efímeras separadas para ADMIN e INSTITUTION, no las imprime y no guarda trazas de red. ADMIN e INSTITUTION inician sesión una sola vez (`e2e/admin.setup.ts` y `e2e/institution.setup.ts`); a partir de ellas, `e2e/secretary.setup.ts` y `e2e/company.setup.ts` crean una cuenta `SECRETARY` y una empresa con su cuenta `COMPANY` (T-S5-01). Los escenarios reutilizan esas sesiones, guardadas dentro del contenedor de pruebas en `playwright/.auth/` (excluido de Git), para no agotar el límite de intentos de login. Chromium y sus bibliotecas se instalan en la imagen de pruebas, no en tu equipo ni en el contenedor de desarrollo. La primera construcción requiere Internet y puede tardar varios minutos.

Los tests de roles registran rutas únicamente dentro de Pest para verificar la matriz de acceso sin introducir módulos ficticios en la aplicación. Las pruebas de sesión usan cookies cifradas y archivos reales; no sustituyen el login por `actingAs`. Las pruebas CSRF desactivan únicamente la excepción del framework para el entorno de tests.

## Simulación de carga

Para ver el sistema con volumen de piloto (unos 43 000 alumnos en 16 instituciones, 150 empresas, 600 oportunidades y 5000 solicitudes) existe un entorno aislado, el proyecto Compose `banco-talentos-sim`. Tiene su propia base, clave y storage, y nunca toca los datos de desarrollo ni de pruebas:

```bash
sh scripts/simulation.sh up                     # frontend http://localhost:5180 · API http://localhost:8100
sh scripts/simulation.sh seed                   # datos aleatorios; imprime las cuentas de demostración y su contraseña
sh scripts/simulation.sh seed --fresh --students=15000 --seed=7   # recargar con otro volumen o semilla
sh scripts/simulation.sh benchmark --password=… # p50/p95 de los endpoints principales
sh scripts/simulation.sh explain                # EXPLAIN ANALYZE de las consultas más lentas
sh scripts/simulation.sh down                   # detener conservando los datos (down --purge los borra)
```

Las cuentas de demostración son `admin@sim.test`, `secretaria01@sim.test`, `institucion01-1@sim.test` y `empresa001-1@sim.test`, todas con la misma contraseña. Los comandos `simulation:*` se niegan a correr fuera de `APP_ENV=simulation` y de su base. Los informes quedan en `backend/storage/simulation/`, excluido de Git. Los resultados y las recomendaciones de la primera ejecución están en [docs/simulacion-carga.md](docs/simulacion-carga.md).

## Operación local

```bash
docker compose ps
docker compose logs -f backend frontend db
docker compose exec backend php artisan route:list
docker compose exec backend composer validate --strict
docker compose exec backend composer lint
docker compose down
```

`docker compose down` conserva `postgres_data`, `backend_vendor` y `frontend_node_modules`. Los cambios de código se montan directamente; al modificar `.env` de Compose aplica `docker compose up -d`. Si cambias Dockerfiles o UID/GID, reconstruye con `--build`.

El `.env` raíz configura Compose; `backend/.env` conserva la clave y opciones Laravel. Las variables que Compose pasa al backend prevalecen sobre ese archivo. Ambos `.env` están excluidos de Git. Cambiar las credenciales PostgreSQL en `.env` no modifica las de un volumen ya inicializado.

Sólo para borrar deliberadamente todos los datos y dependencias locales: `docker compose down -v`. Este comando **elimina PostgreSQL de desarrollo**; los scripts de pruebas no lo ejecutan.
