# Modelo de datos

> **Estado:** pendiente de redacción (T-S20-04). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- 28 tablas en 4 dominios, extraídas de las 46 migraciones (incluidas las 9 de SQL crudo).
- Restricciones `CHECK`, FK compuestas `(student_id, institution_id)`, índices parciales y triggers de inmutabilidad.
- PostGIS (`geography(Point, 4326)`), `pg_trgm` y `fuzzystrmatch`.

## Cuentas y organizaciones

```mermaid
%% D05a: Modelo de datos, cuentas y organizaciones
erDiagram
    institutions ||--o{ users : "cuentas INSTITUTION"
    companies ||--o{ users : "cuentas COMPANY"
    users ||--o{ users : "created_by"
    users ||--o{ companies : "registered_by"
    municipalities ||--o{ companies : "municipio"
    users |o--o{ account_audit_events : "actor, nulo si es la consola"

    users {
        bigint id PK
        varchar name
        varchar email UK
        varchar password "hash, nunca texto plano"
        enum role "ADMIN, INSTITUTION, COMPANY, SECRETARY"
        boolean is_active
        bigint institution_id FK
        bigint company_id FK
        bigint created_by FK "quién creó la cuenta"
        boolean password_setup_required
        varchar setup_delivery "email o manual"
        timestamptz email_verified_at
        varchar pending_email
        char email_token_hash "SHA-256 del enlace"
        timestamptz email_token_sent_at
    }
    institutions {
        bigint id PK
        uuid public_id UK
        varchar name
        varchar cct UK
        varchar contact_name
        varchar contact_email
        varchar contact_phone
        boolean is_active
        timestamptz onboarding_dismissed_at
    }
    companies {
        bigint id PK
        varchar legal_name
        varchar rfc UK
        varchar sector_code
        char municipality_code FK
        geography location "calculada por el servidor"
        varchar contact_email
        boolean is_active
        bigint registered_by FK
    }
    municipalities {
        char code PK "clave INEGI"
        char state_code
        varchar name
        geography location "cabecera municipal"
    }
    account_audit_events {
        bigint id PK
        bigint actor_id FK
        varchar actor_kind "user o console"
        varchar event
        varchar subject_type
        bigint subject_id
        jsonb changed_fields
        timestamptz created_at "inmutable por trigger"
    }
    institution_password_setup_tokens {
        varchar email PK
        varchar token "hash"
        timestamp created_at
    }
    institution_password_reset_tokens {
        varchar email PK
        varchar token "hash"
        timestamp created_at
    }
```

## Alumnos y CV

```mermaid
%% D05b: Modelo de datos, alumnos y CV
erDiagram
    direction LR
    institutions ||--o{ students : "padrón"
    municipalities ||--o{ students : "municipio"
    students ||--o| student_identities : "identidad, protegida"
    students ||--o| student_social_security : "seguro, protegido"
    students ||--o{ student_skills : "habilidades"
    skills ||--o{ student_skills : "catálogo"
    students ||--o{ student_languages : "idiomas"
    students ||--o{ student_certifications : "certificaciones"
    student_certifications ||--o| student_certification_credentials : "credencial, protegida"
    students ||--o{ student_projects : "proyectos"
    students ||--o{ student_links : "enlaces, protegidos"
    users |o--o{ student_certifications : "verified_by"

    students {
        bigint id PK "interno, nunca expuesto"
        uuid public_id UK "identificador externo"
        bigint institution_id FK
        varchar program
        varchar period_type
        smallint period_number
        boolean dual_available
        char municipality_code FK
        geography location "calculada por el servidor"
        boolean can_relocate
        varchar headline
        varchar headline_search "generada, trigramas"
        boolean is_active "baja lógica"
    }
    student_identities {
        bigint student_id FK "FK compuesta con institution_id"
        varchar enrollment_number "única por institución"
        varchar given_names
        varchar first_surname
        varchar second_surname
    }
    student_social_security {
        bigint student_id FK
        varchar insurance_type
        text nss "cifrado"
        char nss_hash "único por institución"
        text policy_number "cifrado"
        varchar document_path "disco privado"
        char document_sha256
    }
    skills {
        bigint id PK
        varchar name
        varchar slug UK
        varchar kind "technical o soft"
        jsonb aliases
    }
    student_skills {
        bigint student_id PK, FK
        bigint skill_id PK, FK
        smallint position
    }
    student_languages {
        bigint student_id PK, FK
        varchar language_code PK
        smallint level "1 a 7"
    }
    student_certifications {
        bigint id PK
        bigint student_id FK
        varchar name
        varchar issuer
        date issued_on
        date expires_on
        timestamptz verified_at
        bigint verified_by FK
    }
    student_certification_credentials {
        bigint certification_id PK, FK
        varchar credential_id
        varchar credential_url
        boolean verifiable
    }
    student_projects {
        bigint id PK
        bigint student_id FK
        varchar title
        varchar description
    }
    student_links {
        bigint id PK
        bigint student_id FK
        varchar kind "github, linkedin, behance, portfolio, other"
        varchar url
    }
```

