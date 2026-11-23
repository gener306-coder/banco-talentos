# Plan técnico: despliegue piloto en AWS (Packer + Terraform + GitHub Actions)

## Contexto
El producto está cerrado en `main` (`e57cfce`, Sprint 16) y la auditoría QA (`docs/qa-pre-release-audit.md`) lo declaró «listo con pendientes de infraestructura» (sección 3: `.env` de producción, HTTPS/HSTS/CSP, worker, respaldos, proxies). Este plan lleva el monolito a un **entorno piloto real en AWS**: barato, inmutable (AMI por versión) y fácil de destruir y recrear. Plan aprobado el 22 de noviembre de 2026, con las decisiones D1–D6 y los ajustes A1–A4 de §6. Se implementa en el **Sprint 17** ([sprint-17.md](../sprint-17.md)) como tareas técnicas `T-S17-*`.

---

## 1. Stack verificado y preparación mínima de la aplicación

### 1.1 Versiones detectadas en el repositorio
| Componente | En el repo | Objetivo en la AMI |
|---|---|---|
| PHP | `^8.4` (`composer.json`), imagen `php:8.4-cli-bookworm` | PHP 8.4 FPM + CLI (paquetes nativos de Debian 13) |
| Extensiones | `pdo_pgsql intl zip pcntl` (Dockerfile) + las de serie (mbstring, openssl, curl, xml/dom para el SDK de AWS, fileinfo, tokenizer, ctype) | `php8.4-{fpm,cli,pgsql,intl,zip,mbstring,xml,curl,bcmath}` (en Debian, pcntl y opcache vienen en `php8.4-cli`) + opcache activado |
| php.ini | `upload_max_filesize=250M`, `post_max_size=260M`, `max_input_time=600` (`docker/backend/php.ini`) | Los mismos valores en `/etc/php/8.4/{fpm,cli}/conf.d/zz-banco-talentos.ini` |
| Laravel / Sanctum | `^13.17` / `^4.0`; `league/flysystem-aws-s3-v3 ^3.0` **ya instalado** | — |
| Composer | `composer:2` | Composer 2.x, solo en CI (la AMI recibe `vendor/` ya armado) |
| Node | `engines: 24.x`; React 19.2, Vite 8, TS ~5.9, Tailwind 4.3 | Node 24 **solo en CI**; la AMI no lleva Node |
| PostgreSQL / PostGIS | `postgis/postgis:17-3.5`; la migración `2026_09_26_000000_enable_postgis_extension` hace `CREATE EXTENSION postgis` | RDS PostgreSQL 17.x (PostGIS 3.5 disponible); el usuario maestro (`rds_superuser`) puede crear la extensión |
| ffmpeg | 5.1 (bookworm), con `libx264`, `libvpx-vp9`, `libopus`, `nice` y `ffprobe` (`VideoProcessor`) | ffmpeg 7.1 de Debian 13, con los mismos códecs. **Riesgo:** es un salto de versión mayor, así que la prueba real de video del runbook es obligatoria |
| Servidor web | Ninguno en el repo (solo `artisan serve` y Vite) | **Caddy 2.x** del repositorio oficial de Caddy (2.11 al 22 de noviembre de 2026) (HTTPS automático) + PHP-FPM |
| Cola | `database`; colas `videos,default`, `--timeout=900 --tries=2` | systemd `queue:work` |
| Planificador | `routes/console.php` **vacío**: hoy no hay tareas programadas | systemd timer de `schedule:run` instalado; hoy no hace nada y queda listo para el futuro |

