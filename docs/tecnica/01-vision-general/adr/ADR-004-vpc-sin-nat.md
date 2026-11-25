# ADR-004 — VPC sin NAT Gateway

[Índice de la documentación técnica](../../README.md) · [Topología AWS](../../06-infraestructura/01-topologia-aws.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha de la decisión | 22 de noviembre de 2026 (plan del piloto, Sprint 17; D4: EC2 pública con EIP y Caddy) |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

RDS exige subredes en dos zonas de disponibilidad. La aplicación necesita salida a Internet para el correo SMTP, la autoridad ACME y las APIs de AWS (SSM). El patrón habitual de servidores en subred privada con salida por un NAT Gateway tiene un cargo fijo por hora y otro por cada GB procesado, desproporcionados para un piloto de una sola instancia.

## Decisión

Una VPC `10.20.0.0/16` **sin NAT Gateway**:
- **Subred pública** `10.20.0.0/24`, en una zona:
  - la EC2 con una Elastic IP;
  - entra y sale por el Internet Gateway.
- **Dos subredes privadas** `10.20.10.0/24` y `10.20.11.0/24`, en dos zonas:
  - RDS sin acceso público;
  - sin ruta a Internet: la base no necesita salida.
- **Un VPC endpoint de tipo Gateway para S3:**
  - el tráfico entre la EC2 y el bucket no pasa por Internet;
  - no tiene costo por hora.
- **Grupos de seguridad mínimos:**
  - **De la aplicación.** Entrada solo por 80 y 443 (IPv4 e IPv6), sin SSH. Salida solo por:
    - 443 y 80 (HTTPS, ACME y paquetes);
    - 465 y 587 (SMTP);
    - 5432 hacia el CIDR de la VPC.
  - **De la base.** Entrada por 5432 solo desde el grupo de seguridad de la aplicación.
- **La instancia exige IMDSv2** (`http_tokens = "required"`).

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| EC2 en subred privada con NAT Gateway | El cargo fijo del NAT supera el costo de cómputo del piloto. |
| NAT instance propia | Otra instancia que mantener y parchar. |
| Balanceador de carga (ALB) frente a una EC2 privada | Cargo fijo adicional. Caddy ya termina TLS en la instancia (D4 del plan). |
| VPC endpoints de interfaz para SSM | Cargo por hora y por zona. La salida por 443 al Internet Gateway cubre SSM. |

## Consecuencias

**Positivas:**
- Sin costo fijo de red además de la EIP.
- La base queda aislada de Internet en ambos sentidos.
- S3 se usa por la red de AWS.

**Negativas y mitigaciones:**
- La EC2 tiene IP pública. Se mitiga con:
  - el grupo de seguridad que solo admite 80 y 443;
  - sin SSH: administración por SSM Session Manager;
  - IMDSv2 obligatorio;
  - las cabeceras y la CSP de Caddy.
- Una sola zona para la aplicación: si esa zona cae, el piloto cae. Es aceptable para un piloto. La alta disponibilidad requeriría un balanceador y una segunda instancia.

## Fuentes en el repositorio

- `infra/terraform/modules/network/main.tf` (VPC, subredes, Internet Gateway, endpoint de S3, sin NAT)
- `infra/terraform/modules/compute/main.tf` (grupo de seguridad, EIP, `metadata_options`)
- `infra/terraform/modules/database/main.tf` (grupo de seguridad de la base, `publicly_accessible = false`)
- `infra/terraform/envs/pilot/main.tf`
- `docs/infra/pilot-aws-plan.md` §3 y §6
