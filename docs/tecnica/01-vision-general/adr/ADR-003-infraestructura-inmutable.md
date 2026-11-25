# ADR-003 — Infraestructura inmutable: una AMI por versión

[Índice de la documentación técnica](../../README.md) · [Arquitectura](../03-arquitectura.md)

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha de la decisión | 22 de noviembre de 2026 (plan del piloto, Sprint 17) |
| Registro | Retrospectivo, en el Sprint 20 |

## Contexto

Un servidor que se actualiza en sitio acumula diferencias que nadie registró, y si falla no se puede reconstruir con certeza. El piloto tiene una sola instancia: reemplazarla debe ser una operación rutinaria y sin pérdida de datos.

## Decisión

**Nunca se modifica una instancia en ejecución: cada versión es una AMI nueva que reemplaza la EC2.**

- **Imagen por versión.** La AMI lleva la aplicación horneada en `/opt` (de solo lectura, propiedad de `root`) y se etiqueta con el SHA del commit.
- **Reemplazo.** Terraform crea la instancia nueva antes de destruir la anterior (`create_before_destroy`) y la reemplaza también si cambia el `user_data` (`user_data_replace_on_change`). La Elastic IP pasa a la instancia nueva.
- **Estado fuera de la instancia:**
  - datos, sesiones, caché y cola en RDS;
  - videos, comprobantes del seguro y respaldo de los certificados de Caddy en S3 (prefijos `videos/`, `imss/` y `caddy/`);
  - configuración y secretos en SSM Parameter Store, que `bt-boot.sh` lee en cada arranque para escribir el `.env` en `/run`, en memoria.
- **Lo efímero en el disco** (`storage/` y `bootstrap/cache/`, enlazados a `/var/lib/banco-talentos/`) se puede perder sin daño: vistas compiladas, archivo de mantenimiento y originales de video en proceso.
- **Despliegue ordenado** (`deploy-pilot.yml`):
  1. detiene las colas de la instancia actual y respalda los certificados;
  2. aplica Terraform;
  3. espera al agente SSM de la instancia nueva;
  4. ejecuta `migrate --force` y `up`, y reinicia las colas;
  5. comprueba HTTPS y cabeceras con `smoke.sh`.
- **Arranque defensivo.** Si al arrancar hay migraciones pendientes o la base está vacía, `bt-boot.sh` deja la aplicación en mantenimiento en lugar de fallar.

## Alternativas y por qué no se eligieron

| Alternativa | Motivo |
|---|---|
| Actualizar en sitio (`git pull`, `composer install`) | Cambia un servidor vivo con resultados variables y exige acceso interactivo. |
| Guardar el estado en el disco de la EC2 | Reemplazar la instancia perdería comprobantes, videos y certificados. Para emitir certificados nuevos en cada despliegue habría que vigilar los límites de la autoridad ACME. |

## Consecuencias

**Positivas:**
- Volver a una versión anterior es desplegar su AMI. Cada versión es idéntica a lo que se verificó al construirla.
- La prueba de recreación de T-S17-09 confirmó que, tras reemplazar la instancia, sobreviven los datos, los archivos y las sesiones abiertas.
- Sin SSH: la administración es por SSM Session Manager.

**Negativas y mitigaciones:**
- Un video que se procesa durante el reemplazo queda como fallido y la institución lo vuelve a subir. Se mitiga deteniendo las colas antes de aplicar.
- Hay una ventana breve de mantenimiento mientras corren las migraciones.
- `APP_KEY` es crítica: cifra el NSS y la póliza. Vive en SSM como `SecureString`, no rota sin un plan y se respalda fuera de AWS.

## Fuentes en el repositorio

- `docs/infra/pilot-aws-plan.md` §1.2 y §2
- `infra/terraform/modules/compute/main.tf` (`create_before_destroy`, `user_data_replace_on_change`, EIP)
- `infra/packer/files/sbin/bt-boot.sh`, `infra/packer/files/sbin/bt-caddy-certs.sh`
- `infra/terraform/modules/storage/main.tf`
- `.github/workflows/deploy-pilot.yml`
- `docs/sprint-17.md` (T-S17-09, prueba de recreación)
