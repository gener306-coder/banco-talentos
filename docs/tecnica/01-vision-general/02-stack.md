# Stack tecnológico y versiones

[Índice de la documentación técnica](../README.md)

Versiones tomadas de `main` al 25 de noviembre de 2026. «Declarada» es la restricción del manifiesto; «Resuelta» es la versión exacta del archivo de bloqueo, la que se instala y se prueba.

## Backend

| Componente | Declarada | Resuelta | Fuente |
|---|---|---|---|
| PHP | `^8.4` | 8.4 (imagen `php:8.4-cli-bookworm` en local; paquetes `php8.4-*` de Debian 13 en la AMI) | `backend/composer.json`, `docker/backend/Dockerfile`, `infra/packer/scripts/01-base.sh` |
| Laravel | `^13.17` | 13.43.0 | `backend/composer.lock` |
| Laravel Sanctum | `^4.0` | 4.3.3 | `backend/composer.lock` |
| Flysystem S3 | `^3.0` | 3.35.3, con AWS SDK for PHP 3.402.5 | `backend/composer.lock` |
| Pest | `^4.4.1` | 4.7.8, con `pest-plugin-laravel` 4.1.0 y PHPUnit 12.5.33 | `backend/composer.lock` |
| Laravel Pint | `^1.27` | 1.32.1 | `backend/composer.lock` |
| Mockery | `^1.6` | 1.6.15 | `backend/composer.lock` |

## Frontend

| Componente | Declarada | Resuelta | Fuente |
|---|---|---|---|
| Node.js | `24.x` | 24 (imagen `node:24-bookworm-slim` y `setup-node` en CI) | `frontend/package.json`, `docker/frontend/Dockerfile` |
| React y React DOM | `^19.2.0` | 19.3.0 | `frontend/package-lock.json` |
| React Router | `^7.18.4` | 7.18.4 | `frontend/package-lock.json` |
| TypeScript | `~5.9.3` | 5.9.3 | `frontend/package-lock.json` |
| Vite | `^8.0.0` | 8.3.8, con `@vitejs/plugin-react` 6.1.1 | `frontend/package-lock.json` |
| Tailwind CSS | `^4.3.3` | 4.3.3 (`@tailwindcss/vite`, sin Preflight) | `frontend/package-lock.json` |
| Vitest | `^5.0.1` | 5.1.1, con Testing Library React 16.3.3 y jsdom 30.1.1 | `frontend/package-lock.json` |
| Playwright | `^1.63.0` | 1.63.0 (Chromium) | `frontend/package-lock.json` |
| ESLint | `^10.11.0` | 10.15.0, con `typescript-eslint` 8.73.0 | `frontend/package-lock.json` |

## Datos

| Componente | Versión | Fuente |
|---|---|---|
| PostgreSQL | 17. En local, la imagen `postgis/postgis:17-3.5`. En el piloto, RDS con `engine_version = "17"` y actualizaciones menores automáticas. | `compose.yaml`, `infra/terraform/modules/database/` |
| PostGIS | 3.5 en local; la extensión disponible en RDS PostgreSQL 17 | `2026_09_26_000000_enable_postgis_extension.php` |
| Extensiones | `postgis`, `pg_trgm` y `fuzzystrmatch` | migraciones `2026_09_26_*`, `2026_11_11_000001_*` y `2026_11_12_000001_*` |

## Servidor e infraestructura

| Componente | Versión | Fuente |
|---|---|---|
| Sistema operativo de la AMI | Debian 13, arm64, a partir de la AMI oficial de Debian (cuenta `136693071363`) | `infra/packer/banco-talentos.pkr.hcl` |
| Servidor web | Caddy 2.x del repositorio oficial de Caddy, con HTTPS automático | `infra/packer/scripts/01-base.sh` |
| FFmpeg | 7.1 de Debian 13 (`libx264`, `libvpx-vp9`, `libopus`) | `infra/packer/scripts/01-base.sh`, `docs/infra/pilot-aws-plan.md` §1.1 |
| Packer | 1.16.2, plugin `amazon` ≥ 1.3.0 | `.github/workflows/build-ami.yml`, `banco-talentos.pkr.hcl` |
| Terraform | 1.17.2 (exige ≥ 1.10.0) | `.github/workflows/deploy-pilot.yml`, `envs/pilot/versions.tf` |
| Proveedores de Terraform | `hashicorp/aws` 6.73.0 (`~> 6.0`) y `hashicorp/random` 3.9.1 (`~> 3.6`) | `infra/terraform/envs/pilot/.terraform.lock.hcl` |
| Mailpit (solo local) | 1.30.5 | `compose.yaml` |

## CI/CD

Ejecutores `ubuntu-24.04`. Las acciones de terceros están fijadas por SHA del commit, con la versión en un comentario:

| Acción | Versión |
|---|---|
| `actions/checkout` | v7.0.1 |
| `actions/setup-node` | v7.1.0 |
| `shivammathur/setup-php` | 2.40.0 |
| `actions/upload-artifact` y `actions/download-artifact` | v7.0.2 y v8.0.2 |
| `aws-actions/configure-aws-credentials` | v6.3.0 |
| `hashicorp/setup-terraform` | v4.0.1 |
| `hashicorp/setup-packer` | v3.4.0 |

## Herramientas de esta documentación

Mermaid 12.3.0 y Playwright 1.63.0 (Chromium), en la imagen de `docs/tecnica/tools/Dockerfile`, con base `node:24-bookworm-slim`.

## Criterio de fijación

- **Se fija todo lo que cambia el comportamiento de la aplicación o del despliegue:**
  - `composer.lock`, `package-lock.json` y `.terraform.lock.hcl`;
  - las versiones de Terraform y Packer en las variables de los workflows;
  - las acciones de GitHub por SHA.
- **Se acepta una versión flotante con parches de seguridad** en Caddy 2.x, los paquetes de Debian 13 y la versión menor de PostgreSQL 17 en RDS. Lo compensa la [infraestructura inmutable](adr/ADR-003-infraestructura-inmutable.md): cada AMI congela lo que se instaló al construirla, y `99-verify.sh` la verifica antes de publicarla.
- **Las imágenes de Docker** se identifican por etiqueta de versión mayor (`node:24-bookworm-slim`, `php:8.4-cli-bookworm`, `postgis/postgis:17-3.5`), no por digest. Para el piloto no importa, porque la AMI no usa Docker.

## Fuentes en el repositorio

- `backend/composer.json`, `backend/composer.lock`
- `frontend/package.json`, `frontend/package-lock.json`
- `compose.yaml`, `docker/backend/Dockerfile`, `docker/frontend/Dockerfile`
- `.github/workflows/ci.yml`, `.github/workflows/build-ami.yml`, `.github/workflows/deploy-pilot.yml`
- `infra/packer/banco-talentos.pkr.hcl`, `infra/packer/scripts/01-base.sh`
- `infra/terraform/envs/pilot/versions.tf`, `infra/terraform/envs/pilot/.terraform.lock.hcl`, `infra/terraform/modules/database/variables.tf`
- `docs/tecnica/tools/package.json`
