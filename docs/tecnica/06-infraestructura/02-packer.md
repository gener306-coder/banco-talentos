# AMI inmutable con Packer

> **Estado:** pendiente de redacción (T-S20-06). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Plantilla, scripts de aprovisionamiento y unidades systemd.

## Construcción de la AMI

```mermaid
%% D12: Construcción de la AMI inmutable con Packer
flowchart TB
    subgraph GHA["GitHub Actions, build-ami.yml"]
        direction LR
        TAG["Tag v* o<br/>ejecución manual"]:::external --> CI["ci.yml reutilizado<br/>frontend, Pint y Pest"]:::container --> ART["Artefacto release<br/>composer sin dev<br/>y build de Vite"]:::container --> PK["Packer 1.16.2<br/>OIDC al rol<br/>gha-build-ami"]:::container
    end
    subgraph BUILD["Instancia temporal: SG sin entradas, entra por SSM"]
        direction LR
        B1["01-base.sh<br/>Debian 13, PHP 8.4 FPM, FFmpeg,<br/>Caddy, AWS CLI y unidades systemd"] --> B2["02-app.sh<br/>versión horneada,<br/>sin secretos"] --> B3["99-verify.sh<br/>verificación<br/>de la imagen"]
    end
    subgraph OUT["Resultado"]
        direction LR
        AMI[("AMI etiquetada<br/>App=banco-talentos y SHA")]:::store --> CLEAN["Limpieza de<br/>AMIs antiguas"]:::container
    end
    GHA -->|"Session Manager, sin puerto 22"| BUILD
    BUILD --> OUT

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `infra/packer/banco-talentos.pkr.hcl`
- `infra/packer/scripts/`
- `infra/packer/files/`
- `.github/workflows/build-ami.yml`
