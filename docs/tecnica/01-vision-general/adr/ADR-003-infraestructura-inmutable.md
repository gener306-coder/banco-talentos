# ADR-003 — Infraestructura inmutable

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../../README.md)

## Contenido previsto

- Reemplazo de la EC2 en cada despliegue, estado fuera de la instancia (RDS, S3, SSM) y certificados respaldados.

## Fuentes en el repositorio

- `docs/infra/pilot-aws-plan.md` §1.2
- `infra/packer/files/sbin/bt-boot.sh`
- `infra/packer/files/sbin/bt-caddy-certs.sh`
