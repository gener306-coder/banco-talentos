# Topología AWS

> **Estado:** pendiente de redacción (T-S20-06). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Red, cómputo, base de datos, almacenamiento y parámetros del piloto.

## Topología AWS del piloto

```mermaid
%% D11: Topología AWS del piloto
flowchart TB
    subgraph NET["Internet"]
        direction LR
        U(["Usuarios"]):::actor
        SMTP["Proveedor SMTP<br/>Resend en el piloto"]:::external
        ACME["Autoridad ACME"]:::external
    end

    subgraph AWS["AWS us-east-2, Ohio"]
        subgraph VPC["VPC 10.20.0.0/16, sin NAT Gateway"]
            IGW["Internet Gateway"]
            subgraph PUB["Subred pública 10.20.0.0/24, zona a"]
                EC2["EC2 t4g.small arm64<br/>AMI inmutable y Elastic IP<br/>SG: entrada solo 80 y 443, sin SSH"]:::container
            end
            subgraph PRIV["Subredes privadas 10.20.10.0/24 y 10.20.11.0/24, zonas a y b"]
                RDS[("RDS PostgreSQL 17, db.t4g.micro<br/>cifrado, sin acceso público, TLS forzado")]:::store
            end
            VPCE["VPC endpoint Gateway de S3"]
        end
        S3[("S3 de la aplicación<br/>privado, cifrado, versionado, solo TLS")]:::store
        SSM["SSM Parameter Store<br/>y Session Manager"]
    end

    NET -->|"entrada HTTPS 443 y HTTP 80"| IGW
    IGW --> EC2
    EC2 -->|"salida: 465 y 587 SMTP, 443 ACME"| IGW
    IGW -->|"salida a Internet"| NET
    EC2 -->|"5432, solo desde el SG de la app"| RDS
    EC2 -->|"S3 sin pasar por Internet"| VPCE
    VPCE --> S3
    EC2 -.->|"agente SSM y parámetros, 443 por el Internet Gateway"| SSM

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `infra/terraform/modules/network/main.tf`
- `infra/terraform/modules/compute/main.tf`
- `infra/terraform/modules/database/main.tf`
- `infra/terraform/modules/storage/main.tf`
- `infra/terraform/envs/pilot/main.tf`
