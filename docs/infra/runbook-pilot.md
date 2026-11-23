# Runbook del piloto en AWS

Sprint 17 ([sprint-17.md](../sprint-17.md)), T-S17-09. Plan técnico: [pilot-aws-plan.md](pilot-aws-plan.md).

**Supuestos:**
- región `us-east-2` (Ohio): la cuenta del Plan Gratuito quedó asignada ahí y bloquea las demás regiones;
- subdominio del piloto en **Hostinger** (`piloto.example.com` en los ejemplos);
- correo con **Resend**;
- instancia `t4g.small` con Opción A (EC2 + EIP + Caddy).

**Convenciones:**
- `$` es tu terminal, con credenciales de corta duración de `aws login` (paso 1). Nunca llaves de acceso de larga duración.
- `bt-artisan` es `php artisan` como `www-data` dentro de la instancia.
- Nada de este runbook se guarda en Git: ni `.tfvars` reales, ni estados, ni secretos.

---

## 0. Requisitos locales

| Herramienta | Versión | Uso |
|---|---|---|
| AWS CLI | v2 ≥ 2.32.0 (requisito de `aws login`) | Acceso local, parámetros, sesiones y snapshots |
| Session Manager plugin | reciente | `aws ssm start-session` |
| Terraform | ≥ 1.10 (CI usa 1.17.2) | `bootstrap/` y operación manual |
| Packer | ≥ 1.11 (CI usa 1.16.2) | Solo si se construye fuera de GitHub |

Si no quieres instalarlas, Terraform y Packer corren en Docker (`hashicorp/terraform`, `hashicorp/packer`).

## 1. Cuenta de AWS y bootstrap (una sola vez)

1. Activa MFA en el usuario root.
2. Acceso local con `aws login` (AWS CLI ≥ 2.32.0, sin IAM Identity Center):
   ```bash
   $ aws configure set region us-east-2
   $ aws login                      # abre el navegador; con --remote si la máquina no tiene navegador
   $ aws sts get-caller-identity    # confirma la cuenta y la identidad
   ```
   - Credenciales de corta duración que rotan cada 15 minutos y valen hasta 12 horas. Al vencer, se repite `aws login`.
   - `aws login` usa el inicio de sesión de la **cuenta de AWS**: el root o un usuario IAM. AWS Builder ID es otra identidad (servicios para desarrolladores) y no da acceso a los recursos de la cuenta.
   - Recomendado: con el root, crea un usuario IAM administrador con MFA y la política administrada `SignInLocalDevelopmentAccess` (además de `AdministratorAccess`), y usa ese usuario para `aws login`. El root queda solo para tareas de cuenta.
   - La cuenta del Plan Gratuito bloquea las regiones distintas de `us-east-2`: un `AccessDenied` por SCP suele ser una región mal configurada (`aws configure get region`).
3. Crea una alerta de presupuesto: AWS Budgets → US$50 al mes con aviso al 80 %.
4. Aplica el bootstrap:
   ```bash
   $ cd infra/terraform/bootstrap
   $ terraform init
   $ terraform apply -var 'github_repository=<owner>/banco-talentos'
   ```
5. Guarda sus salidas: `state_bucket`, `build_ami_role_arn`, `deploy_role_arn` y `packer_build_security_group_id`.
6. Respalda su `terraform.tfstate` (local, ignorado por Git) en el gestor de contraseñas o en el propio bucket del estado: `aws s3 cp terraform.tfstate s3://<state_bucket>/bootstrap/terraform.tfstate`.

## 2. Secretos que no pasan por Terraform

`APP_KEY` cifra el NSS y la póliza: **si se pierde, esos datos son irrecuperables.** Genérala una sola vez y guárdala en el gestor de contraseñas antes de cargarla:

```bash
$ docker compose exec backend php artisan key:generate --show      # base64:...
$ aws ssm put-parameter --region us-east-2 --name /banco-talentos/pilot/APP_KEY \
    --type SecureString --value 'base64:...'
$ aws ssm put-parameter --region us-east-2 --name /banco-talentos/pilot/MAIL_PASSWORD \
    --type SecureString --value 're_...'                            # API key de Resend (paso 3)
```

Los valores no pueden contener comillas simples ni saltos de línea: `bt-boot.sh` los rechaza. Terraform crea los demás parámetros, incluida `DB_PASSWORD`, en el paso 5.

## 3. Resend y DNS en Hostinger

