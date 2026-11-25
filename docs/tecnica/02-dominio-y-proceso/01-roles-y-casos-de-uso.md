# Roles y casos de uso

> **Estado:** pendiente de redacción (T-S20-03). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Los cuatro roles y por qué el alumno no es usuario.
- Casos de uso por rol.
- Ciclo de vida de una vinculación.

## Casos de uso por rol

```mermaid
%% D01: Casos de uso por rol
flowchart LR
    ADM(["Administrador"]):::actor
    SEC(["Secretaría de Economía"]):::actor
    INS(["Institución"]):::actor
    EMP(["Empresa"]):::actor
    ALU["Alumno: no es usuario,<br/>lo administra su institución"]:::external

    subgraph TODOS["Todos los roles"]
        direction LR
        T1["Iniciar sesión y ver<br/>su inicio con indicadores"] ~~~ T2["Mi cuenta: nombre, contraseña<br/>y correo verificado"] ~~~ T3["Ver la galería<br/>de promoción dual"]
    end
    subgraph AS["Administración y Secretaría"]
        direction LR
        AS1["Reporte ejecutivo<br/>y exportación CSV"] ~~~ AS2["Gestionar cuentas<br/>de la Secretaría"]
    end
    subgraph SOLOADM["Solo Administración"]
        direction LR
        A1["Gestionar instituciones<br/>y sus cuentas"] ~~~ A2["Gestionar cuentas<br/>de Administración"] ~~~ A3["Consultar<br/>la bitácora"] ~~~ A4["Inactivar videos<br/>promocionales"]
    end
    subgraph SOLOSEC["Solo Secretaría"]
        direction LR
        S1["Validar empresas y<br/>gestionar sus cuentas"]
    end
    subgraph SOLOINS["Solo Institución"]
        direction LR
        I1["Padrón, expediente<br/>y CV del alumno"] ~~~ I2["Seguro facultativo<br/>y comprobante"] ~~~ I3["Aceptar o rechazar<br/>solicitudes"] ~~~ I4["Compartir o dejar de<br/>compartir la ficha"] ~~~ I5["Publicar videos<br/>promocionales"]
    end
    subgraph SOLOEMP["Solo Empresa"]
        direction LR
        E1["Buscar talento<br/>anónimo"] ~~~ E2["Publicar oportunidades<br/>duales"] ~~~ E3["Solicitar o cancelar<br/>una vinculación"] ~~~ E4["Consultar la<br/>ficha compartida"]
    end
    subgraph IE["Institución y Empresa"]
        direction LR
        C1["Perfil de la<br/>organización"] ~~~ C2["Conversar en la<br/>vinculación aceptada"] ~~~ C3["Dar de baja una<br/>vinculación aceptada"]
    end

    ADM --- TODOS
    SEC --- TODOS
    INS --- TODOS
    EMP --- TODOS
    ADM --- AS
    SEC --- AS
    ADM --- SOLOADM
    SEC --- SOLOSEC
    INS --- SOLOINS
    EMP --- SOLOEMP
    INS --- IE
    EMP --- IE
    INS -.-|"administra"| ALU

    classDef actor fill:#991B30,stroke:#991B30,color:#ffffff
    classDef system fill:#991B30,stroke:#B99058,stroke-width:3px,color:#ffffff
    classDef container fill:#ffffff,stroke:#991B30,stroke-width:2px,color:#57565B
    classDef store fill:#ffffff,stroke:#57565B,stroke-width:2px,color:#57565B
    classDef external fill:#ffffff,stroke:#57565B,stroke-dasharray:5 4,color:#57565B
```

## Estados de una solicitud de vinculación

```mermaid
%% D08: Estados de una solicitud de vinculación
stateDiagram-v2
    direction LR
    [*] --> PENDIENTE_INSTITUCION: La empresa solicita desde el perfil anónimo
    PENDIENTE_INSTITUCION --> ACEPTADA: La institución acepta si hay lugar
    PENDIENTE_INSTITUCION --> RECHAZADA: La institución rechaza
    PENDIENTE_INSTITUCION --> CANCELADA: La empresa cancela
    ACEPTADA --> BAJA: Empresa o institución dan de baja
    RECHAZADA --> [*]
    CANCELADA --> [*]
    BAJA --> [*]
    note right of ACEPTADA
        Conversación entre las partes.
        La institución puede compartir la ficha.
    end note
    note right of BAJA
        Libera el lugar de la oportunidad
        y revoca la ficha compartida.
    end note
```

## Fuentes en el repositorio

- `backend/app/Enums/UserRole.php`
- `backend/routes/api.php`
- `backend/app/Enums/LinkageRequestStatus.php`
- `backend/app/Http/Controllers/InstitutionLinkageRequestController.php`
- `backend/app/Http/Controllers/LinkageRequestController.php`
