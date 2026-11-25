# Correos transaccionales con marca

> **Estado:** pendiente de redacción (T-S20-05). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Las 8 notificaciones, su entrega inmediata o en cola, y la plantilla con marca.
- Verificación y cambio del correo de acceso.

## Verificación del correo de acceso

```mermaid
%% D06: Secuencia, verificación del correo de acceso
sequenceDiagram
    autonumber
    participant P as Persona usuaria
    participant SPA as SPA, Mi cuenta
    participant API as API Laravel
    participant DB as PostgreSQL
    participant M as Proveedor SMTP

    P->>SPA: Verificar mi correo
    SPA->>API: POST /api/me/email/verification
    API->>DB: Bloquea la fila de users
    alt Ya verificado o con un cambio pendiente
        API-->>SPA: 422 con el motivo
    else Menos de 60 s desde el último enlace
        API-->>SPA: 422, espera N segundos
    else Puede enviarse
        API->>DB: Guarda email_token_hash y email_token_sent_at
        Note over API,DB: Solo se guarda el SHA-256 del token, nunca el token
        API-)M: Tras el commit, ConfirmAccessEmail con enlace de 60 min
        API-->>SPA: 200 con email_link_delivery sent o pending
    end
    P->>SPA: Abre /confirm-email desde el correo
    SPA->>API: POST /api/account-email/confirm con el token
    API->>DB: Busca por hash, vigente y con cuenta activa
    alt Vencido, usado o cancelado
        API-->>SPA: 422 EMAIL_LINK_INVALID
    else Válido
        API->>DB: email_verified_at y borra el token
        API-->>SPA: 200 con result verified
    end
    Note over P,API: Activar la cuenta con un enlace enviado por correo también verifica, el enlace manual no (D7 del Sprint 19)
```

## Cambio del correo de acceso

```mermaid
%% D07: Secuencia, cambio del correo de acceso
sequenceDiagram
    autonumber
    participant P as Persona usuaria
    participant SPA as SPA, Mi cuenta
    participant API as API Laravel
    participant DB as PostgreSQL
    participant M as Proveedor SMTP

    P->>SPA: Nuevo correo y contraseña actual
    SPA->>API: POST /api/me/email
    API->>API: Valida la contraseña y que el correo esté libre
    API->>DB: Bloquea users y guarda pending_email y el hash del token
    API-)M: Aviso a la dirección actual, AccessEmailChangeRequested
    API-)M: Enlace a la dirección nueva, ConfirmAccessEmail
    API-->>SPA: 200, cambio pendiente
    opt Reenviar o cancelar
        SPA->>API: POST /api/me/email/resend o /cancel
    end
    P->>SPA: Abre el enlace desde la dirección nueva
    SPA->>API: POST /api/account-email/confirm con el token
    API->>DB: Busca por hash y bloquea la fila
    alt La dirección nueva ya la ocupa otra cuenta
        API->>DB: Descarta el cambio
        API-->>SPA: 409 EMAIL_TAKEN
    else Válido
        API->>DB: Borra los enlaces de contraseña del correo anterior
        API->>DB: email y email_verified_at, rota remember_token
        API->>DB: Cierra las demás sesiones de la cuenta
        API->>DB: Bitácora email_changed y contacto de la organización si coincidía
        API->>API: Regenera la sesión de este navegador
        API-)M: AccessEmailChanged a la dirección anterior y a la nueva, en cola
        API-->>SPA: 200 con result changed
    end
```

## Fuentes en el repositorio

- `backend/app/Notifications/`
- `backend/resources/views/vendor/mail/`
- `backend/app/Services/AccessEmailLink.php`
- `backend/app/Http/Controllers/AccountEmailController.php`