1. En Resend:
   - **Domains → Add domain**, con `piloto.example.com` (o el dominio raíz si se enviará desde él). La región de Resend es independiente de la de AWS: Resend no ofrece `us-east-2`, así que usa `us-east-1` (Norte de Virginia); por eso el registro MX de abajo apunta a `us-east-1`;
   - **API Keys → Create**, con permiso *Sending access* limitado a ese dominio. Esa llave es `MAIL_PASSWORD` (paso 2).
2. En Hostinger (**DNS / Nameservers → Administrar registros DNS**), crea exactamente los registros que muestra Resend:

   | Tipo | Nombre (relativo al dominio de Hostinger) | Valor | Propósito |
   |---|---|---|---|
   | TXT | `resend._domainkey.piloto` | `p=MIGf...` (lo da Resend) | DKIM |
   | MX | `send.piloto` | `feedback-smtp.us-east-1.amazonses.com` (prioridad 10) | Rebotes (MAIL FROM) |
   | TXT | `send.piloto` | `v=spf1 include:amazonses.com ~all` | SPF |
   | TXT | `_dmarc.piloto` | `v=DMARC1; p=none; rua=mailto:dmarc@<dominio>` | DMARC (recomendado) |

   Hostinger agrega el dominio raíz al final del nombre, así que no lo escribas completo.
3. Espera a que Resend marque el dominio como **Verified**.
4. Parámetros de correo que crea Terraform:
   - `MAIL_MAILER=smtp`, `MAIL_SCHEME=smtps`, `MAIL_HOST=smtp.resend.com`, `MAIL_PORT=465`;
   - `MAIL_USERNAME=resend`, `MAIL_TIMEOUT=10`, `MAIL_FROM_ADDRESS=no-reply@piloto.example.com`.

   Cambiar a SES solo cambia estos valores y el DNS.

Límite gratuito de Resend: 3 000 correos al mes y 100 al día. Si una carga masiva de invitaciones lo excede, los correos fallan en la cola `default` y se reintentan: revisa `bt-artisan queue:failed`.

## 4. GitHub: entornos y variables

En **Settings → Environments**, crea dos entornos:

| Entorno | Protección | Variables |
|---|---|---|
| `pilot-plan` | *Deployment branches*: solo `main` | `AWS_DEPLOY_ROLE_ARN`, `TF_STATE_BUCKET`, `PILOT_DOMAIN`, `PILOT_ACME_EMAIL` |
| `pilot` | *Required reviewers* (el responsable) + solo `main` y tags `v*` | Las mismas, más `AWS_BUILD_AMI_ROLE_ARN` y `PACKER_SECURITY_GROUP_ID` |

No hay secretos de AWS en GitHub: los roles se asumen por OIDC.

## 5. Primera AMI y primer despliegue

1. **Actions → Build AMI → Run workflow** (o un tag `vX.Y.Z`). Corre el CI completo, arma el artefacto y ejecuta Packer. El resumen muestra el `ami_id`.
2. **Actions → Deploy pilot → Run workflow** (deja `ami_id` vacío para usar la más reciente):
   1. `plan`: revisa el plan en el resumen. Crea VPC, bucket, RDS, EC2, EIP y los parámetros de SSM;
   2. apruébalo en el entorno `pilot`;
   3. `apply` crea la infraestructura (RDS tarda unos 10 minutos);
   4. la instancia arranca en mantenimiento (base vacía, A3), el flujo migra (la migración del catálogo INEGI carga los 2 478 municipios) y ejecuta `artisan up`.
3. **El smoke del primer despliegue falla si el DNS aún no existe:** Caddy no puede obtener el certificado sin el registro. Crea en Hostinger el registro que imprime el resumen (o la salida `domain_a_record`):

   | Tipo | Nombre | Valor | TTL |
   |---|---|---|---|
   | A | `piloto` | `<Elastic IP>` | 300 |

   Espera la propagación (`dig +short piloto.example.com` devuelve la EIP) y vuelve a ejecutar **Deploy pilot** con el mismo `ami_id`. Esta vez no hay reemplazo: solo migra (sin cambios), confirma y pasa el smoke. Caddy emite el certificado en cuanto el dominio resuelve.

## 6. Catálogo de habilidades y primer Administrador

```bash
$ aws ssm start-session --target <instance_id>
$ sudo bt-artisan skills:seed                       # catálogo semilla de habilidades (idempotente)
$ sudo bt-artisan admin:bootstrap admin@<dominio> --name "Nombre Apellido"
```

`admin:bootstrap` envía por Resend el enlace para establecer la contraseña. **Que llegue valida el SMTP real.** Si no llega:
- `--manual` imprime el enlace en la terminal;
- `journalctl -u php8.4-fpm -u bt-queue@default --since -10min` muestra el error.

## 7. Prueba funcional real

