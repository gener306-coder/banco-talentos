# Metodología: Sprints, PRs y CI/CD

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Historias en Jira y archivo del Sprint vigente.
- Reportes `HU-SN-NN` y tareas `T-*`.
- Flujo de ramas, PRs y despliegue.

## Flujo de Sprints y Pull Requests

```mermaid
%% D15: Flujo metodológico de Sprints y Pull Requests
flowchart TB
    subgraph PLANEA["Planeación"]
        direction LR
        JIRA["Historia<br/>en Jira"]:::external --> SPR["Copia al archivo<br/>del Sprint vigente"]:::container --> AUD["Auditoría de solo lectura<br/>y decisiones del responsable"]:::container --> BR["Rama de<br/>trabajo"]:::container
    end
    subgraph CONSTRUYE["Construcción"]
        direction LR
        IMP["Implementación con validación,<br/>autorización y pruebas"]:::container --> REP["Reporte HU-SN-NN<br/>o tarea T-* en el Sprint"]:::container --> PR["Pull Request<br/>con CI verde"]:::container --> REV{"Revisión y<br/>autorización"}
        REV -->|"cambios"| IMP
    end
    subgraph ENTREGA["Entrega"]
        direction LR
        MERGE["Merge<br/>a main"]:::container --> DEP["Build AMI y<br/>Deploy pilot"]:::container --> VAL["Validación funcional<br/>en el piloto"]:::container --> CLOSE["Cierre del Sprint:<br/>el archivo queda histórico"]:::system
    end
    PLANEA --> CONSTRUYE
    CONSTRUYE -->|"aprobado"| ENTREGA

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Fuentes en el repositorio

- `CLAUDE.md` (Desarrollo)
- `docs/sprint-*.md`
- `docs/HU-*.md`
