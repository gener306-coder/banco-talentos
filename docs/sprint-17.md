# Sprint 17 — Infraestructura y piloto en AWS

Sprint vigente desde el 22 de noviembre de 2026. Sprint anterior: [sprint-16.md](sprint-16.md) (histórico).

**Objetivo del Sprint:** llevar el producto cerrado en `main` (Sprint 16 y auditoría QA, [qa-pre-release-audit.md](qa-pre-release-audit.md)) a un entorno piloto real en AWS:
- barato, inmutable (una AMI por versión) y fácil de destruir y recrear;
- con IaC (Packer y Terraform) y CI/CD en GitHub Actions autenticado por OIDC;
- con correo real (Resend).

**Rama:** `feat/s17-pilot-aws` (desde `main`, `e57cfce`).

**Plan técnico aprobado:** [infra/pilot-aws-plan.md](infra/pilot-aws-plan.md). **Runbook:** [infra/runbook-pilot.md](infra/runbook-pilot.md).

## Decisiones del responsable (22 de noviembre de 2026)

- **D1. Región:** `us-east-1`.
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
- Las 62 pruebas previas siguen en verde.

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

### T-S17-06 — AMI inmutable con Packer

**Estado:** Plantilla completada (22 de noviembre de 2026). La primera construcción real queda pendiente de la cuenta de AWS.

`infra/packer/`:
- Debian 13 arm64;
- PHP 8.4 FPM, ffmpeg y Caddy;
- SSM Agent instalado por `user_data` (A1);
- swap (A2);
- unidades systemd: arranque, colas `videos` y `default`, planificador y respaldo de certificados;
- `bt-boot.sh` (A3);
- `Caddyfile` con HSTS, CSP y caché (A4);
- verificación de cero secretos.

### T-S17-07 — Terraform del piloto

**Estado:** Plantilla completada (22 de noviembre de 2026). El primer `apply` real queda pendiente de la cuenta de AWS.

`infra/terraform/`:
- `bootstrap`: estado, OIDC y roles de GitHub;
- módulos `network`, `storage`, `database`, `compute` y `params`;
- `envs/pilot` con `pilot.tfvars.example`.

### T-S17-08 — Flujos de construcción y despliegue

**Estado:** Plantilla completada (22 de noviembre de 2026). La primera ejecución queda pendiente de la cuenta de AWS.

- `build-ami.yml`: artefacto, `packer build` y limpieza de AMIs.
- `deploy-pilot.yml`:
  - `plan` → aprobación del entorno `pilot` → `apply`;
  - migraciones y `up` por SSM Run Command;
  - smoke HTTPS y de cabeceras.

### T-S17-09 — Primer despliegue real y prueba de recreación

**Estado:** Pendiente (requiere la cuenta de AWS, el subdominio en Hostinger y el dominio verificado en Resend). Sigue `docs/infra/runbook-pilot.md` de principio a fin.
