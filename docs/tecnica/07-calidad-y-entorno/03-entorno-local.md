# Entorno local (Linux, macOS y Windows con WSL 2)

[Índice de la documentación técnica](../README.md)

Todo el entorno corre en contenedores con Docker Compose (`compose.yaml`, proyecto `banco-talentos`). En el equipo solo se necesitan **Docker con Compose v2** y **Git**. PHP, Composer, Node y PostgreSQL viven dentro de las imágenes.

## Servicios

| Servicio | Imagen o construcción | Papel | Dirección predeterminada |
|---|---|---|---|
| `db` | `postgis/postgis:17-3.5` | PostgreSQL 17 + PostGIS 3.5, con el volumen `postgres_data` | `127.0.0.1:5432` |
| `mailpit` | `axllent/mailpit:v1.30.5` | Captura todos los correos (SMTP `mailpit:1025`, solo dentro de la red de Docker) | <http://localhost:8025> |
| `backend` | `docker/backend/Dockerfile` (`php:8.4-cli-bookworm` con FFmpeg, `pdo_pgsql`, `intl`, `zip` y `pcntl`) | API con `php artisan serve` | <http://localhost:8000> (salud: `/up`) |
| `worker` | La misma imagen del backend | `queue:listen --queue=videos,default --timeout=900 --tries=2` | — |
| `frontend` | `docker/frontend/Dockerfile` (`node:24-bookworm-slim`) | Vite en modo desarrollo; reenvía `/api`, `/sanctum` y `/up` al backend | <http://localhost:5173> |

**Puertos y arranque:**
- Los puertos se publican **solo en `127.0.0.1`** y se cambian con `DB_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` y `MAILPIT_PORT` en el `.env` raíz.
- El `backend` espera a que `db` esté sano. El `worker` y el `frontend` esperan a que el `backend` responda en `/up`.

## Variables de entorno

Hay dos archivos `.env`. Ambos están excluidos de Git y ninguno debe versionarse:

| Archivo | Lo lee | Contiene |
|---|---|---|
| `.env` (raíz), copia de `.env.example` | Docker Compose | Credenciales locales de PostgreSQL, los cuatro puertos, y `LOCAL_UID` y `LOCAL_GID` |
| `backend/.env`, copia de `backend/.env.example` | Laravel | `APP_KEY` y opciones de la aplicación. El *entrypoint* del backend lo crea y genera `APP_KEY` si faltan. |

