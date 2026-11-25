# ADR-005 — OIDC entre GitHub Actions y AWS

[Índice de la documentación técnica](../../README.md) · [GitHub Actions y CI/CD](../../06-infraestructura/04-github-actions.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha de la decisión | 22 de noviembre de 2026 (Sprint 17). Sujeto inmutable: 23 de noviembre de 2026 (T-S17-09, PR #2). |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

Los workflows necesitan crear AMIs (Packer) y aplicar Terraform en la cuenta de AWS. Guardar llaves de acceso de larga duración en GitHub crea un secreto que hay que rotar y que, si se filtra, da acceso sin caducidad.

## Decisión

GitHub Actions obtiene **credenciales temporales por federación OIDC**:
- **Proveedor.** `infra/terraform/bootstrap/` registra `token.actions.githubusercontent.com` como proveedor OIDC de IAM.
- **Dos roles con permisos mínimos:**
  - `banco-talentos-gha-build-ami`: acciones de EC2 que exige el plugin de Packer, `iam:PassRole` solo sobre el rol de construcción y Session Manager;
  - `banco-talentos-gha-deploy-pilot`: estado de Terraform, recursos del piloto, parámetros bajo `/banco-talentos/pilot/*` y `ssm:SendCommand` para drenar, migrar y verificar.
- **Política de confianza exacta.** Exige `aud = sts.amazonaws.com` y un `sub` exacto (`StringEquals`, sin comodines) por entorno de GitHub:
  - el rol de AMI solo acepta el entorno `pilot`;
  - el de despliegue acepta `pilot` y `pilot-plan`.
- **Entornos de GitHub como segunda barrera:**
  - `pilot-plan` solo admite la rama `main` y únicamente ejecuta `terraform plan`;
  - `pilot` exige la aprobación del responsable y admite solo `main` y los tags `v*`.
- **Sujeto inmutable.** Con `use_immutable_subject`, el `sub` incluye los identificadores numéricos del dueño y del repositorio (`github_oidc_sub_prefix`). Un repositorio recreado con el mismo nombre no obtiene credenciales.
- Solo los jobs que lo necesitan declaran `id-token: write`. El permiso por omisión del workflow es `contents: read`.

El flujo de la federación es el diagrama D14, en [GitHub Actions y CI/CD](../../06-infraestructura/04-github-actions.md).

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| Llaves de acceso de IAM como secretos de GitHub | Credenciales de larga duración, con rotación manual y alcance difícil de acotar por entorno. |
| Un solo rol para construir y desplegar | Mezcla permisos de EC2 amplios (Packer) con los del estado y los parámetros. Separarlos reduce el daño si un workflow se compromete. |
| Condición `sub` con comodín (`repo:…:*`) | Cualquier rama o PR del repositorio podría asumir el rol, sin pasar por la aprobación del entorno. |

## Consecuencias

**Positivas:**
- No hay secretos de AWS en GitHub: los valores del entorno son ARNs y nombres, no credenciales.
- Las credenciales caducan solas y cada job obtiene las suyas.
- Ningún despliegue llega a `apply` sin la aprobación del entorno `pilot`.

**Negativas y mitigaciones:**
- Si el `sub` no coincide, el workflow falla con `Not authorized to perform sts:AssumeRoleWithWebIdentity`. El [runbook](../../../infra/runbook-pilot.md) explica cómo leer el formato del sujeto y pasar su prefijo.

## Fuentes en el repositorio

- `infra/terraform/bootstrap/main.tf` (proveedor OIDC, `github_assume`, `github_assume_deploy`, roles y políticas)
- `.github/workflows/build-ami.yml`, `.github/workflows/deploy-pilot.yml` (`permissions`, `environment`)
- `docs/infra/runbook-pilot.md` (entornos de GitHub, sujeto inmutable)
- `docs/sprint-17.md` (T-S17-09)
