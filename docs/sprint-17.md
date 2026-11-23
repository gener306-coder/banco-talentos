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
    - Con rol `COMPANY` o `INSTITUTION`, el menú de mensajes del encabezado consulta `/unread-summary` al montarse, y 4 archivos de `src/institutions` contaban esa consulta como petición administrativa prohibida. Ahora la responden aparte, como ya hacían `SessionPage.test.tsx` y `TalentSearchPage.test.tsx`. La tercera ejecución destapó la misma carrera en `AuditEventsPage.test.tsx`. Se revisaron todos los archivos que montan `<App>` con esos roles y verifican que una petición no ocurra; se corrigieron también `ReportsPage.test.tsx` y `SecretaryAccountsPage.test.tsx`. `DualStoriesSpotlight.test.tsx` no está expuesto: responde 404 a esa ruta.
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

**Estado:** Completada (23 de noviembre de 2026). Se siguió `docs/infra/runbook-pilot.md` de principio a fin: el piloto quedó en línea en https://piloto.ellukas.online y superó la prueba de recreación.

**Avance (22 de noviembre de 2026):**
- **Cuenta y acceso:** cuenta del Plan Gratuito, en `us-east-2`; acceso local con `aws login`.
- **Comprobaciones previas:**
  - `t4g.small` entra en el Plan Gratuito;
  - RDS ofrece PostgreSQL 17.11 en `db.t4g.micro` (`engine_version = "17"` toma la menor más reciente);
  - existe la AMI de Debian 13 arm64 en `us-east-2`.
- **Paso 1 (bootstrap):** `terraform apply` creó 15 recursos, sin cambios ni destrucciones.
  - Bucket del estado `banco-talentos-tfstate-<cuenta>`, con versionado, cifrado y acceso público bloqueado.
  - Proveedor OIDC de GitHub.
  - Roles `banco-talentos-gha-build-ami` (entorno `pilot`) y `banco-talentos-gha-deploy-pilot` (entornos `pilot` y `pilot-plan`).
  - Perfil de instancia y grupo de seguridad sin entradas para Packer.
  - El estado local se respaldó en `s3://<bucket del estado>/bootstrap/terraform.tfstate`.
- **Paso 3 (Resend y DNS):** subdominio `piloto.ellukas.online`, verificado por el responsable en Resend y en Hostinger.
- **Paso 4 (entornos de GitHub, con `gh api`):**
  - `pilot-plan`: solo la rama `main`.
  - `pilot`: aprobación del responsable (sin *Prevent self-review*), la rama `main` y los tags `v*`.
  - Variables `AWS_DEPLOY_ROLE_ARN`, `TF_STATE_BUCKET`, `PILOT_DOMAIN` y `PILOT_ACME_EMAIL` en ambos; además, en `pilot`, `AWS_BUILD_AMI_ROLE_ARN` y `PACKER_SECURITY_GROUP_ID`. Ningún secreto de AWS en GitHub.
