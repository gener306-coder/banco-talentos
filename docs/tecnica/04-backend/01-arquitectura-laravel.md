# Backend: arquitectura Laravel

> **Estado:** pendiente de redacción (T-S20-05). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Cadena de middleware, Form Requests, Concerns y Services.
- Anti-IDOR y cabeceras.

## Componentes del backend (C4 nivel 3)

```mermaid
%% D04: C4 nivel 3, componentes del backend
flowchart TB
    REQ["Petición HTTPS a /api"]:::external

    subgraph MW["Cadena de middleware"]
        direction LR
        H["ApiSecurityHeaders<br/>no-store, nosniff, DENY"] --> T["ThrottleApiRequests<br/>y throttle por nombre"]
        T --> A["auth:sanctum<br/>sesión con cookie"]
        A --> ACT["active<br/>EnsureUserIsActive"]
        ACT --> R["role<br/>EnsureRole"]
        R --> M["institution.member<br/>organization.member"]
    end

    FR["Form Requests, 54<br/>validación backend"]:::container
    RULES["Rules<br/>Rfc, PhoneNumber, SafeHttpsUrl,<br/>NoContactInformation, WorkCenterKey"]:::container
    C["Controladores, 32"]:::container
    CON["Concerns<br/>FindsOwnedStudent, TerminatesLinkage,<br/>RequiresOperable*, ManagesAccountAccess"]:::container
    SVC["Services<br/>AccessEmailLink, InitialPasswordLink,<br/>InstitutionAccounts, CompanyAccounts"]:::container
    MOD["Modelos Eloquent, 19"]:::container
    NOT["Notifications, 8<br/>correos con marca"]:::container
    JOB["Jobs, 2<br/>ProcessInstitutionVideo,<br/>NotifyLinkageMessage"]:::container
    DB[("PostgreSQL y PostGIS")]:::store
    Q[("Tabla jobs<br/>colas default y videos")]:::store

    REQ --> MW
    MW --> FR
    FR -.-> RULES
    FR --> C
    C --> CON
    C --> SVC
    C --> MOD
    CON --> MOD
    MOD --> DB
    C --> NOT
    SVC --> NOT
    C --> JOB
    JOB --> Q

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `backend/bootstrap/app.php`
- `backend/app/Http/`
- `backend/app/Services/`
