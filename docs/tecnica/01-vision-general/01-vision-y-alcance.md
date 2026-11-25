# Visión general y alcance

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Objetivo del sistema y actores.
- Alcance del MVP y del piloto.
- Contexto del sistema (C4 nivel 1).

## Contexto del sistema (C4 nivel 1)

```mermaid
%% D02: C4 nivel 1, contexto del sistema
flowchart TB
    ADM(["Administrador"]):::actor
    SEC(["Secretaría de Economía"]):::actor
    INS(["Institución educativa"]):::actor
    EMP(["Empresa"]):::actor

    BT["Banco de Talentos<br/>SPA React y API REST Laravel<br/>vinculación de Educación Dual"]:::system

    SMTP["Proveedor SMTP<br/>Resend en el piloto"]:::external
    S3["Amazon S3<br/>videos, comprobantes y certificados TLS"]:::external
    ACME["Autoridad ACME<br/>certificados TLS de Caddy"]:::external
    INEGI["Catálogo INEGI<br/>municipios y cabeceras municipales"]:::external

    ADM -->|"HTTPS"| BT
    SEC -->|"HTTPS"| BT
    INS -->|"HTTPS"| BT
    EMP -->|"HTTPS"| BT
    BT -->|"correos transaccionales con marca"| SMTP
    BT -->|"objetos privados y URLs prefirmadas"| S3
    BT -->|"emite y renueva certificados"| ACME
    INEGI -.->|"importado al catálogo municipalities"| BT

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `CLAUDE.md`
- `docs/Banco_de_Talentos_Documento_General.md`
- `backend/config/mail.php`
- `backend/config/filesystems.php`
