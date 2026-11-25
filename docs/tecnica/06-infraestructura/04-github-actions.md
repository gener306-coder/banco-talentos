# GitHub Actions y CI/CD

> **Estado:** pendiente de redacción (T-S20-06). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Los 3 workflows, entornos con aprobación, acciones fijadas por SHA.

## Pipeline de CI/CD

```mermaid
%% D13: Pipeline de CI/CD de punta a punta
flowchart TB
    subgraph DEV["Integración, ci.yml"]
        direction LR
        BR["Rama de<br/>trabajo"]:::external --> PR["Pull Request"]:::container --> CI["frontend: ESLint, tsc, Vitest,<br/>build y npm audit<br/>backend-lint: Pint<br/>backend-tests: Pest"]:::container --> MAIN["Merge a main<br/>con CI verde"]:::container
        CI -.->|"manual, e2e=true"| E2E["Playwright"]:::container
    end
    subgraph REL["Versión, build-ami.yml"]
        direction LR
        TAG["Tag v*"]:::external --> BA["Build AMI"]:::container --> AMI[("AMI")]:::store
    end
    subgraph DEPLOY["Despliegue manual, deploy-pilot.yml"]
        direction LR
        PLAN["plan<br/>entorno pilot-plan"] --> APPR{"Aprobación<br/>entorno pilot"} --> DRAIN["Detiene colas<br/>y respalda<br/>certificados"] --> APPLY["terraform apply<br/>reemplaza la EC2"] --> WAIT["Espera el<br/>agente SSM"] --> MIG["migrate, up<br/>y colas"] --> SMOKE["smoke.sh<br/>HTTPS y<br/>cabeceras"]
    end
    DEV --> REL
    REL --> DEPLOY

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Federación OIDC con AWS

```mermaid
%% D14: Federación OIDC entre GitHub Actions y AWS
sequenceDiagram
    autonumber
    participant J as Job de GitHub Actions
    participant T as Emisor OIDC de GitHub
    participant STS as AWS STS
    participant AWS as Servicios de AWS

    J->>T: Pide un JWT, permiso id-token write
    T-->>J: JWT con aud sts.amazonaws.com y sub repo:...:environment:pilot
    J->>STS: AssumeRoleWithWebIdentity con configure-aws-credentials
    STS->>STS: Valida la firma con el proveedor OIDC
    STS->>STS: Exige aud y sub exactos en la política de confianza del rol
    STS-->>J: Credenciales temporales del rol gha-build-ami o gha-deploy-pilot
    J->>AWS: Packer, Terraform y SSM con permisos mínimos
    Note over J,AWS: GitHub no guarda llaves de acceso de AWS. El plan usa el sub del entorno pilot-plan
```

## Fuentes en el repositorio

- `.github/workflows/ci.yml`
- `.github/workflows/build-ami.yml`
- `.github/workflows/deploy-pilot.yml`
- `infra/terraform/bootstrap/main.tf`