- **Paso 2 (secretos):** `APP_KEY` y `MAIL_PASSWORD` los carga el responsable en SSM desde su terminal. No pasan por el chat ni por Terraform.
- **Fusión:** el PR #1 se fusionó a `main` (merge commit) para habilitar `workflow_dispatch` en `build-ami.yml` y `deploy-pilot.yml`.
- **Primera ejecución de Build AMI (run 45111486818):** CI y artefacto en verde; el job `packer` falló al asumir el rol: `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
  - **Causa:** el repositorio emite sujetos OIDC inmutables (`repo:gener306-coder@232904730/banco-talentos@1386071232:environment:pilot`) y la confianza esperaba el formato clásico.
  - **Corrección:** `bootstrap` acepta `github_oidc_sub_prefix` y solo confía en el formato inmutable, que impide que un repositorio recreado con el mismo nombre obtenga credenciales. El plan actualiza la confianza de los dos roles, sin crear ni destruir nada.
- **Segundo intento de Build AMI** (mismo run, solo el job `packer`):
  - **Funcionó:** OIDC con el sujeto inmutable; el SSM Agent instalado por `user_data` (A1); Packer por Session Manager sin puerto 22; la subida del artefacto.
  - **Falló:** la subida de la carpeta `files/` (`scp: /tmp/bt-files: Is a directory`). Un directorio no sube por el túnel de Session Manager.
  - **Corrección:** `build-ami.yml` arma `bt-files.tar.gz` antes de `packer validate` (Packer exige que exista al preparar el provisioner), y Packer sube y extrae un solo archivo.
  - Se comprobó en Debian 13 que `systemd-analyze verify` acepta la plantilla `bt-queue@.service`.
  - La instancia temporal quedó terminada, su llave borrada y la sesión de SSM cerrada a mano.
- **Tercer intento de Build AMI (run 45117979189, sobre `77fb4c2`):** el CI previo falló en dos pruebas de `PromotionalVideosPage.test.tsx`, otras carreras de prueba:
  - el botón «Ver más historias» aparecía antes de registrarse el `IntersectionObserver`;
  - el control de orden aparecía antes de la primera petición.

  Ahora las pruebas esperan esas condiciones. Al repetir el archivo apareció un tercer caso: el esqueleto podía mostrarse antes de que saliera la petición a la galería, y ahora la prueba espera a tenerla pendiente. Resultado: el archivo pasa 30 de 30 veces y Vitest completo 4 de 4. En el CI de ese PR, Pest superó el límite de 30 minutos del job (antes tardaba entre 23 y 28): el límite pasa a 45 minutos, y el de E2E a 60.
- **Build AMI (run 45128532648, sobre `74cb451`):** en verde. AMI `ami-0ec52f53f493d3927` (arm64, `Release=74cb45146e48`) en 16 minutos de Packer, con `99-verify.sh` superado en AWS real.
- **Primer Deploy pilot (run 45135132231):** el plan creaba 78 recursos y el `apply` creó 77: red, bucket, RDS 17.9, la EC2 y la EIP. El SSM Agent de la EC2 queda `Online`.
  - **Falló** la alarma de CloudWatch con acción `ec2:recover`: `AccessDenied`, porque exige el rol vinculado `AWSServiceRoleForCloudWatchEvents`, que no existe y que el rol de despliegue no puede crear.
  - **Sobraba:** la instancia ya tiene la recuperación automática simplificada de EC2 (`maintenance_options.auto_recovery = "default"`), que ahora se declara en lugar de la alarma.
  - **Al planear contra el estado real** se vio que el siguiente despliegue habría reemplazado la EC2:
    - el `depends_on = [module.params]` del módulo `compute` aplazaba todos sus `data` hasta el `apply`, y la región del `user_data` quedaba desconocida;
    - además, `rds.force_ssl` tenía un cambio perpetuo (AWS lo guarda con `apply_method = "pending-reboot"`).
  - **Corrección:** la instancia depende de los parámetros mediante la etiqueta `ConfigParameters` (salida `parameter_count` de `params`), y el grupo de parámetros declara `pending-reboot`. El plan contra el estado real queda en `0 to add, 1 to change, 0 to destroy`: solo la etiqueta.
- **Segundo Deploy pilot (run 45141635282, sobre `b44ea7e`):**
  - el plan fue `0 to add, 1 to change, 0 to destroy` (solo la etiqueta) y el `apply` no reemplazó nada;
  - las migraciones corrieron desde cero (incluido el catálogo INEGI) y `artisan up` pasó;
  - el smoke falló al buscar HTTPS: Caddy había arrancado antes del registro A, su intento con Let's Encrypt falló (`no valid A records found`) y se quedó esperando el desafío de ZeroSSL sin reintentar.
- **Corrección operativa:** `systemctl restart caddy` por SSM.
  - Let's Encrypt emitió el certificado `CN=piloto.ellukas.online` (emisor YE1, vence el 21 de febrero de 2027).
  - `infra/scripts/smoke.sh https://piloto.ellukas.online` pasó sus 4 verificaciones: `/up` 200 con certificado válido; HSTS, CSP, `nosniff` y `no-referrer` en la SPA; `/api/me` 401 con `no-store`; redirección de HTTP a HTTPS.
  - `bt-caddy-certs.service` respaldó el certificado, su llave y la cuenta ACME en `s3://<bucket>/caddy/` (SSE `AES256`), con el temporizador diario programado.
  - Documentado en el runbook (paso 5): en un despliegue inicial, reiniciar Caddy después de crear el registro A. `deploy-pilot.yml` no cambia, porque en los despliegues siguientes el DNS ya existe y el certificado se restaura desde S3.
