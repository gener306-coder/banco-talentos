# Banco de Talentos – Educación Dual

Estructura inicial para desarrollo local de un monolito modular. Esta base no implementa historias de usuario.

## Stack

- API REST: Laravel 13 sobre PHP 8.4, con Laravel Sanctum 4 como base de autenticación.
- Frontend: React 19, TypeScript 5.9 y Vite 8 sobre Node.js 24.
- Base de datos: PostgreSQL 17 con PostGIS 3.5.
- Entorno local: Docker Compose, con los servicios `db`, `backend` y `frontend`.
- Herramientas de pruebas: Pest, Vitest + React Testing Library y Playwright.

## Estructura

```text
backend/                  Aplicación Laravel y rutas de API
frontend/                 Aplicación React + TypeScript + Vite
docker/
  backend/                Imagen PHP y arranque de Laravel
  frontend/               Imagen Node.js y arranque de Vite
  postgres/01-postgis.sql  Habilitación inicial de PostGIS
compose.yaml              Servicios, red y volúmenes locales
.env.example              Variables de Compose para desarrollo
AGENTS.md                 Reglas del proyecto
```

Las versiones resueltas de las dependencias se registran en `backend/composer.lock` y `frontend/package-lock.json`.

## Requisitos

Instala Docker Engine o Docker Desktop con el complemento Docker Compose v2. No necesitas instalar PHP, Composer, Node.js ni PostgreSQL en el equipo.

Los puertos locales predeterminados son `5173`, `8000` y `5432`. La primera construcción y la instalación de dependencias requieren acceso a Internet.

## Primer arranque

Desde la raíz del repositorio:

```bash
cp .env.example .env
```

En Linux, consulta tu usuario y grupo con estos comandos y coloca sus valores en `LOCAL_UID` y `LOCAL_GID` dentro del archivo `.env`. Esto permite que los archivos creados por los contenedores pertenezcan a tu usuario.

```bash
id -u
id -g
```

Inicia el entorno:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f
```

El servicio `db` inicializa PostgreSQL y habilita la extensión PostGIS cuando el volumen de datos está vacío. El backend espera a que la base de datos esté disponible; su arranque instala las dependencias con `composer install`, crea `backend/.env` a partir de su ejemplo si no existe y genera `APP_KEY` si está vacía. El frontend espera al backend e instala sus dependencias con `npm ci` antes de iniciar Vite. El primer arranque puede tardar varios minutos.

El entorno no ejecuta migraciones automáticamente ni contiene migraciones de negocio.

## Acceso local

| Servicio | Dirección predeterminada |
| --- | --- |
| Frontend | <http://localhost:5173> |
| Backend | <http://localhost:8000> |
| Salud del backend | <http://localhost:8000/up> |
| PostgreSQL desde el equipo | `localhost:5432` |

Los puertos publicados están vinculados a `127.0.0.1`. Puedes cambiarlos mediante `FRONTEND_PORT`, `BACKEND_PORT` y `DB_PORT` en el `.env` de la raíz.

Vite reenvía las solicitudes `/api` y `/up` al servicio `backend:8000` dentro de Docker. Por ejemplo, <http://localhost:5173/up> llega al endpoint de salud de Laravel. Las futuras llamadas del frontend pueden utilizar rutas relativas `/api/...`. El archivo de rutas de API está vacío; `/api` todavía no ofrece endpoints funcionales y es normal que devuelva `404`.

## Configuración y secretos

El `.env` de la raíz configura Docker Compose. Las variables de conexión a PostgreSQL se pasan al contenedor del backend y prevalecen sobre los valores de `backend/.env`. Dentro de Docker, Laravel utiliza `DB_HOST=db` y `DB_PORT=5432`, independientemente del puerto publicado en el equipo.

Después de modificar el `.env` de la raíz, aplica la configuración con:

```bash
docker compose up -d
```

Si cambias `LOCAL_UID`, `LOCAL_GID` o un Dockerfile, reconstruye las imágenes con `docker compose up --build -d`.

`backend/.env` conserva la clave `APP_KEY` y la configuración local de Laravel. Ambos archivos `.env` están excluidos de Git; los ejemplos contienen únicamente valores de desarrollo. No incluyas secretos en archivos versionados.

Las variables `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` inicializan un volumen de PostgreSQL nuevo. Cambiar sus valores en `.env` no cambia usuarios, contraseñas ni bases de datos de un volumen existente. Para reinicializar con otros valores, utiliza un volumen nuevo; consulta la sección de persistencia antes de eliminar el actual.

## Comandos de desarrollo

El código de `backend/` y `frontend/` se monta directamente en los contenedores. Ejecuta los siguientes comandos desde la raíz, con los servicios iniciados:

```bash
# Estado y registros
docker compose ps
docker compose logs -f backend frontend db

# Laravel y Composer
docker compose exec backend php artisan about
docker compose exec backend php artisan route:list
docker compose exec backend composer validate --strict
docker compose exec backend vendor/bin/pint --test
docker compose exec backend composer test

# TypeScript, compilación y lint del frontend
docker compose exec frontend npm run build
docker compose exec frontend npm run lint
docker compose exec frontend npm run test

# Confirmar la extensión PostGIS
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Version();"'
```

Vitest y React Testing Library están configurados, inicialmente sin casos de prueba. `npm run test` admite una suite vacía; `npm run test:watch` activa el modo interactivo. Playwright tiene configuración base para Chromium y se ejecuta con `docker compose exec frontend npm run test:e2e` cuando se agreguen escenarios E2E y se instale el navegador en el contenedor. La instalación de Chromium no forma parte del arranque local.

Los arranques usan los archivos de bloqueo y no actualizan las versiones de las dependencias. Cuando sea necesario actualizar dependencias de forma explícita, ejecuta estos comandos y revisa los cambios en los archivos de bloqueo antes de versionarlos:

```bash
docker compose exec backend composer update
docker compose exec frontend npm update
```

## Detener y conservar los datos

```bash
docker compose down
```

Este comando detiene y elimina los contenedores y la red, conservando los volúmenes:

- `postgres_data`: datos de PostgreSQL y PostGIS.
- `backend_vendor`: dependencias de Composer.
- `frontend_node_modules`: dependencias de npm.

Para volver a iniciar el entorno, ejecuta `docker compose up -d`.

Solo si quieres reiniciar deliberadamente todo el entorno local, utiliza `docker compose down -v`. **Este comando elimina los datos de PostgreSQL y los volúmenes de dependencias.** El siguiente arranque recreará la base de datos e instalará las dependencias. Los archivos del repositorio y los `.env` locales permanecen en el equipo.
