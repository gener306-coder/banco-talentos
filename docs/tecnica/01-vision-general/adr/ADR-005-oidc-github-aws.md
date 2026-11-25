# ADR-005 — OIDC entre GitHub Actions y AWS

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../../README.md)

## Contenido previsto

- Credenciales temporales sin llaves en GitHub; roles separados para construir y desplegar. Ver D14.

## Fuentes en el repositorio

- `infra/terraform/bootstrap/main.tf`
- `.github/workflows/build-ami.yml`
- `.github/workflows/deploy-pilot.yml`