Con el Administrador ya dentro:

1. **Correo:** crea una institución y su cuenta. Llega la invitación y se puede establecer la contraseña.
2. **Comprobante PDF (S3 privado):** como institución, registra un alumno, sube su comprobante del seguro y descárgalo.
   - En S3, el objeto existe bajo `imss/<institution_id>/`.
   - En la instancia, `/var/lib/banco-talentos/storage/app/private/imss` está vacío.
3. **Video (ffmpeg 7.1 en arm64):** sube un MP4 de unos 50 MB (después, uno con rotación de celular).
   - Pasa de «procesando» a «publicado».
   - Se reproduce en el feed, y en las herramientas del navegador la URL del video y del póster sale del bucket (`*.s3.amazonaws.com`), firmada.
   - `journalctl -u bt-queue@videos -f` muestra el trabajo.
4. **CSP:** recorre los 4 roles, en claro y oscuro, con la consola abierta. No debe aparecer ninguna violación de *Content-Security-Policy*.
5. **Autoservicio:** «Olvidé mi contraseña» entrega el correo.
6. **Cabeceras:** `infra/scripts/smoke.sh https://piloto.example.com` desde tu terminal.

## 8. Prueba de recreación (inmutabilidad)

Vuelve a construir la AMI (o reutiliza otra) y despliégala con **Deploy pilot**:
- el flujo drena las colas, respalda los certificados en `s3://<bucket>/caddy/` y reemplaza la EC2 (la EIP se reasocia);
- verifica que el video y el PDF siguen ahí;
- verifica que la sesión sigue abierta (las sesiones viven en RDS);
- verifica que no hubo una emisión nueva de certificado (`journalctl -u caddy | grep -i obtain` sin entradas nuevas).

## Operación diaria

| Tarea | Cómo |
|---|---|
| Entrar a la instancia | `aws ssm start-session --target <instance_id>` (no hay SSH ni puerto 22) |
| Logs | `journalctl -u bt-boot -u php8.4-fpm -u caddy -u bt-queue@videos -u bt-queue@default` |
| Trabajos fallidos | `sudo bt-artisan queue:failed`, `sudo bt-artisan queue:retry all` |
| Modo mantenimiento | `sudo bt-artisan down --retry=30` / `sudo bt-artisan up` |
| Cambiar un parámetro | `aws ssm put-parameter --overwrite ...` y después `sudo systemctl restart bt-boot php8.4-fpm caddy bt-queue@videos bt-queue@default` (o redesplegar) |
| Rollback | **Deploy pilot** con el `ami_id` anterior; las migraciones deben ser compatibles hacia atrás |
| Versión desplegada | `cat /opt/banco-talentos/RELEASE` o la etiqueta `Release` de la AMI |

## Respaldos

- **RDS:**
  - automáticos de 7 días (restauración a un punto en el tiempo);
  - antes de cambios grandes: `aws rds create-db-snapshot --db-instance-identifier banco-talentos-pilot --db-snapshot-identifier pre-<fecha>`.
- **Bucket:** versionado, con 30 días de versiones anteriores. Copia externa opcional: `aws s3 sync s3://<bucket> ./respaldo-<fecha>`.
- **`APP_KEY`:** en el gestor de contraseñas (paso 2). Sin ella, un respaldo de la base no descifra el NSS ni la póliza.

## Pausar o destruir

**Pausar** (≈ US$9 al mes por EBS, EIP y almacenamiento):

```bash
$ aws ec2 stop-instances --instance-ids <instance_id>
$ aws rds stop-db-instance --db-instance-identifier banco-talentos-pilot   # AWS lo reinicia solo a los 7 días
```

**Destruir conservando datos:**
1. Haz un snapshot manual de RDS y `aws s3 sync` del bucket.
2. En `pilot.tfvars` (copia local de `pilot.tfvars.example`), fija `db_deletion_protection = false`, `db_skip_final_snapshot = false` y `bucket_force_destroy = true`.
3. Ejecuta:
   ```bash
   $ cd infra/terraform/envs/pilot
   $ cp backend.hcl.example backend.hcl                                     # con el bucket del estado
   $ terraform init -backend-config=backend.hcl
   $ terraform apply -var-file=pilot.tfvars -var ami_id=<ami>               # aplica las protecciones relajadas
   $ terraform destroy -var-file=pilot.tfvars -var ami_id=<ami>
   ```
4. Borra en Hostinger el registro A, y en SSM `APP_KEY` y `MAIL_PASSWORD` si no volverás a usarlas.

`bootstrap/` (estado, OIDC y roles) se conserva para recrear el piloto.
