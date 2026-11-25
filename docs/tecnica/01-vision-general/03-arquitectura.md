# Arquitectura: monolito modular

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Contenedores en tiempo de ejecución (C4 nivel 2).
- Módulos funcionales dentro del monolito.
- Enlace a los ADRs.

## Contenedores (C4 nivel 2)

```mermaid
%% D03: C4 nivel 2, contenedores
flowchart TB
    U(["Usuarios de los 4 roles"]):::actor
    SPA["Navegador: SPA React 19 y TypeScript<br/>React Router 7, Vite 8"]:::container

    subgraph EC2["EC2 t4g.small, Debian 13 arm64, AMI inmutable"]
        direction TB
        CADDY["Caddy<br/>TLS, CSP y archivos de la SPA"]:::container
        FPM["PHP-FPM 8.4<br/>API REST Laravel 13 y Sanctum"]:::container
        QD["bt-queue@default<br/>correos en cola"]:::container
        QV["bt-queue@videos<br/>ffprobe y FFmpeg"]:::container
        SCH["bt-schedule.timer<br/>schedule:run cada minuto"]:::container
        BOOT["bt-boot.service<br/>configuración al arrancar"]:::container
        CADDY -->|"FastCGI por socket unix"| FPM
    end

    RDS[("RDS PostgreSQL 17 y PostGIS<br/>datos, sesiones, caché y cola")]:::store
    S3[("S3 privado<br/>videos/, imss/ y caddy/")]:::store
    SSM["SSM Parameter Store<br/>/banco-talentos/pilot/*"]:::external
    SMTP["Proveedor SMTP<br/>Resend en el piloto"]:::external

    U --> SPA
    SPA -->|"HTTPS y cookie de sesión"| CADDY
    SPA -.->|"reproduce con URL prefirmada"| S3
    FPM -->|"SQL con TLS forzado"| RDS
    QD --> RDS
    QV --> RDS
    SCH --> RDS
    FPM -->|"comprobantes"| S3
    QV -->|"MP4, WebM y póster"| S3
    CADDY -.->|"respaldo de certificados"| S3
    FPM -->|"correos inmediatos"| SMTP
    QD -->|"correos en cola"| SMTP
    BOOT -->|"parámetros y secretos"| SSM

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `infra/packer/files/caddy/Caddyfile`
- `infra/packer/files/systemd/`
- `backend/config/queue.php`
