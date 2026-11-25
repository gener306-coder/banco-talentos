# Terraform

[Índice de la documentación técnica](../README.md)

La infraestructura del piloto se declara con **Terraform 1.17.2** (exige ≥ 1.10.0) y los proveedores `hashicorp/aws` 6.73.0 y `hashicorp/random` 3.9.1, fijados en `.terraform.lock.hcl`. Todos los recursos llevan las etiquetas por omisión `App=banco-talentos`, `Environment` y `ManagedBy=terraform`.

## Estructura

```text
infra/terraform/
├── bootstrap/          # una sola vez por cuenta; estado LOCAL (excluido de Git)
├── envs/pilot/         # el entorno; estado remoto en S3
└── modules/
    ├── network/        # VPC, subredes, Internet Gateway, endpoint de S3
    ├── storage/        # bucket privado de la aplicación
    ├── compute/        # EC2, EIP, grupo de seguridad, rol e instance profile
    ├── database/       # RDS, subnet group, grupo de parámetros, contraseña aleatoria
    └── params/         # SSM Parameter Store (String y SecureString)
```

### `bootstrap/`: prerrequisitos de la cuenta

Se aplica una vez, a mano, con credenciales de corta duración de `aws login` ([runbook](../../infra/runbook-pilot.md), paso 1). Su estado es **local** en la máquina del responsable: `infra/.gitignore` excluye `*.tfstate`, `*.tfvars` y los planes.

| Recurso | Para qué |
|---|---|
| Bucket `banco-talentos-tfstate-<cuenta>` | Estado remoto de `envs/pilot`. Versionado, cifrado, sin acceso público y solo TLS. Tiene `prevent_destroy`. |
| Proveedor OIDC `token.actions.githubusercontent.com` | Federación con GitHub Actions ([ADR-005](../01-vision-general/adr/ADR-005-oidc-github-aws.md)) |
| Rol `banco-talentos-gha-build-ami` | Packer: acciones de EC2, `iam:PassRole` solo del rol de construcción y Session Manager. Solo para el entorno `pilot`. |
| Rol `banco-talentos-gha-deploy-pilot` | Estado, recursos del piloto, parámetros bajo `/banco-talentos/pilot/*` y `ssm:SendCommand` con `AWS-RunShellScript`. Para los entornos `pilot` y `pilot-plan`. |
| Perfil y grupo de seguridad `banco-talentos-packer-build` | Instancia de construcción solo con Session Manager y sin reglas de entrada |

**Variables:** `region`, `github_repository`, `github_oidc_sub_prefix` (con sujetos inmutables), `github_environment` y `environment`.

**Salidas:** el bucket del estado, los ARNs de los dos roles, el perfil y el grupo de seguridad de Packer. Se copian como variables de los entornos de GitHub.

### `envs/pilot/`: el entorno

- **Backend** `s3` con bloqueo nativo (`use_lockfile = true`, sin DynamoDB) y cifrado. Su configuración se pasa al iniciar (`-backend-config`), sin archivos versionados: `backend.hcl.example` es solo una plantilla.
- **Variables:**
  - `ami_id`, que es la que cambia en cada despliegue;
  - `domain` y `acme_email`;
  - `instance_type` (`t4g.small`) y `cpu_credits` (`standard`);
  - `mail` (esquema, host, puerto y usuario SMTP) y `mail_from_address`;
  - `log_level`;
  - y tres protecciones que solo se relajan para destruir: `db_deletion_protection`, `db_skip_final_snapshot` y `bucket_force_destroy`.

  `pilot.tfvars.example` muestra los valores; el `.tfvars` real nunca se versiona.
- **`user_data`.** El módulo `compute` escribe, por `cloud-init`, solo datos no secretos en `/etc/banco-talentos/instance.env`: entorno, ruta de SSM, región y correo ACME. `bt-boot.sh` lee el resto de SSM.

## Parámetros y secretos

El módulo `params` crea en `/banco-talentos/pilot/`:
- **`String`:** la configuración de Laravel, por ejemplo:
  - `APP_URL`, `FRONTEND_URL` y `SANCTUM_STATEFUL_DOMAINS`;
  - `DB_HOST` y `DB_SSLMODE=require`;
  - los controladores `database` de sesión, caché y cola;
  - `MEDIA_DISK` y `PRIVATE_DOCUMENTS_DISK` en `s3`;
  - `AWS_BUCKET` y los `MAIL_*`;
  - `LOG_CHANNEL=stderr`, recogido por journald.
- **`SecureString`:** `DB_PASSWORD`, generada con `random_password`.

`APP_KEY` y `MAIL_PASSWORD` **no pasan por Terraform**: se cargan a mano como `SecureString` (runbook, paso 2), así nunca quedan en el estado. `bt-boot.sh` rechaza valores con comillas simples o saltos de línea.

## Cómo se aplica

| Momento | Quién | Qué |
|---|---|---|
| Una vez | El responsable, local | `bootstrap/`: `terraform init` y `terraform apply` |
| Cada despliegue | `deploy-pilot.yml` | Job `plan`: `init`, `fmt -check`, `validate`, `plan` y el resumen del plan en el job. Job `apply`, tras la aprobación: vuelve a planear con las mismas entradas (el plan no se sube como artefacto porque contiene secretos) y aplica. |
| Destruir conservando datos | El responsable, local | Relajar las tres protecciones en el `.tfvars`, `apply` y `destroy`. `bootstrap/` se conserva ([runbook](../../infra/runbook-pilot.md#pausar-o-destruir)). |

En un despliegue normal, el plan esperado reemplaza la instancia y la asociación de la EIP, por ejemplo `2 to add, 0 to change, 2 to destroy`. Cualquier otro cambio merece revisión antes de aprobar.

## Fuentes en el repositorio

- `infra/terraform/bootstrap/` (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`)
- `infra/terraform/envs/pilot/` (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `backend.hcl.example`, `pilot.tfvars.example`, `.terraform.lock.hcl`)
- `infra/terraform/modules/*/`, `infra/terraform/modules/compute/user-data.yaml.tftpl`
- `infra/.gitignore`
- `.github/workflows/deploy-pilot.yml`
- `docs/infra/runbook-pilot.md` (pasos 1, 2 y 5; «Pausar o destruir»)