## Vinculación

```mermaid
%% D05c: Modelo de datos, vinculación
erDiagram
    companies ||--o{ opportunities : "publica"
    opportunities ||--o{ opportunity_skills : "requiere"
    skills ||--o{ opportunity_skills : "catálogo"
    opportunities ||--o{ linkage_requests : "lugar solicitado"
    companies ||--o{ linkage_requests : "solicita"
    students ||--o{ linkage_requests : "por public_id"
    institutions ||--o{ linkage_requests : "responde"
    linkage_requests ||--o{ linkage_messages : "conversación"
    linkage_requests ||--o{ student_disclosures : "a lo más una vigente"
    users ||--o{ linkage_requests : "requested_by, responded_by, terminated_by"

    opportunities {
        bigint id PK
        bigint company_id FK
        varchar title
        varchar program
        smallint period_number
        smallint vacancies "1 a 50"
        char municipality_code FK
        geography location "calculada por el servidor"
        varchar language_code
        smallint min_level
        boolean is_active "baja lógica"
        bigint created_by FK
    }
    opportunity_skills {
        bigint opportunity_id PK, FK
        bigint skill_id PK, FK
        smallint position
    }
    linkage_requests {
        bigint id PK
        bigint company_id FK
        bigint opportunity_id FK
        bigint student_id FK
        bigint institution_id FK
        varchar status "PENDIENTE_INSTITUCION, ACEPTADA, RECHAZADA, CANCELADA, BAJA"
        varchar message
        bigint responded_by FK
        timestamptz responded_at
        timestamptz terminated_at
        varchar terminated_party
        timestamptz last_message_at
    }
    linkage_messages {
        bigint id PK
        bigint linkage_request_id FK
        varchar sender_party "COMPANY o INSTITUTION"
        bigint sender_user_id FK
        varchar body
        timestamptz created_at "inmutable por trigger"
    }
    student_disclosures {
        bigint id PK
        bigint linkage_request_id FK
        bigint institution_id FK
        bigint company_id FK
        bigint student_id FK
        jsonb fields "subconjunto de full_name, links, credentials"
        timestamptz consent_confirmed_at
        bigint disclosed_by FK
        timestamptz disclosed_at
        bigint revoked_by FK
        timestamptz revoked_at
        varchar revoked_reason "institution o termination"
    }
```

## Medios y tablas de soporte

```mermaid
%% D05d: Modelo de datos, medios y tablas de soporte
erDiagram
    direction LR
    institutions ||--o{ institution_videos : "publica"
    users ||--o{ institution_videos : "created_by, deleted_by"
    users |o--o{ sessions : "sesión"

    institution_videos {
        bigint id PK
        uuid public_id UK
        bigint institution_id FK
        bigint created_by FK
        varchar title
        varchar status "PROCESSING, READY, FAILED"
        varchar source_path "original en disco local"
        varchar video_path "MP4 H.264"
        varchar webm_path "VP9, opcional"
        varchar poster_path "JPG"
        integer duration_seconds
        bigint output_bytes
        boolean is_active
        timestamp consent_confirmed_at
        timestamptz deleted_at "archivos eliminados"
    }
    sessions {
        varchar id PK
        bigint user_id
        varchar ip_address
        integer last_activity
    }
    cache {
        varchar key PK
        mediumtext value
        bigint expiration
    }
    cache_locks {
        varchar key PK
        varchar owner
        bigint expiration
    }
    jobs {
        bigint id PK
        varchar queue "default o videos"
        longtext payload
        smallint attempts
        integer available_at
    }
    failed_jobs {
        bigint id PK
        varchar uuid UK
        text queue
        longtext exception
        timestamp failed_at
    }
```

## Fuentes en el repositorio

- `backend/database/migrations/`
