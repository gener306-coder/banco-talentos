# Sprint 17 — Infraestructura y piloto en AWS

Sprint vigente desde el 22 de noviembre de 2026. Sprint anterior: [sprint-16.md](sprint-16.md) (histórico).

**Objetivo del Sprint:** llevar el producto cerrado en `main` (Sprint 16 y auditoría QA, [qa-pre-release-audit.md](qa-pre-release-audit.md)) a un entorno piloto real en AWS:
- barato, inmutable (una AMI por versión) y fácil de destruir y recrear;
- con IaC (Packer y Terraform) y CI/CD en GitHub Actions autenticado por OIDC;
- con correo real (Resend).

**Rama:** `feat/s17-pilot-aws` (desde `main`, `e57cfce`).

**Plan técnico aprobado:** [infra/pilot-aws-plan.md](infra/pilot-aws-plan.md). **Runbook:** [infra/runbook-pilot.md](infra/runbook-pilot.md).

## Decisiones del responsable (22 de noviembre de 2026)

- **D1. Región:** `us-east-2` (Ohio). Cambiada el 22 de noviembre de 2026 desde `us-east-1`: la cuenta nueva (Plan Gratuito) quedó asignada a Ohio y bloquea las demás regiones.
- **D2. Dominio y DNS:**
  - el DNS es externo, en Hostinger: Terraform no crea zonas de Route 53;
  - el dominio es una variable (`piloto.example.com` en `pilot.tfvars.example`) hasta que se configure el subdominio real.
- **D3. Instancia:** `t4g.small` (arm64, Graviton) con 2 GB de swap, para proteger a ffmpeg (VP9) de un OOM.
- **D4. HTTPS (Opción A):** EC2 pública + Elastic IP + Caddy. Sin balanceador, así que no se configura `trustProxies`.
- **D5. SMTP:** Resend (`MAIL_SCHEME=smtps`, puerto 465), intercambiable por SES cambiando solo los parámetros de SSM.
- **D6. Proceso:** este Sprint no reabre el Sprint 16. Sus cambios son tareas técnicas `T-S17-*`, documentadas aquí.

### Ajustes técnicos obligatorios sobre el plan
- **A1.** La AMI base de Debian 13 no trae `amazon-ssm-agent`. El `user_data` de la fuente `amazon-ebs` de Packer instala el `.deb` oficial (`arm64` o `amd64`, detectado en el arranque) antes de que Packer se conecte por Session Manager.
- **A2.** Swap de 2 GB: archivo `/swapfile` persistente en `/etc/fstab`, sobre el EBS de 30 GB.
- **A3. Arranque y reemplazo:**
  - `bt-boot.sh` entra en mantenimiento sin fallar cuando la base está vacía (primer despliegue: `migrate:status` falla porque aún no existe la tabla `migrations`);
  - tras restaurar los certificados ejecuta `chown -R caddy:caddy /var/lib/caddy`, y `caddy` pertenece al grupo `www-data` para usar el socket de PHP-FPM;
  - `aws_instance` fija `associate_public_ip_address = true`, para que la instancia de reemplazo (`create_before_destroy`) tenga salida a SSM y S3 antes de recibir la EIP.
- **A4.** Caddy sirve `/notifications-sw.js` con `Cache-Control: no-cache`, igual que `index.html` y `theme-init.js`.

## Alcance de esta etapa

Aún no hay cuenta de AWS. Esta etapa entrega todo lo verificable en local y en GitHub, sin `apply` ni `build` en vivo:
- la aplicación preparada;
- el CI;
- las plantillas de Packer y Terraform;
- los flujos de construcción y despliegue;
- el runbook.

El primer despliegue real es T-S17-09.

## Fuera de alcance

