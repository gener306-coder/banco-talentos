# Banco de Talentos – Educación Dual

Monolito modular con las historias del [Sprint 1](docs/sprint-1.md):

- **HU-S1-01 — Autenticación y control de acceso** ([detalle](docs/HU-S1-01.md)).
- **HU-S1-02 — Gestión de instituciones**: ADMIN lista, registra, consulta, edita y activa o inactiva instituciones ([detalle](docs/HU-S1-02.md)).
- **HU-S1-03 — Creación de cuentas institucionales**: ADMIN crea cuentas `INSTITUTION` vinculadas a una institución activa; la persona titular establece su contraseña mediante un enlace enviado por correo ([detalle](docs/HU-S1-03.md)).

No hay registro público ni recuperación de contraseñas ya establecidas.

## Stack y estructura

- Laravel 13 / PHP 8.4, Sanctum 4 con sesiones y CSRF, PostgreSQL 17 + PostGIS 3.5.
- React 19 / TypeScript 5.9 / Vite 8 sobre Node 24.
- Pest, Vitest + React Testing Library y Playwright/Chromium.

```text
backend/                 API, usuarios, instituciones, cuentas institucionales y pruebas Pest
frontend/                Sesión, instituciones, cuentas, contraseña inicial, pruebas React y E2E
docker/                  Imágenes y configuración de desarrollo/pruebas
docs/                    Sprint vigente y documentación técnica de cada historia
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

`auth:create-user` sólo funciona de forma interactiva en el entorno local. Solicita un rol explícito, estado activo y contraseña oculta con confirmación; no hay cuentas o contraseñas predeterminadas. Los usuarios de las pruebas se crean exclusivamente en bases de pruebas. No utilices factories para aprovisionar cuentas reales.

| Servicio | Dirección predeterminada |
| --- | --- |
| SPA | <http://localhost:5173> |
| API | <http://localhost:8000> |
| Salud | <http://localhost:8000/up> |
| PostgreSQL | `localhost:5432` |
| Mailpit (buzón local) | <http://localhost:8025> |

Los puertos se publican sólo en `127.0.0.1` y se configuran mediante `FRONTEND_PORT`, `BACKEND_PORT`, `DB_PORT` y `MAILPIT_PORT`. El SMTP de Mailpit (`mailpit:1025`) sólo es accesible dentro de la red Docker. Utiliza de forma consistente `localhost` o `127.0.0.1`; sus cookies son distintas. Vite reenvía `/api`, `/sanctum` y `/up` al backend. Compose ajusta los dominios de Sanctum al puerto del frontend.

El backend instala dependencias, crea `backend/.env` y genera `APP_KEY` cuando faltan. El frontend ejecuta `npm ci`. **Las migraciones se aplican explícitamente**, no durante el arranque.

## Autenticación y roles

La SPA consulta `GET /api/me` al cargar. Para iniciar sesión obtiene primero `GET /sanctum/csrf-cookie` y envía `POST /api/login` con correo y contraseña. `POST /api/logout` destruye la sesión actual. No se emiten tokens de acceso ni se guardan credenciales en `localStorage` o `sessionStorage`.

La cookie de sesión es `HttpOnly`, de dominio local y `SameSite=Lax`. El cliente envía el token CSRF mediante `X-XSRF-TOKEN`. El identificador de sesión se regenera al autenticar; el cierre de sesión impide reutilizar la cookie anterior. Las sesiones locales expiran tras 120 minutos de inactividad. Las opciones de cookies y duración están en `backend/.env.example`.

Los roles son `ADMIN`, `INSTITUTION`, `COMPANY` y `SECRETARY`. Todos requieren una cuenta activa. Las cuentas `INSTITUTION` requieren además que su institución esté activa. ADMIN dispone de la gestión de instituciones y de cuentas institucionales; `INSTITUTION` ve su institución vinculada; los demás roles conservan identidad y logout. El acceso se restringe tanto en las rutas React como en la API con Sanctum y `role:ADMIN`.

Después de iniciar sesión como ADMIN, abre **Instituciones**. El listado incluye instituciones activas e inactivas. El registro y la edición solicitan nombre, CCT y correo de contacto; el detalle ofrece la acción para activar o inactivar. El CCT es único incluso entre instituciones inactivas y no existe eliminación. Consulta el contrato y la matriz de pruebas en [docs/HU-S1-02.md](docs/HU-S1-02.md).

## Cuentas institucionales

En el detalle de una institución activa, ADMIN crea una cuenta indicando nombre y correo de acceso. El servidor asigna el rol `INSTITUTION` y la institución; ADMIN nunca define ni ve la contraseña. El backend envía al correo registrado un enlace de un solo uso que caduca en 60 minutos. La persona titular lo abre en `/set-initial-password`, establece su contraseña (de 12 caracteres a 72 bytes) y después inicia sesión.

En local los correos llegan a Mailpit (<http://localhost:8025>); inícialo con `docker compose up -d mailpit`. Mientras la cuenta siga pendiente, ADMIN puede reenviar el enlace desde el mismo detalle; el reenvío invalida el enlace anterior. Tras iniciar sesión, `GET /api/me` incluye la institución vinculada.

Si una institución pasa a `INACTIVA`, sus cuentas no pueden iniciar sesión y las sesiones abiertas se invalidan en la siguiente petición. Contrato, flujo de contraseña inicial y cobertura en [docs/HU-S1-03.md](docs/HU-S1-03.md).

Las credenciales incorrectas y las cuentas inactivas producen el mismo mensaje. Con credenciales correctas, una institución inactiva responde `401` con código `INSTITUTION_INACTIVE` y una cuenta pendiente de contraseña inicial con `PASSWORD_SETUP_REQUIRED`. La API devuelve errores JSON controlados: `401` sin sesión válida, `403` por autorización, `419` por CSRF, `422` por validación y `429` al superar los límites de login, configuración o reenvío del enlace. Una cuenta desactivada durante la sesión pierde acceso en su siguiente petición protegida. El frontend trata errores de red sin afirmar que un logout fallido haya cerrado la sesión.

Consulta [backend/README.md](backend/README.md) para detalles del contrato HTTP y del alta local. La matriz de aceptación, los resultados y el inventario de cambios están en [docs/HU-S1-01.md](docs/HU-S1-01.md).

## Pruebas

Ejecuta desde la raíz:

```bash
# PostgreSQL temporal: autenticación, autorización, instituciones y cuentas institucionales
sh scripts/test-backend.sh