### 1.2 Persistencia en arquitectura inmutable (hallazgos concretos)
- **Videos (`MEDIA_DISK`):** listos para S3 **sin cambios de código**. `MediaUrl::temporary()` genera URLs prefirmadas cuando el disco no es `local`. `ProcessInstitutionVideo::store()` escribe por flujo (`writeStream`). El disco `s3` usa `key`/`secret` solo si existen: si se dejan vacíos, el SDK toma las credenciales del **IAM Role de la instancia** (sin llaves estáticas).
- **Original del video (`ProcessInstitutionVideo::SOURCE_DISK = 'local'`):** debe quedarse en local, porque ffmpeg necesita una ruta (`$disk->path()`). Es temporal: se borra al terminar el procesamiento. Si se reemplaza la EC2 con un trabajo pendiente, ese video queda en estado fallido con su mensaje y la institución lo sube de nuevo. Es aceptable en el piloto, y el despliegue lo mitiga deteniendo el worker de forma ordenada (ver §4).
- **Comprobantes del seguro: requieren un ajuste mínimo.** `StudentSocialSecurityController` fija `private const DISK = 'local'` y calcula `hash_file('sha256', Storage::disk(self::DISK)->path($path))` (línea 90). `path()` **no existe en S3**. Cambio propuesto (≈10 líneas):
  1. agregar `'private_documents_disk' => env('PRIVATE_DOCUMENTS_DISK', 'local')` en `config/filesystems.php` y leerlo en el controlador en lugar de la constante;
  2. calcular el hash desde el archivo subido (`hash_file('sha256', $file->getRealPath())`) **antes** de `storeAs`. Es el mismo contenido y funciona en cualquier disco;
  3. `download()` y `exists()` ya funcionan en S3, con streaming y las mismas cabeceras `nosniff` y `no-store`;
  4. prueba Pest: con `PRIVATE_DOCUMENTS_DISK=s3` (`Storage::fake('s3')`), subir, verificar `document_sha256` y descargar. El resto de la suite sigue en `local`.
- **Un solo bucket privado** con prefijos que ya existen en las rutas: videos (`MEDIA_DISK=s3`), `imss/<institution_id>/…` (`PRIVATE_DOCUMENTS_DISK=s3`) y `caddy/` (certificados, ver §2).
- **Lo que vive en la EC2 y puede perderse sin daño:** caché de archivos del límite general (`ThrottleApiRequests`), vistas compiladas, archivo de mantenimiento y originales de video en proceso. Las sesiones y la caché (`database`), y la cola (`database`), viven en RDS. Logs: `LOG_CHANNEL=stderr` (ya es el valor de `.env.example`), recogidos por journald.
- **Estado fuera del código:** `storage/` y `bootstrap/cache/` son enlaces simbólicos a `/var/lib/banco-talentos/` (`www-data`), y `.env` es un enlace a `/run/banco-talentos/.env`. El código en `/opt` queda de solo lectura (`root`). *Implementación:* se eligieron enlaces y no `LARAVEL_STORAGE_PATH` porque `public/index.php` busca `storage/framework/maintenance.php` con una ruta fija, y porque PHP-FPM no siempre expone las variables de entorno en `$_ENV`.
- **`APP_KEY` es crítica:** el NSS y la póliza usan el cast `encrypted`. Si se pierde, no hay forma de descifrarlos. Va en SSM `SecureString`, nunca rota sin un plan, y se respalda fuera de AWS (gestor de contraseñas del responsable).

### 1.3 CSP estricta y `index.html`
**Recomendación: extraer el script de tema a `frontend/public/theme-init.js`** y cargarlo con `<script src="/theme-init.js"></script>`: clásico, síncrono y en `<head>`, así sigue evitando el destello.
- Un hash SHA-256 se rompe con cualquier cambio de espacios o comentarios, o si Vite reescribe el HTML, y obliga a sincronizar el `Caddyfile` en cada edición.
- Con el archivo externo basta `script-src 'self'`. Además, Vite copia `public/` tal cual, sin hash en el nombre, así que Caddy le da `Cache-Control: no-cache`.
- Prueba Vitest: `index.html` no contiene `<script>` en línea; el archivo existe y fija `data-theme`.
- `style-src 'self'` es compatible: React aplica `style` por CSSOM (no lo bloquea la CSP), el build emite CSS en archivos y no hay estilos en línea en `index.html`.
- `notifications-sw.js` exige `worker-src 'self'`.

