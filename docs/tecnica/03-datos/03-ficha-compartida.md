# Ficha compartida: lista blanca revocable

> **Estado:** pendiente de redacción (T-S20-04). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- `StudentDisclosure::SHAREABLE` y los campos que nunca se comparten.
- Consentimiento, vigencia, revocación y bitácora de solo inserción.

## Vinculación y ficha compartida

```mermaid
%% D09: Secuencia, vinculación y ficha compartida
sequenceDiagram
    autonumber
    participant E as Empresa
    participant API as API Laravel
    participant DB as PostgreSQL
    participant I as Institución
    participant M as Proveedor SMTP

    E->>API: GET /api/talent, perfiles anónimos por public_id
    E->>API: POST /api/linkage-requests con public_id y oportunidad
    API->>DB: Verifica lugar y unicidad, estado PENDIENTE_INSTITUCION
    I->>API: PATCH /api/institution/linkage-requests/ID/decision
    API->>DB: Bloquea la oportunidad, acepta si quedan lugares
    I->>API: POST .../ID/disclosure con grupos y consentimiento
    API->>DB: Solo vinculaciones propias y ACEPTADA, si no 404 o 422
    API->>DB: INSERT student_disclosures con fields dentro de SHAREABLE
    Note over API,DB: Índice único parcial, una ficha vigente por vinculación. Trigger de solo inserción
    API-)M: StudentProfileShared a las cuentas activas de la empresa, sin datos del alumno
    E->>API: GET /api/linkage-requests/ID/disclosure
    API->>DB: Vigente, ACEPTADA y de la empresa de la sesión
    API-->>E: 200 con nombre, enlaces o credenciales, solo lo compartido
    Note over E,API: Nunca matrícula, seguro, students.id, location ni verified_by
    alt La institución deja de compartir
        I->>API: PATCH .../ID/disclosure/revoke
        API->>DB: revoked_reason institution
    else Baja de la vinculación
        I->>API: PATCH .../ID/termination, o la empresa en su ruta
        API->>DB: Estado BAJA y revoked_reason termination
    end
    E->>API: GET /api/linkage-requests/ID/disclosure
    API-->>E: 404, la ficha ya no está disponible
```

## Fuentes en el repositorio

- `backend/app/Models/StudentDisclosure.php`
- `backend/app/Http/Controllers/StudentDisclosureController.php`
- `backend/app/Http/Controllers/Concerns/TerminatesLinkage.php`
- `backend/database/migrations/2026_11_25_000001_create_student_disclosures_table.php`
