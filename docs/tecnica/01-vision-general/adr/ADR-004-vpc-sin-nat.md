# ADR-004 — VPC sin NAT Gateway

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../../README.md)

## Contenido previsto

- EC2 en subred pública con SG restrictivo, RDS en subredes privadas sin salida y endpoint Gateway de S3.

## Fuentes en el repositorio

- `infra/terraform/modules/network/main.tf`
- `infra/terraform/modules/compute/main.tf`