- Opción B (ALB + ACM), escalado horizontal y alta disponibilidad de RDS (Multi-AZ).
- Zona DNS en Route 53, CloudWatch Logs y alarmas de negocio.
- Cambiar a SES.
- Cifrar la identidad del alumno en la base (auditoría QA, sección 3, #8).

---

## Tareas técnicas

### T-S17-01 — Sprint, plan aprobado y decisiones

**Estado:** Completada (22 de noviembre de 2026).

- Este archivo.
- `docs/infra/pilot-aws-plan.md` actualizado con D1–D6 y A1–A4.
- `CLAUDE.md` apunta al Sprint 17.

### T-S17-02 — Comprobantes del seguro en un disco configurable (S3)

**Estado:** Completada (22 de noviembre de 2026).

**Problema:** `StudentSocialSecurityController` fijaba el disco `local` y calculaba la huella con `Storage::disk('local')->path($path)`. S3 no tiene rutas locales, así que con almacenamiento en S3 la subida fallaba. Además, en una arquitectura inmutable, reemplazar la EC2 borraba los comprobantes.

**Cambio:**
- `config/filesystems.php` agrega `private_documents_disk` (`PRIVATE_DOCUMENTS_DISK`, por defecto `local`);
- el controlador usa ese disco para guardar, reemplazar, borrar y descargar;
- la huella SHA-256 se calcula del archivo subido (`$file->getRealPath()`) antes de guardarlo. Es el mismo contenido y funciona en cualquier disco.

Sin cambios de contrato.

**Pruebas:** `StudentSocialSecurityTest`.
- Nueva: con `PRIVATE_DOCUMENTS_DISK=s3` y un doble de S3 que rechaza `path()`, sube, reemplaza (el anterior desaparece), verifica la huella y descarga con `nosniff` y `no-store`, sin tocar el disco local.
- Nueva: el valor por defecto sigue siendo `local`.
- Las 62 pruebas previas siguen en verde (64 de 64 en el archivo).

### T-S17-03 — Script de tema externo para una CSP sin `'unsafe-inline'`

**Estado:** Completada (22 de noviembre de 2026).

- El script que fija `data-theme` antes del primer pintado pasa de `index.html` a `frontend/public/theme-init.js`.
- Se carga como `<script src="/theme-init.js"></script>`: clásico y síncrono en `<head>`, así sigue evitando el destello.
- Con eso basta `script-src 'self'`. No se usa un hash, porque se rompe con cualquier cambio de formato.

**Prueba:** `src/ui/themeInit.test.ts`.
- `index.html` no tiene `<script>` en línea y carga el archivo en `<head>` antes del módulo.
- El archivo fija `light` o `dark` según la preferencia guardada y el sistema, y tolera un `localStorage` bloqueado.

### T-S17-04 — Variables de producción documentadas

**Estado:** Completada (22 de noviembre de 2026).

`backend/.env.example` documenta las variables del piloto (sección 3 #1 de la auditoría), con valores de ejemplo y sin secretos:
- `PRIVATE_DOCUMENTS_DISK`;
- `DB_SSLMODE`;
- `MAIL_SCHEME`, `MAIL_USERNAME` y `MAIL_PASSWORD`;
- el rol IAM en lugar de llaves.

### T-S17-05 — CI en GitHub Actions

**Estado:** Completada (22 de noviembre de 2026). Pendiente de su primera ejecución en GitHub, al hacer push.

`.github/workflows/ci.yml` (PR y push a `main`; acciones fijadas por SHA; permisos de solo lectura):
- `frontend`: lint, `tsc -b`, Vitest, build y `npm audit --audit-level=high`;
- `backend-lint`: Pint y `composer audit`;
- `backend-tests`: `sh scripts/test-backend.sh`;
- `e2e`: solo con `workflow_dispatch` y la entrada `e2e`, siempre después de `backend-tests`.

**Primera ejecución en GitHub (PR #1, en borrador):**
- Pest pasó en el runner.
- Fallaron dos jobs, por deuda previa que el CI destapó; no por cambios de este Sprint.
  - **`backend-lint`:** Pint nunca había corrido en CI, y 13 archivos de Sprints anteriores tenían estilo pendiente (orden de imports, espacios, llaves). Se corrigieron con `vendor/bin/pint`, solo estilo, y Pest de esos archivos queda en 385 de 385.
  - **`frontend`:** dos carreras de pruebas que en local no se manifestaban.
    - Con rol `COMPANY` o `INSTITUTION`, el menú de mensajes del encabezado consulta `/unread-summary` al montarse, y 4 archivos de `src/institutions` contaban esa consulta como petición administrativa prohibida. Ahora la responden aparte, como ya hacían `SessionPage.test.tsx` y `TalentSearchPage.test.tsx`.
    - La prueba del esqueleto del feed (`PromotionalVideosPage.test.tsx`) recibía la galería al instante, y el esqueleto desaparecía entre dos aserciones. Ahora la prueba decide cuándo llega la respuesta.

**Segunda ejecución:** los tres jobs quedaron en verde, pero Pest reportó «1734 warnings» en lugar de «passed». Sin `backend/.env` (no se versiona), phpdotenv intenta leerlo con `@file_get_contents` en cada prueba, y PHPUnit registra ese aviso aunque esté silenciado. El CI crea un `backend/.env` vacío antes de Pest y de E2E; las variables siguen viniendo de `compose.testing.yaml` y `phpunit.xml`.

### T-S17-06 — AMI inmutable con Packer

**Estado:** Plantilla completada (22 de noviembre de 2026). La primera construcción real queda pendiente de la cuenta de AWS.

`infra/packer/`:
- `banco-talentos.pkr.hcl`: Debian 13 arm64;
- PHP 8.4 FPM, ffmpeg y Caddy;
- SSM Agent instalado por `user_data` (A1);
- swap (A2);
- unidades systemd: arranque, colas `videos` y `default`, planificador y respaldo de certificados;
- `bt-boot.sh` (A3);
- `Caddyfile` con HSTS, CSP y caché (A4);
- verificación de cero secretos (`99-verify.sh`).

**Decisiones de implementación:**
- **Estado fuera del código.** `storage/` y `bootstrap/cache/` son enlaces a `/var/lib/banco-talentos` y `.env` es un enlace a `/run/banco-talentos/.env`. No se usa `LARAVEL_STORAGE_PATH`: `public/index.php` busca el archivo de mantenimiento con una ruta fija.
- **Sin puerto 22, tampoco al construir.** Packer usa un grupo de seguridad sin entradas creado por `bootstrap` (`build_security_group_id`), y borra las llaves temporales (`ssh_clear_authorized_keys`).
- **`.env` literal.** `bt-boot` escribe cada valor entre comillas simples (phpdotenv no interpola `$` ni `${}`) y rechaza comillas simples y saltos de línea. Se verificó con phpdotenv que `$HOME`, `${X}`, `\`, `=` y `#` llegan intactos.
- **Sin `optimize:clear` en el arranque.** Incluye `cache:clear`, que falla con la base vacía; se limpian solo las cachés de archivos (corregido en `94f961a`).
- **CSP con dos orígenes del bucket.** En `us-east-2` el SDK firma con el origen regional (`<bucket>.s3.us-east-2.amazonaws.com`); el global se conserva por si se usa.

### T-S17-07 — Terraform del piloto

**Estado:** Plantilla completada (22 de noviembre de 2026). El primer `apply` real queda pendiente de la cuenta de AWS.

`infra/terraform/`:
- `bootstrap`: estado, OIDC y roles de GitHub;
- módulos `network`, `storage`, `database`, `compute` y `params`;
- `envs/pilot` con `pilot.tfvars.example` y `backend.hcl.example`.

**Decisiones de implementación:**
- `APP_KEY` y `MAIL_PASSWORD` no pasan por Terraform (nunca quedan en su estado): se cargan a mano (runbook, paso 2). `DB_PASSWORD` sale de `random_password`, en un juego de caracteres válido para RDS y para `bt-boot`.
- `SESSION_DOMAIN` no se crea: SSM no admite valores vacíos y su ausencia deja la cookie *host-only*.
- `cpu_credits = "standard"` por defecto (costo predecible); `unlimited` si los videos se procesan lento.
- El rol de despliegue acepta los entornos `pilot` y `pilot-plan` de GitHub; el de AMI, solo `pilot`.

### T-S17-08 — Flujos de construcción y despliegue

**Estado:** Plantilla completada (22 de noviembre de 2026). La primera ejecución queda pendiente de la cuenta de AWS.

- `build-ami.yml`:
  - llama al CI (`workflow_call`) para el mismo commit;
  - arma el artefacto e instala el plugin de Session Manager en el runner;
  - ejecuta `packer build`;
  - limpieza: conserva las 3 AMIs más recientes y las que estén en uso.
- `deploy-pilot.yml`:
  - `plan` → aprobación del entorno `pilot` → `apply`;
  - migraciones y `up` por SSM Run Command;
  - smoke HTTPS y de cabeceras (`infra/scripts/smoke.sh`).
- Precisiones:
  - el plan no se sube como artefacto (contiene la contraseña de la base): el job de aplicación vuelve a planear;
  - `migrate` va sin `--isolated`, porque su candado usa la caché de base de datos, que no existe en el primer despliegue.

### T-S17-09 — Primer despliegue real y prueba de recreación

**Estado:** Pendiente (requiere la cuenta de AWS, el subdominio en Hostinger y el dominio verificado en Resend). Sigue `docs/infra/runbook-pilot.md` de principio a fin.

---

## Verificación de la etapa (22 de noviembre de 2026)

### Aplicación (en secuencia, nunca en paralelo)

| Suite | Resultado |
|---|---|
| `npm run lint` | sin errores |
| `npx tsc -b` | sin errores |
| `npx vitest run` | 1585 de 1585 (76 archivos), incluida `themeInit.test.ts` |
| `npm run build` | correcto; `dist/theme-init.js` y `dist/notifications-sw.js` presentes; `index.html` sin scripts en línea |
| `sh scripts/test-backend.sh` (Pest) | 1734 de 1734 (17 298 aserciones) |
| `sh scripts/test-e2e.sh` (Playwright) | 79 de 79 en 9.4 min |

### Infraestructura (sin AWS)

Ni Packer, ni Terraform, ni Caddy, ni actionlint, ni shellcheck están instalados en la máquina: todo se validó con sus imágenes oficiales de Docker.

| Verificación | Resultado |
|---|---|
| `packer fmt -check`, `packer validate -syntax-only` y `packer validate` completo con el plugin amazon v1.8.4 (Packer 1.16.2) | válido |
| `terraform fmt -recursive -check` y `terraform validate` de `bootstrap` y `envs/pilot` (Terraform 1.17.2, AWS provider 6.73) | válido |
| `tflint --recursive` | sin avisos |
| `caddy validate` y `caddy fmt` (Caddy 2.11.9) | válido |
| Caddy en funcionamiento con `DOMAIN=localhost` | HSTS, CSP, `nosniff` y `no-referrer` sin cabecera `Server`; `no-cache` en `/`, rutas de la SPA, `theme-init.js` y `notifications-sw.js` (A4); `immutable` en `/assets/*` |
| `actionlint` (incluye shellcheck de los `run:`) en `ci.yml`, `build-ami.yml` y `deploy-pilot.yml` | sin avisos |
| `shellcheck` de los scripts de Packer y de `infra/scripts` | sin avisos |

**Simulación del arranque en Debian 13** (contenedor `debian:trixie` con PostGIS 17-3.5 vacío y un `aws` simulado):
- Los paquetes de `01-base.sh` existen y traen PHP 8.4.28 y ffmpeg 7.1.5 con `libx264`, `libvpx-vp9` y `libopus`. Las extensiones requeridas y opcache están presentes, y `php-fpm8.4 -t` acepta el pool.
- `02-app.sh` instala el artefacto de `composer --no-dev` con los enlaces de estado y `.env`.
- `bt-boot.sh` con la base **vacía** (A3):
  - escribe `.env` (`0640 root:www-data`) y `caddy.env`;
  - genera las cachés y aplica `chown caddy:caddy /var/lib/caddy`;
  - avisa sin fallar que no pudo restaurar los certificados;
  - entra en mantenimiento y termina con código 0.
- `migrate --force` (incluida la carga de 2 478 municipios) y `up`. Un segundo arranque informa «esquema al día» y deja la aplicación en línea.

### Ajuste de región (22 de noviembre de 2026)
- Región por defecto `us-east-2` en Packer, Terraform (`bootstrap`, `envs/pilot` y ejemplos), los flujos, `.env.example` y la documentación.
- El runbook usa `aws login` (AWS CLI ≥ 2.32.0) para el acceso local, en lugar de IAM Identity Center.
- Revalidado con Docker: `packer fmt -check` y `validate`, `terraform fmt -check` y `validate` (`bootstrap`, `envs/pilot`), `tflint`, `actionlint` y `shellcheck`, todos sin avisos.
- `build-ami.yml` instala `session-manager-plugin` antes de `packer build`. Las URLs del plugin y del SSM Agent arm64 de `us-east-2` responden 200.

### Pendiente para T-S17-09 (requiere AWS)
- Primera `packer build` real:
  - SSM Agent por `user_data` (A1);
  - Session Manager desde el runner;
  - `systemd-analyze verify` y `caddy validate` dentro de `99-verify.sh`.
- Primer `terraform apply`, certificado real de Let's Encrypt y correo real de Resend.
- Video real con ffmpeg 7.1 en arm64. Las pruebas automatizadas no transcodifican.
- Primera ejecución de `ci.yml` en GitHub, al hacer push.