CSP final, que Caddy envía solo en la SPA:
```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: <S3_ORIGIN>;
media-src 'self' blob: <S3_ORIGIN>; connect-src 'self'; worker-src 'self';
font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```
`<S3_ORIGIN>` incluye `https://<bucket>.s3.amazonaws.com` y `https://<bucket>.s3.us-east-1.amazonaws.com`, porque el SDK puede firmar con el punto global o con el regional. No se usa `crossorigin` en `<video>`/`<img>` (verificado con grep), así que **el bucket no necesita CORS**.

### 1.4 Endpoint de salud
**Usar `/up`, que ya existe** (`bootstrap/app.php`, `health: '/up'`) y ya usan los healthchecks de Compose. Está fuera de `/api`, así que `ApiSecurityMatrixTest` no lo ve. No se crea `/api/health`. El smoke check valida `/up` (200) y, aparte, la conexión a la base mediante `php artisan migrate:status` por SSM.

---

## 2. AMI inmutable con Packer (`infra/packer/`)
- **SO base: Debian 13 «trixie» arm64** (AMI oficial de Debian en AWS; `t4g.small`, D3). Trae PHP 8.4 y ffmpeg 7.1 con libx264, libvpx y libopus **nativos**, sin PPAs de terceros. Ubuntu 24.04 trae PHP 8.3 (necesitaría `ondrej/php`). Amazon Linux 2023 no trae ffmpeg.
- **Builder:** `amazon-ebs` con `ssh_interface = "session_manager"`: Packer entra por SSM, así que **tampoco hay puerto 22 durante la construcción**. Usa una instancia temporal con un rol de construcción mínimo.
- **A1:** la AMI de Debian no trae `amazon-ssm-agent`. El `user_data` de la fuente descarga e instala el `.deb` oficial (`arm64` o `amd64`, detectado con `dpkg --print-architecture`) y lo arranca antes de que Packer intente conectarse.
- **A2:** `scripts/01-base.sh` crea `/swapfile` de 2 GB (`chmod 600`, `mkswap`, entrada en `/etc/fstab`, `vm.swappiness=10`), para que ffmpeg (VP9) no sufra OOM en los 2 GB de la `t4g.small`.
- **Archivos:**
  - `banco-talentos.pkr.hcl`: fuente, variables `release_sha`, `artifact_path`, `arch`, `region`;
  - `scripts/01-base.sh`: apt, PHP-FPM, ffmpeg, Caddy (repositorio oficial), `amazon-ssm-agent` (`.deb` oficial de AWS, porque Debian no lo trae), `awscli` v2, `unattended-upgrades`;
  - `scripts/02-app.sh`: descomprime el artefacto en `/opt/banco-talentos/releases/<sha>`, enlace `current`, propietario `root` y lectura para `www-data`;
  - `files/`: `Caddyfile`, `php-fpm pool`, `php.ini`, unidades systemd, `bt-boot.sh`;
  - `scripts/99-verify.sh`: falla la construcción si existe algún `.env`, si `bootstrap/cache/config.php` existe, o si `ffmpeg -encoders` no lista `libx264`, `libvpx-vp9` y `libopus`; al final, `php -m`.
- **Unidades systemd:**
  - `bt-boot.service` (oneshot, `Before=` de php-fpm, caddy y workers): ejecuta el script de arranque;
  - `bt-queue@videos.service` y `bt-queue@default.service`: `php artisan queue:work database --queue=%i --timeout=900 --tries=2 --max-time=3600`, `User=www-data`, `Restart=always`, `KillSignal=SIGTERM`, `TimeoutStopSec=930` (deja terminar el video en curso). Dos procesos separados para que un video largo no frene los correos;
  - `bt-schedule.timer` + `.service`: `schedule:run` cada minuto;
  - `bt-caddy-certs.timer`: sincroniza `/var/lib/caddy` con `s3://…/caddy/` cada día.
