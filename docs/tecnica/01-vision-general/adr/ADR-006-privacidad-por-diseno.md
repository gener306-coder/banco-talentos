# ADR-006 — Privacidad por diseño

[Índice de la documentación técnica](../../README.md) · [Ficha compartida](../../03-datos/03-ficha-compartida.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada. Actualizada el 24 de noviembre de 2026 con la excepción de la ficha compartida (Sprint 19, D1). |
| Fecha de la decisión | Sprints 1–4 (septiembre y octubre de 2026), como convención obligatoria de `CLAUDE.md` |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

La plataforma guarda datos personales de alumnos que no son usuarios ni dieron su consentimiento en la propia plataforma: identidad, número de seguridad social, póliza, enlaces personales y credenciales. Las empresas deben encontrar talento sin identificar a la persona, y cada institución solo debe ver y modificar a sus alumnos.

## Decisión

La privacidad se garantiza en **la estructura de los datos y en el backend**, no en la interfaz.

1. **Separación física de lo sensible.** La identidad (`student_identities`), el seguro (`student_social_security`), los enlaces (`student_links`) y las credenciales (`student_certification_credentials`) viven en tablas propias. `students` solo contiene el perfil que se puede mostrar sin identificar a nadie.
2. **Identificador público.** Las vistas externas usan `students.public_id` (UUID v4) y nunca `students.id`. Las rutas del buscador rechazan con `404` cualquier valor que no tenga forma de UUID.
3. **Listas explícitas de campos.** Cada consulta hacia `COMPANY` o `SECRETARY` nombra sus columnas, en lugar de serializar modelos completos. Nunca salen `students.id`, las columnas `location` ni las tablas sensibles.
4. **Aislamiento y anti-IDOR:**
   - toda consulta filtra por la organización de la sesión (trait `FindsOwnedStudent`, `where('institution_id', …)` o `where('company_id', …)`);
   - un recurso ajeno responde `404`, idéntico a uno inexistente.
5. **Aislamiento también en la base:**
   - las tablas del CV y las sensibles referencian `(student_id, institution_id)` con una FK compuesta hacia `students (id, institution_id)`, así que una fila no puede quedar ligada a un alumno de otra institución;
   - una institución nunca puede modificar alumnos de otra, y una empresa nunca puede modificar alumnos.
6. **Cifrado y búsqueda ciega:**
   - el NSS y la póliza se guardan con el cast `encrypted` (con `APP_KEY`);
   - la unicidad del NSS por institución usa un índice ciego: HMAC-SHA256 con una clave derivada de `APP_KEY` por HKDF (`SocialSecurityNumber::blindIndex`).
7. **Comprobantes privados.** El comprobante del seguro va a un disco privado (`PRIVATE_DOCUMENTS_DISK`, S3 en el piloto, prefijo `imss/`). Nunca se sirve por URL: solo se descarga con la sesión de su institución.
8. **Ubicación calculada en el servidor:**
   - el cliente nunca envía coordenadas;
   - `location` se toma de la cabecera municipal del catálogo INEGI y no se expone;
   - el buscador ordena por distancia, pero no devuelve las coordenadas.
9. **Textos sin datos de contacto.** Los textos que verá otra organización (titular, habilidades, certificaciones y proyectos del CV; mensaje de la solicitud y de la respuesta; motivo de baja; oportunidades y videos) pasan por la regla `NoContactInformation`, que rechaza correos, teléfonos y enlaces.

### Única excepción: la ficha compartida (Sprint 19, D1)

Tras aceptar una vinculación, la institución puede compartir con esa empresa una ficha ampliada del alumno. Se rige por estas condiciones:
- **Solo en una vinculación `ACEPTADA`** de la empresa de la sesión.
- **Por decisión explícita** de la institución, con una casilla de consentimiento del alumno o su tutor registrada con fecha (`consent_confirmed_at`).
- **Solo los grupos de la lista blanca** `StudentDisclosure::SHAREABLE` (`full_name`, `links` y `credentials`). Un `CHECK` de la base lo repite.
- **Nunca** la matrícula, el seguro, `students.id`, `location` ni `verified_by`.
- **Revocable.** La institución deja de compartirla cuando quiera, y la baja de la vinculación la revoca automáticamente.
- **Historial protegido.** Un trigger impide borrar filas de `student_disclosures` o cambiar lo que se compartió; la única actualización permitida es la revocación, una sola vez.

El detalle y el diagrama D09 están en [Ficha compartida](../../03-datos/03-ficha-compartida.md).

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| Una sola tabla de alumno con columnas ocultas en la serialización (`$hidden`) | Un error de serialización o un `select *` filtraría datos. Con tablas separadas, el dato solo sale si alguien lo consulta a propósito. |
| Autorizar solo en la interfaz | La API sería la superficie real de ataque. Toda regla vive en el backend y se prueba con Pest. |
| Responder `403` ante un recurso ajeno | `403` confirma que el recurso existe y permite enumerarlo. `404` no revela nada. |
| Compartir datos por la conversación | No deja consentimiento ni revocación auditables. La ficha compartida los registra. |

## Consecuencias

**Positivas:**
- El buscador y las vistas externas no pueden identificar al alumno.
- Las reglas se cumplen también ante errores del código, gracias a las FK compuestas y los `CHECK`.
- La excepción es auditable: quién compartió, cuándo, qué grupos, con qué consentimiento, y quién y por qué la revocó.

**Negativas y mitigaciones:**
- Más uniones en las consultas internas de la institución. Están indexadas por `student_id` y medidas en la simulación de carga.
- Perder `APP_KEY` deja el NSS y la póliza ilegibles. La llave se respalda fuera de AWS ([ADR-003](ADR-003-infraestructura-inmutable.md)).

## Fuentes en el repositorio

- `CLAUDE.md` (Privacidad por diseño, Aislamiento y Anti-IDOR, Geolocalización)
- `docs/sprint-19.md` (D1 a D5)
- `backend/app/Http/Controllers/Concerns/FindsOwnedStudent.php`
- `backend/app/Http/Controllers/TalentController.php`
- `backend/app/Models/StudentSocialSecurity.php` (cast `encrypted`), `backend/app/Support/SocialSecurityNumber.php`
- `backend/app/Models/StudentDisclosure.php`, `backend/app/Http/Controllers/StudentDisclosureController.php`
- `backend/app/Rules/NoContactInformation.php`
- `backend/database/migrations/2026_10_13_000000_create_students_tables.php`, `2026_10_16_000001_create_student_cv_tables.php`, `2026_11_25_000001_create_student_disclosures_table.php`