Las variables que Compose pasa al backend (base de datos, `MAIL_*` hacia Mailpit, `APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `QUEUE_CONNECTION=database`) **prevalecen** sobre `backend/.env`. En local, los videos usan el disco `media` y los comprobantes el disco `local`; no hace falta ninguna credencial de AWS.

Cambiar las credenciales de PostgreSQL en `.env` no modifica las de un volumen ya inicializado.

## Primer arranque (los tres sistemas)

```bash
git clone <url-del-repositorio> banco-talentos && cd banco-talentos
cp .env.example .env                      # en Linux y WSL 2: ajusta LOCAL_UID y LOCAL_GID (ver abajo)
docker compose up --build -d              # la primera construcción descarga imágenes y tarda varios minutos
docker compose exec backend php artisan migrate
docker compose exec backend php artisan skills:seed        # 820 habilidades del catálogo semilla
docker compose exec backend php artisan auth:create-user   # interactivo: rol, estado y contraseña
```

**Notas del arranque:**
- **Migraciones.** Se aplican siempre de forma explícita, nunca al arrancar. Tras actualizar el código, vuelve a ejecutar `php artisan migrate`.
- **Catálogo INEGI.** Lo carga su propia migración.
- **`auth:create-user`** solo funciona en local y de forma interactiva. Crea cuentas `ADMIN`, `INSTITUTION` o `SECRETARY`; las cuentas `COMPANY` se crean desde su empresa, con la Secretaría. No hay cuentas ni contraseñas predeterminadas.
- **Abre <http://localhost:5173>.** Usa siempre `localhost` o siempre `127.0.0.1`: sus cookies son distintas y mezclarlos rompe la sesión.

## Correo en local: Mailpit y `mail:preview`

- **Mailpit.** Todo correo que envía la aplicación (invitaciones, restablecimientos, verificación de correo, avisos) llega a <http://localhost:8025>. Nada sale a Internet.
- **Vista previa de las plantillas con marca, sin provocar las acciones:**

  ```bash
  docker compose exec backend php artisan mail:preview                          # HTML en backend/storage/app/mail-previews/
  docker compose exec backend php artisan mail:preview --send=ana@example.test  # además los envía, y llegan a Mailpit
  ```

  El comando se niega a correr con `APP_ENV=production`: sus datos son de ejemplo, y un envío por error llegaría a una persona real.
- **Logotipo.** Los correos lo cargan desde `FRONTEND_URL/brand/logo-correo.png`. En local es la SPA de Vite, así que Mailpit lo muestra mientras el servicio `frontend` esté arriba.

## Linux

- **`LOCAL_UID` y `LOCAL_GID`.** Ponlos en `.env` con los valores de `id -u` e `id -g`. Las imágenes crean el usuario `app` con ese UID y GID, así los archivos que generan los contenedores (`vendor/`, cachés, `storage/`) son tuyos. Si los cambias después, reconstruye con `docker compose up --build -d`.
- **SELinux** (Fedora, RHEL). Los volúmenes llevan `:z` o `:Z` para que el contenedor pueda leerlos; en los demás sistemas no tienen efecto.
- **Docker sin `sudo`.** Agrega tu usuario al grupo `docker` (o usa Docker *rootless*). Los scripts del repositorio llaman a `docker compose` directamente.

## macOS

- **Requisito:** Docker Desktop para Mac (con Compose v2 incluido). `LOCAL_UID` y `LOCAL_GID` no son necesarios: Docker Desktop traduce la propiedad de los archivos montados.
- **Apple Silicon (M1 o posterior, arm64):**
  - `node:24-bookworm-slim`, `php:8.4-cli-bookworm` y `axllent/mailpit:v1.30.5` se publican para arm64 y corren de forma nativa;
  - **`postgis/postgis:17-3.5` solo se publica para amd64** (verificado con `docker manifest inspect` el 25 de noviembre de 2026). Docker Desktop lo descarga y lo ejecuta emulado, con un aviso de plataforma distinta: funciona igual, aunque la base es más lenta;
  - activa en Docker Desktop **«Use Rosetta for x86_64/amd64 emulation on Apple Silicon»** para que la emulación sea más rápida;
  - la imagen de E2E (`docker/testing/Dockerfile.e2e`) instala el Chromium de Playwright para la arquitectura del equipo, también nativa.
- **Rendimiento.** Los montajes de `./backend` y `./frontend` atraviesan la capa de archivos de Docker Desktop. `vendor` y `node_modules` viven en volúmenes (`backend_vendor`, `frontend_node_modules`) precisamente para no pagar ese costo.

## Windows con WSL 2

1. **Instala WSL 2** con una distribución Linux (por ejemplo, Ubuntu) y **Docker Desktop con la integración de WSL 2** activada para esa distribución, o Docker Engine dentro de la propia distribución.
2. **Configura los saltos de línea antes de clonar.** El repositorio no tiene `.gitattributes`, y los scripts (`docker/*/entrypoint.sh`, `scripts/*.sh`, `infra/**/*.sh`) deben conservar `LF`. Con `CRLF`, el contenedor falla con errores como `/bin/sh^M: bad interpreter`. Dentro de WSL:

   ```bash
   git config --global core.autocrlf input
   ```

   No clones desde Git para Windows con `core.autocrlf=true`.
3. **Clona dentro del sistema de archivos de Linux**, por ejemplo en `~/proyectos/banco-talentos`, **nunca en `/mnt/c/...`**. Los montajes desde el disco de Windows son mucho más lentos y no propagan bien los cambios de archivos que vigila Vite.
4. **Sigue la sección de Linux.** Dentro de WSL eres un usuario Linux: pon `LOCAL_UID` y `LOCAL_GID` en `.env`.
5. **Abre <http://localhost:5173> desde el navegador de Windows.** WSL 2 reenvía `localhost` a la distribución.
6. **Edita desde WSL.** Con VS Code, usa la extensión WSL (`code .` dentro de la distribución), para que los archivos se editen en el sistema Linux y conserven `LF`.

## Pruebas en local

```bash
sh scripts/test-backend.sh                 # Pest; un archivo: sh scripts/test-backend.sh -- --filter=NombreTest
docker compose exec frontend npm run test  # Vitest (con el servicio frontend arriba)
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
sh scripts/test-e2e.sh                     # Playwright con Chromium, API real y Mailpit
```

**Siempre en secuencia, nunca en paralelo.** `test-backend.sh` y `test-e2e.sh` comparten el proyecto de Compose `banco-talentos-tests`. No usan los puertos ni el volumen de desarrollo, y limpian sus contenedores al terminar. El detalle está en [Estrategia y conteos de pruebas](02-estrategia-de-pruebas.md).

## Operación diaria

```bash
docker compose ps
docker compose logs -f backend worker frontend db
docker compose exec backend php artisan queue:failed
docker compose down          # conserva postgres_data, backend_vendor y frontend_node_modules
docker compose down -v       # BORRA la base de desarrollo y las dependencias: solo si es deliberado
```

## Documentación técnica

Esta documentación y su PDF se generan también en contenedor: `sh scripts/docs-pdf.sh diagramas` (y, desde T-S20-07, `pdf`). Solo requiere Docker o Podman ([índice](../README.md#generación)).

## Fuentes en el repositorio

- `compose.yaml`, `.env.example`, `backend/.env.example`
- `docker/backend/Dockerfile`, `docker/backend/entrypoint.sh`, `docker/frontend/Dockerfile`, `docker/frontend/entrypoint.sh`
- `docker/testing/Dockerfile.e2e`, `compose.testing.yaml`
- `frontend/vite.config.ts`
- `backend/app/Console/Commands/PreviewMail.php`, `CreateUser.php`, `SeedSkills.php`, `backend/config/mail.php` (`logo_url`)
- `scripts/test-backend.sh`, `scripts/test-e2e.sh`, `scripts/docs-pdf.sh`
- `README.md` (Desarrollo local, Pruebas, Operación local)