- **Arranque (`/usr/local/sbin/bt-boot.sh`, `user_data` mínimo que solo fija `BT_ENV=pilot`):**
  0. **A3:** errores controlados: si falla un paso no crítico (restaurar certificados, revisar migraciones), registra el motivo y continúa;
  1. `aws ssm get-parameters-by-path --path /banco-talentos/pilot/ --with-decryption` escribe `/run/banco-talentos/.env` (tmpfs, `0640 root:www-data`); el enlace `current/backend/.env` apunta ahí. **Nunca toca disco persistente ni la AMI**;
  2. crea las carpetas de `/var/lib/banco-talentos` (estado local);
  3. `aws s3 sync s3://…/caddy/ /var/lib/caddy/` (restaura los certificados: evita reemitir a Let's Encrypt en cada AMI y sus límites de 5 certificados duplicados por semana). Después, `chown -R caddy:caddy /var/lib/caddy` (A3). `caddy` pertenece al grupo `www-data` y el pool de FPM publica su socket con `listen.group = www-data` y `listen.mode = 0660`;
  4. `php artisan config:cache route:cache view:cache event:cache` como `www-data`;
  5. si `migrate:status` muestra migraciones pendientes, **o falla** porque la base está vacía en el primer despliegue (aún no existe la tabla `migrations`, A3), ejecuta `php artisan down --retry=30` sin abortar `bt-boot.service`. El despliegue migra y luego ejecuta `up` (ver §4);
  6. arranca `php8.4-fpm`, `caddy`, `bt-queue@*` y `bt-schedule.timer`.
- **Garantía de cero secretos en la AMI:** el artefacto de CI excluye `.env*` (salvo `.env.example`), `storage/` y `bootstrap/cache/*.php`. `99-verify.sh` lo comprueba. El rol de construcción de Packer **no tiene** `ssm:GetParameter*`.

**Caddyfile (resumen):**
- `{$DOMAIN}`: `encode zstd gzip`; `request_body max_size 260MB` en `/api/institution-videos*`;
- `@backend path /api/* /sanctum/* /up`: `php_fastcgi unix//run/php/php8.4-fpm.sock`, con `root` en `current/backend/public`;
- en la SPA: `root current/frontend`, `try_files {path} /index.html`, `file_server`. `/assets/*` lleva `Cache-Control: public, max-age=31536000, immutable`; `index.html`, `theme-init.js` y `/notifications-sw.js` (A4) llevan `no-cache`;
- cabeceras globales:
  - `Strict-Transport-Security "max-age=31536000; includeSubDomains"`;
  - `X-Content-Type-Options nosniff`;
  - `Referrer-Policy no-referrer`;
  - `X-Frame-Options DENY`;
  - `Permissions-Policy "camera=(), microphone=(), geolocation=()"`;
  - `-Server`;
  - CSP solo en la SPA; la API ya trae sus cabeceras de `ApiSecurityHeaders`;
- HTTP→HTTPS automático.

---

## 3. Terraform (`infra/terraform/`)
```
infra/terraform/
  bootstrap/            # una sola vez, estado local: bucket del estado (versionado, cifrado), proveedor OIDC de GitHub, roles gha-ci-readonly / gha-build-ami / gha-deploy-pilot
  modules/
    network/            # VPC 10.20.0.0/16, 1 subred pública + 2 privadas (2 AZ, exigido por el DB subnet group), IGW, endpoint gateway S3 (gratis). SIN NAT
    storage/            # bucket privado: Block Public Access x4, SSE-S3, versionado + lifecycle (versiones no actuales 30 días, multipart incompletos 7 días), política que niega TLS no seguro
    database/           # RDS PG 17, db.t4g.micro, 20 GB gp3, storage_encrypted, publicly_accessible=false, backup 7 días, rds.force_ssl=1, deletion_protection y final snapshot por variable
    compute/            # IAM role + instance profile, SG, EC2 (ami_id variable, associate_public_ip_address = true por A3), EIP + asociación, alarma CloudWatch de auto-recover, metadata IMDSv2 obligatorio, EBS gp3 30 GB cifrado
    params/             # aws_ssm_parameter de lo que conoce Terraform (DB_HOST, DB_PASSWORD SecureString de random_password, AWS_BUCKET...)
  envs/pilot/           # sin zona Route 53: el DNS vive en Hostinger (D2) y la salida domain_a_record indica el registro A. main.tf, variables.tf, pilot.tfvars, backend.tf (S3 con use_lockfile = true, Terraform >= 1.10, sin DynamoDB)
```
- **Opción A (elegida, D4): EC2 pública + EIP + Caddy.** ~US$32–36 al mes.
  - Sin ALB ni NAT;
  - **No hay proxy delante**: Caddy pasa `REMOTE_ADDR` real por FastCGI, así que **no se configura `trustProxies`** (cumple el punto 4 de la auditoría por omisión);
  - en contra: un solo punto de falla, y el reemplazo de la instancia causa 1–3 min de caída.
- **Opción B: ALB + ACM + EC2 en subred privada.** ~US$85–100 al mes.
  - Cuesta un ALB (~US$16 más LCU) y **un NAT Gateway** (~US$33) o endpoints de interfaz para SSM, SSM Messages, EC2 Messages, logs y SMTP, porque la EC2 privada necesita salida;
  - `trustProxies` sin `*` ni `private_ranges`: `at:` con los **CIDR exactos de las subredes del ALB** (p. ej. `10.20.1.0/24,10.20.2.0/24`), leídos de una variable de entorno. Es seguro porque el SG de la EC2 solo acepta tráfico del SG del ALB, y se confía solo en `X-Forwarded-For` y `X-Forwarded-Proto`;
  - a favor: zero-downtime y escala horizontal. Ninguna de las dos hace falta en el piloto.
- **Security Groups:**
  - `app`: entrada 80/443 desde `0.0.0.0/0` y `::/0`; **ningún 22**; salida 443 (S3, SSM, ACME), 465 y 587 (SMTP; AWS bloquea el 25) y 5432 hacia `db`;
  - `db`: 5432 solo desde `app`.
- **IAM Role de la EC2 (mínimo privilegio):**
  - `AmazonSSMManagedInstanceCore` (Session Manager y Run Command);
  - `ssm:GetParametersByPath` y `GetParameter` sobre `arn:…:parameter/banco-talentos/pilot/*`;
  - `kms:Decrypt` de la llave `alias/aws/ssm`;
  - `s3:GetObject`, `PutObject` y `DeleteObject` sobre `bucket/*`;
  - `s3:ListBucket` sobre el bucket.
  - Nada más.
- **Cumplimiento de la auditoría, sección 3:**
  - #1: los parámetros SSM de §5 (`APP_ENV=production`, `APP_DEBUG=false`, `SESSION_SECURE_COOKIE=true`, `CORS_ALLOWED_ORIGINS=https://<dominio>`, `LOG_LEVEL=warning`, `DB_SSLMODE=require`, `DB_PASSWORD` de 32 caracteres aleatorios);
  - #2: el Caddyfile;
  - #3: un servidor, contador exacto;
  - #4: no aplica en la Opción A;
  - #5: unidades systemd;
  - #6: RDS cifrado con snapshots de 7 días, y bucket cifrado y versionado.
- **Costo mensual aproximado (us-east-1, bajo demanda):**

  | Recurso | US$/mes |
  |---|---|
  | EC2 t3.small (t4g.small) | 15.2 (12.3) |
  | EBS gp3 30 GB | 2.4 |
  | IPv4 pública/EIP | 3.7 |
  | RDS db.t4g.micro single-AZ | 11.7 |
  | RDS gp3 20 GB | 2.3 |
  | S3 (< 10 GB) | < 1 |
  | SSM Standard, KMS gestionada, endpoint S3 | 0 |
    | **Total con `t4g.small` (D3)** | **≈ 33** |

  En `mx-central-1`, el total sube ~15–25 %.
- **Apagar o destruir:**
  - pausa barata: `aws ec2 stop-instances` y `aws rds stop-db-instance`. RDS se reinicia solo a los 7 días; se paga solo EBS, EIP y almacenamiento (≈ US$9);
  - destruir: snapshot manual de RDS y `aws s3 sync` del bucket si se quieren conservar los datos; después, `terraform destroy -var-file=pilot.tfvars` con `deletion_protection=false` y `force_destroy=true`, que son explícitos en `pilot.tfvars`;
  - `bootstrap/` se conserva, porque es el estado y el OIDC.

---

## 4. CI/CD en GitHub Actions (`.github/workflows/`)
- **OIDC:** `aws-actions/configure-aws-credentials` con `role-to-assume`, `permissions: id-token: write`. Las *trust policies* limitan `sub`:
  - `gha-build-ami` y `gha-deploy-pilot` solo aceptan `repo:<org>/banco-talentos:environment:pilot`;
  - el entorno `pilot` de GitHub exige aprobación manual.
  - Cero llaves estáticas.
- **`ci.yml`** (PR y push a `main`; las acciones van fijadas por SHA):
  - `frontend`: Node 24, `npm ci`, `npm run lint`, `npx tsc -b`, `npx vitest run`, `npm run build`, `npm audit --audit-level=high`;
  - `backend-lint`: PHP 8.4, `composer install`, `composer lint` (Pint), `composer audit`;
  - `backend-tests`: **`sh scripts/test-backend.sh`**. Reutiliza `compose.testing.yaml` (PostGIS 17-3.5 en tmpfs, la misma imagen de desarrollo) y Docker ya viene en `ubuntu-latest`. Un solo camino de pruebas, sin duplicar configuración;
  - `e2e` (opcional, `workflow_dispatch` o nocturno, ~9 min): `sh scripts/test-e2e.sh`, siempre **después** del job de Pest y nunca en paralelo, porque comparten el proyecto Compose.
- **`build-ami.yml`** (`workflow_dispatch` o tag `v*`; requiere el CI en verde para ese SHA):
  1. `composer install --no-dev --optimize-autoloader --classmap-authoritative`;
  2. `npm ci && npm run build`;
  3. arma `release-<sha>.tar.gz` (`backend/` sin `tests`, `.env*` ni `storage`; `frontend/dist` como `frontend/`);
  4. `packer init && packer validate && packer build -var release_sha=…`;
  5. etiqueta la AMI (`Release=<sha>`, `App=banco-talentos`) y publica su `ami_id` en el resumen del job;
  6. limpieza: conserva las 3 AMI más recientes y sus snapshots.
- **`deploy-pilot.yml`** (`workflow_dispatch`, entrada `ami_id` o «última AMI etiquetada»; entorno `pilot`):
  1. `terraform plan` en el entorno `pilot-plan`, visible en el resumen. El job de aplicación (entorno `pilot`, con aprobación) vuelve a planear con las mismas entradas: el plan no se sube como artefacto porque contiene la contraseña de la base;
  2. antes del reemplazo, `aws ssm send-command` a la instancia actual: `systemctl stop bt-queue@*` (drena el video en curso con `TimeoutStopSec`) y `aws s3 sync` de los certificados;
  3. `terraform apply`. `aws_instance` usa `create_before_destroy`, la EIP se reasocia a la nueva y la vieja se destruye;
  4. espera a que la instancia nueva esté `Online` en SSM;
  5. Run Command: `bt-artisan migrate --force && bt-artisan up` y reinicio de los workers. Va **sin `--isolated`**, porque su candado vive en la caché de base de datos, cuya tabla no existe en el primer despliegue (un solo servidor, sin carreras);
  6. smoke:
     - `curl -fsS https://<dominio>/up`;
     - `curl -sI https://<dominio>/` comprueba `strict-transport-security`, `content-security-policy`, `x-content-type-options: nosniff` y `referrer-policy: no-referrer`;
     - `curl -sI https://<dominio>/api/me` responde 401 JSON con `cache-control: no-store`;
     - HTTP redirige a HTTPS;
     - el certificado es válido.
  - Si el smoke falla: volver a desplegar con el `ami_id` anterior. Las migraciones deben ser compatibles hacia atrás, como ya es la norma del repo.

---

## 5. Correo SMTP y runbook

### 5.1 Parámetros SSM `/banco-talentos/pilot/*` (SecureString donde hay secreto)
`APP_NAME`, `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY`🔒, `APP_URL=https://<dominio>`, `FRONTEND_URL=https://<dominio>`, `CORS_ALLOWED_ORIGINS=https://<dominio>`, `APP_LOCALE=es`, `LOG_CHANNEL=stderr`, `LOG_LEVEL=warning`, `DB_CONNECTION=pgsql`, `DB_HOST`, `DB_PORT=5432`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`🔒, `DB_SSLMODE=require`, `CACHE_STORE=database`, `SESSION_DRIVER=database`, `SESSION_SECURE_COOKIE=true`, `SESSION_SAME_SITE=lax`, `SESSION_DOMAIN=` (vacío: cookie *host-only*, más estricta que el dominio con subdominios), `SANCTUM_STATEFUL_DOMAINS=<dominio>`, `QUEUE_CONNECTION=database`, `MEDIA_DISK=s3`, `PRIVATE_DOCUMENTS_DISK=s3`, `AWS_DEFAULT_REGION`, `AWS_BUCKET` (**sin** `AWS_ACCESS_KEY_ID`/`SECRET`), `MAIL_*`.

Proveedor elegido: **Resend** (D5). Brevo queda como referencia.

| | Resend | Brevo |
|---|---|---|
| `MAIL_MAILER` | `smtp` | `smtp` |
| `MAIL_SCHEME` (Laravel 13, en lugar de `MAIL_ENCRYPTION`) | `smtps` | `smtp` (STARTTLS) |
| `MAIL_HOST` / `MAIL_PORT` | `smtp.resend.com` / `465` | `smtp-relay.brevo.com` / `587` |
| `MAIL_USERNAME` / `MAIL_PASSWORD`🔒 | `resend` / API key | login SMTP (`…@smtp-brevo.com`) / llave SMTP |
| `MAIL_FROM_ADDRESS` | `no-reply@<dominio>` | igual |
| Límite gratuito | 3 000/mes, **100/día**, 1 dominio | **300/día** |
| DNS | TXT `resend._domainkey` (DKIM); en `send.<dominio>`: MX `feedback-smtp.<región>.amazonses.com` + TXT `v=spf1 include:amazonses.com ~all`; DMARC recomendado | TXT `brevo-code:…`; CNAME `brevo1._domainkey` y `brevo2._domainkey` (DKIM); **DMARC obligatorio** `_dmarc` `v=DMARC1; p=none; rua=mailto:…` |

Cambiar a SES después solo cambia los `MAIL_*` y el DNS: no hay cambios de código.

### 5.2 Runbook del primer despliegue
1. Cuenta AWS: MFA en root y usuario administrador con SSO. `terraform -chdir=infra/terraform/bootstrap apply` crea el estado, el OIDC y los roles.
2. Generar `APP_KEY` en local (`php artisan key:generate --show`), guardarla en el gestor de contraseñas y cargarla con `aws ssm put-parameter --type SecureString`. Cargar también `MAIL_PASSWORD`.
3. Verificar el dominio en Resend o Brevo y crear sus registros DNS (SPF, DKIM y DMARC).
4. `terraform apply` de `envs/pilot` con `ami_id` de la primera AMI (`build-ami.yml`). Crear en **Hostinger** el registro **A `<subdominio>` → EIP** (salida `domain_a_record`) y esperar la propagación: Caddy emite el certificado al resolver.
5. `deploy-pilot.yml` corre las migraciones, ejecuta `up` y el smoke.
6. Cargar los catálogos que el repo ya prevé (municipios INEGI y habilidades; ver `scripts/inegi`, `scripts/skills` y `SeedSkills`) por SSM Run Command.
7. `aws ssm start-session` y luego `sudo -u www-data php artisan admin:bootstrap <correo>`. Llega el correo de contraseña inicial: valida el SMTP real.
8. Prueba funcional real:
   - el administrador crea una institución y su cuenta (correo de invitación);
   - la institución sube un comprobante PDF y lo descarga (S3, `PRIVATE_DOCUMENTS_DISK`);
   - sube un video MP4 de ~50 MB: pasa a «publicado», se reproduce y la URL prefirmada sale del bucket (ffmpeg 7.1, cola `videos`, CSP `media-src`);
   - consola del navegador sin violaciones de CSP en los 4 roles, en claro y oscuro;
   - «Olvidé mi contraseña» entrega el correo.
9. Recreación de prueba: desplegar la misma AMI otra vez. Comprobar que video, PDF, sesión y certificado sobreviven al reemplazo de la EC2.

---

## 6. Decisiones abiertas y fases

### Decisiones confirmadas (22 de noviembre de 2026)
1. **D1. Región:** `us-east-1`.
2. **D2. DNS:** externo, en **Hostinger**. Terraform no crea zonas de Route 53. El dominio es una variable (`piloto.example.com` en `pilot.tfvars.example`).
3. **D3. Instancia:** `t4g.small` (arm64, Graviton), con 2 GB de swap.
4. **D4. HTTPS:** Opción A (EC2 pública + EIP + Caddy).
5. **D5. SMTP:** Resend (`MAIL_SCHEME=smtps`, puerto 465), intercambiable por SES en SSM.
6. **D6. Proceso:** Sprint 17 ([sprint-17.md](../sprint-17.md)), rama `feat/s17-pilot-aws`. No reabre el Sprint 16.

### Ajustes técnicos obligatorios
- **A1.** Packer instala `amazon-ssm-agent` desde el `user_data` de la fuente, con la arquitectura detectada, antes de conectarse por Session Manager.
- **A2.** Swap de 2 GB persistente (`/etc/fstab`) sobre el EBS de 30 GB.
- **A3.** `bt-boot.sh` tolera la base vacía (entra en mantenimiento sin fallar) y ejecuta `chown -R caddy:caddy /var/lib/caddy` tras restaurar los certificados; `caddy` pertenece a `www-data` por el socket de FPM; `associate_public_ip_address = true` en la instancia.
- **A4.** `/notifications-sw.js` se sirve con `Cache-Control: no-cache`.

### Orden de implementación (rama `feat/s17-pilot-aws`)
- **F1. Aplicación:**
  - disco configurable de comprobantes + hash desde el archivo subido + prueba Pest;
  - `theme-init.js` + prueba Vitest;
  - documentar las variables de producción en `backend/.env.example`;
  - suites completas en verde (`test-backend.sh` y luego `test-e2e.sh`, en secuencia).
- **F2. CI:** `ci.yml` (no requiere AWS y valida F1 en GitHub).
- **F3. Terraform bootstrap:** estado, OIDC y roles.
- **F4. Packer** y `build-ami.yml`: primera AMI y verificación de `99-verify.sh`.
- **F5. Terraform `envs/pilot`:** red, bucket, RDS, cómputo y parámetros.
- **F6. `deploy-pilot.yml`** + DNS + SMTP + runbook (§5.2) hasta la prueba de recreación.
- **F7. Documentación:** `docs/infra/pilot-aws-plan.md` (este plan) + `docs/infra/runbook-pilot.md`, y la referencia en `README.md`.

## Verificación
- F1: `sh scripts/test-backend.sh` y luego `sh scripts/test-e2e.sh` (en secuencia), Vitest, `tsc -b` y build.
- F2: el PR de prueba ejecuta `ci.yml` en verde.
- F4: `packer validate`, más `99-verify.sh` dentro de la construcción.
- F5: `terraform fmt -check`, `validate` y `plan` sin cambios después del `apply`.
- F6: smoke automático + pasos 7–9 del runbook (correo real, PDF, video y recreación sin pérdida).
