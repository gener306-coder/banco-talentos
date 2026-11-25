# ADR-001 — Monolito modular

[Índice de la documentación técnica](../../README.md) · [Arquitectura](../03-arquitectura.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha de la decisión | Inicio del proyecto, septiembre de 2026 (Sprint 1) |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

El MVP debía cubrir cuatro roles, aislamiento estricto entre organizaciones, datos personales protegidos y un flujo de vinculación con varios estados. El equipo es pequeño y el piloto es de bajo costo. La propuesta original no exigía escalar componentes por separado.

## Decisión

Construir **un monolito modular**:
- una API REST en Laravel y una SPA en React + TypeScript, desplegadas como una sola versión;
- una base de datos PostgreSQL + PostGIS;
- módulos por dominio (acceso, gobierno de cuentas, alumnos, búsqueda, vinculación, medios y seguimiento) dentro del mismo código.

`CLAUDE.md` lo establece como regla y excluye explícitamente:
- microservicios;
- Kubernetes;
- Redis durante el MVP, salvo necesidad demostrada;
- Laravel Octane durante el MVP, salvo pruebas que lo justifiquen.

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| Microservicios | El aislamiento entre organizaciones y las transacciones de vinculación (bloqueos `FOR UPDATE` sobre la oportunidad y la solicitud) son más simples y seguros en una sola base y un solo proceso. Varios servicios añadirían red, versionado de contratos y despliegues coordinados sin beneficio para el tamaño del piloto. |
| Kubernetes u orquestación de contenedores | Costo y operación desproporcionados para una sola instancia. |
| Redis para colas, caché y sesiones | PostgreSQL ya cubre los tres casos con los controladores `database` de Laravel. El volumen del piloto no justifica otro servicio con estado. |
| Laravel Octane | No hay mediciones que lo pidan. Además, el estado entre peticiones de Octane complica el aislamiento por sesión. |

## Consecuencias

**Positivas:**
- Un solo artefacto (`release-<sha>.tar.gz`) y una sola AMI por versión.
- Las transacciones y restricciones de la base (FK compuestas, índices parciales, triggers de solo inserción) protegen las reglas de negocio de punta a punta.
- Pest prueba toda la API contra PostgreSQL real; Playwright recorre los flujos completos de los roles.

**Negativas y mitigaciones:**
- El escalamiento es vertical (tipo de instancia) mientras no se separen los workers. La cola ya está aislada en sus propios procesos (`bt-queue@default` y `bt-queue@videos`), así que mover la transcodificación a otra instancia no exige cambiar código.
- Sin Redis, la cola y la caché cargan la base. La simulación de carga (`docs/simulacion-carga.md`) cargó 16 instituciones y 42 712 alumnos: todas las vistas quedaron por debajo del objetivo de p95 (3 s en páginas y 5 s en búsquedas), y la más lenta fue el reporte ejecutivo, con 385 ms. Midió la latencia de peticiones secuenciales, no la concurrencia; esa medición queda pendiente para un escalamiento posterior.

## Fuentes en el repositorio

- `CLAUDE.md` (Arquitectura)
- `docs/Banco_de_Talentos_Documento_General.md` §10
- `infra/terraform/envs/pilot/main.tf` (`SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`)
- `infra/packer/files/systemd/bt-queue@.service`
- `docs/simulacion-carga.md`
