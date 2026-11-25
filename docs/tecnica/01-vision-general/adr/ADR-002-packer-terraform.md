# ADR-002 — Packer para la imagen y Terraform para la infraestructura

[Índice de la documentación técnica](../../README.md) · [Arquitectura](../03-arquitectura.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha de la decisión | 22 de noviembre de 2026 (plan del piloto, Sprint 17) |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

Al cierre del Sprint 16, el producto corría solo en local con Docker Compose. La auditoría QA (`docs/qa-pre-release-audit.md`) dejó pendientes de infraestructura: `.env` de producción, HTTPS con HSTS y CSP, worker, respaldos y proxies.

El piloto debía ser barato, reproducible, fácil de destruir y recrear, y auditable desde el repositorio.

## Decisión

Separar **qué corre** de **dónde corre**:
- **Packer** (`infra/packer/banco-talentos.pkr.hcl`) hornea una AMI por versión.
  - Contiene Debian 13 arm64, PHP 8.4 FPM, FFmpeg, Caddy, las unidades systemd y la aplicación ya compilada (`vendor/` sin dependencias de desarrollo y el `dist/` de Vite).
  - No contiene secretos.
  - Packer entra a la instancia de construcción por SSM Session Manager, sin abrir el puerto 22.
- **Terraform** (`infra/terraform/`) declara la infraestructura. `bootstrap/` crea el estado remoto, el proveedor OIDC y los roles. `envs/pilot/` compone los módulos `network`, `storage`, `compute`, `database` y `params`.
- El estado vive en S3, con bloqueo nativo (`use_lockfile`, sin DynamoDB).
- **GitHub Actions** ejecuta ambos:
  - `build-ami.yml` arma el artefacto y corre Packer;
  - `deploy-pilot.yml` corre `terraform plan`, espera la aprobación del responsable y aplica.

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| Configurar un servidor existente (SSH, scripts o Ansible) | El servidor acumula cambios manuales y deja de ser reproducible. Además exige abrir SSH. |
| Contenedores en ECS/Fargate | Más piezas (registro de imágenes, balanceador, tareas) y más costo fijo para una sola instancia. Docker ya cubre el entorno local, pero la AMI no lo necesita. |
| Elastic Beanstalk | Abstrae la red y el ciclo de vida, y complica controlar la VPC sin NAT, la CSP de Caddy y el arranque desde SSM. |
| CloudFormation o CDK | Válidos, pero Terraform permite declarar en el mismo lenguaje el bootstrap (OIDC, roles y estado) y el entorno. Su plan se revisa como resumen del job antes de aprobar. |

## Consecuencias

**Positivas:**
- Cada versión queda congelada en una AMI etiquetada con el SHA del commit (`App=banco-talentos`), y `99-verify.sh` la valida durante la construcción.
- Recrear el piloto es volver a aplicar Terraform. La prueba de recreación se superó en T-S17-09 (`docs/sprint-17.md`).
- Los cambios de infraestructura pasan por PR, CI y una aprobación explícita del entorno `pilot`.

**Negativas y mitigaciones:**
- Construir una AMI tarda varios minutos por versión. Se acepta porque el despliegue es poco frecuente.
- Se mantienen dos herramientas de HashiCorp, ambas fijadas: Packer 1.16.2 y Terraform 1.17.2.

## Fuentes en el repositorio

- `docs/infra/pilot-aws-plan.md` (Contexto, §2, §3 y §6)
- `docs/sprint-17.md`
- `infra/packer/banco-talentos.pkr.hcl`, `infra/packer/scripts/`
- `infra/terraform/bootstrap/`, `infra/terraform/envs/pilot/`, `infra/terraform/modules/`
- `.github/workflows/build-ami.yml`, `.github/workflows/deploy-pilot.yml`