# Clientes HTTP, sesión, instituciones, cuentas y configuración de contraseña inicial
# Requiere el servicio frontend de desarrollo iniciado.
docker compose exec frontend npm run test
docker compose exec frontend npm run lint
docker compose exec frontend npm run build

# Chromium + API real: autenticación, instituciones y alta de cuenta → contraseña inicial → login
sh scripts/test-e2e.sh
```

Los scripts usan el proyecto Compose independiente `banco-talentos-tests`, sin puertos publicados ni el volumen PostgreSQL de desarrollo. PostgreSQL utiliza almacenamiento temporal; Pest y E2E tienen bases distintas. Las sesiones, cachés y clave de aplicación de ese entorno también son independientes. Las pruebas Pest comprueban la base de destino antes de aplicar migraciones destructivas.

Cada script limpia sus contenedores y red al terminar; el volumen `test_vendor` conserva sólo dependencias. Ejecuta los dos scripts secuencialmente, porque comparten el proyecto de pruebas. El E2E genera credenciales efímeras separadas para ADMIN e INSTITUTION, no las imprime y no guarda trazas de red. Chromium y sus bibliotecas se instalan en la imagen de pruebas, no en tu equipo ni en el contenedor de desarrollo. La primera construcción requiere Internet y puede tardar varios minutos.

Los tests de roles registran rutas únicamente dentro de Pest para verificar la matriz de acceso sin introducir módulos ficticios en la aplicación. Las pruebas de sesión usan cookies cifradas y archivos reales; no sustituyen el login por `actingAs`. Las pruebas CSRF desactivan únicamente la excepción del framework para el entorno de tests.

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