- **Paso 6 (catálogo y primer Administrador)**, por SSM:
  - `bt-artisan skills:seed` agregó 820 habilidades;
  - `bt-artisan admin:bootstrap gener306@gmail.com` creó el Administrador y envió el enlace de contraseña inicial.
  - Las colas, el planificador, PHP-FPM y Caddy quedaron activos, sin trabajos fallidos.
  - El planificador falló de 08:14 a 08:51 (`relation "cache" does not exist`): era el hueco anterior a la primera migración y no se repitió.
  - Los workers se reciclan cada hora por diseño (`--max-time=3600`).
- **Paso 7 (prueba funcional, validada por el responsable):** correo real por Resend, comprobante PDF en S3 privado, video real de 1:30 procesado y reproducido, y consola sin violaciones de CSP.
  - `ProcessInstitutionVideo` tardó 5 min 18 s, con 2 vCPU casi al máximo (créditos `standard`).
  - Pico de memoria del worker: 408 MiB, ffmpeg incluido.
  - El swap nunca se usó (`pswpout 0`), sin OOM, con `failed_jobs` vacío.
- **Paso 8 (prueba de recreación):**
  - **Antes de construir la AMI**, el CI de Build AMI destapó otra carrera de prueba (`DualStoriesSpotlight`): el esqueleto se pinta antes de que salga la petición. Las pruebas que esperan un estado de carga y después responden comprueban ahora que la petición ya salió: también `LinkageInbox`, `AuditEventsPage` y `SessionPage` (PR #6; los 4 archivos pasan 25 de 25 veces).
  - **AMI nueva** `ami-0f0620218b7736e3a` (sobre `cc825df`). El plan local y el del flujo coincidieron: `2 to add, 0 to change, 2 to destroy`, solo `aws_instance.app` y `aws_eip_association.app`.
  - **Deploy pilot (run 45252247099), en verde en todos sus pasos:** drenado de colas y respaldo del certificado; EC2 nueva `i-0ef3dbc94bde1ae80` con la misma EIP; `migrate` sin pendientes; `artisan up`; smoke.
  - **Verificado contra la referencia previa:**

    | Elemento | Antes | Después |
    |---|---|---|
    | Instancia | `i-0789c241ac1449f42` (`ami-0ec52f53f493d3927`) | `i-0ef3dbc94bde1ae80` (`ami-0f0620218b7736e3a`), misma EIP `18.189.147.143` |
    | Certificado | serial `06F327DF…C141`, vence el 21 de febrero de 2027 | **mismo serial**; 0 emisiones en la instancia nueva (restaurado desde S3 por `bt-boot`) |
    | Video y comprobante en S3 | `videos/1/fd33464d-…` (mp4, webm, jpg) e `imss/1/325d6b89-….pdf` | los mismos objetos y tamaños; el video sigue `READY` y la huella SHA-256 del PDF no cambió |
    | Sesiones en RDS | 2 | 2, con actividad posterior a la recreación: la sesión abierta sobrevivió |
    | Smoke | 4 de 4 | 4 de 4 |
    | Errores en `journalctl` | — | 0 desde el arranque; colas, planificador, PHP-FPM y Caddy activos |

  - La AMI anterior sigue disponible para volver atrás (Deploy pilot con su `ami_id`).
- **Resultado:** el piloto corre en AWS con infraestructura inmutable. Reemplazar la EC2 no pierde archivos, sesiones ni certificado.

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

### Lo que quedaba pendiente para T-S17-09 (resuelto el 23 de noviembre de 2026)
- Primera `packer build` real:
  - SSM Agent por `user_data` (A1);
  - Session Manager desde el runner;
  - `systemd-analyze verify` y `caddy validate` dentro de `99-verify.sh`.
- Primer `terraform apply`, certificado real de Let's Encrypt y correo real de Resend.
- Video real con ffmpeg 7.1 en arm64. Las pruebas automatizadas no transcodifican.
- Primera ejecución de `ci.yml` en GitHub, al hacer push.

Todo se resolvió en T-S17-09:
- la AMI se construyó por Session Manager, con SSM Agent instalado por `user_data` y `99-verify.sh` superado;
- `terraform apply` real;
- certificado de Let's Encrypt y correo por Resend reales;
- video real procesado en arm64;
- `ci.yml` en verde en GitHub.
