# Operación del piloto

[Índice de la documentación técnica](../README.md)

El procedimiento completo, con cada comando, está en el **[runbook del piloto](../../infra/runbook-pilot.md)**: primer despliegue, operación diaria, respaldos, recreación, pausa y destrucción. Este capítulo no lo repite. Resume qué contiene, cuándo usar cada sección y las notas operativas que la experiencia del piloto ya confirmó.

## Mapa del runbook

| Necesidad | Sección del runbook |
|---|---|
| Montar el piloto desde cero en una cuenta nueva | §0 a §6: requisitos locales, `bootstrap/`, secretos (`APP_KEY` y `MAIL_PASSWORD`), Resend y DNS en Hostinger, entornos de GitHub, primera AMI y primer despliegue, catálogo de habilidades y primer Administrador |
| Confirmar que funciona de punta a punta | §7, prueba funcional real (incluye video con FFmpeg 7.1 y comprobante en S3) |
| Demostrar que la instancia es reemplazable | §8, prueba de recreación |
| Entrar, ver logs, reintentar trabajos, mantenimiento, cambiar un parámetro, *rollback* | «Operación diaria» |
| Respaldos de RDS, del bucket y de `APP_KEY` | «Respaldos» |
| Pausar, reanudar o destruir conservando datos | «Pausar o destruir» |

## Despliegue de una versión

Ver [GitHub Actions y CI/CD](04-github-actions.md):
1. Fusionar en `main` con CI en verde.
2. Ejecutar **Build AMI** con un tag `v*` o de forma manual, y aprobar el entorno `pilot`.
3. Ejecutar **Deploy pilot**, revisar el plan y aprobar `pilot`.
4. Verificar las migraciones y la funcionalidad, según las notas siguientes.

**Rollback:** **Deploy pilot** con el `ami_id` anterior. Por eso las migraciones deben ser compatibles hacia atrás.

## Notas operativas verificadas

### Pausa y reanudación: el orden importa

**Pausar:**
1. Detener **primero la EC2**, para que los workers y el planificador no intenten usar una base ya detenida.
2. Esperar `instance-stopped`.
3. Detener **después RDS**.

**Reanudar, en orden inverso:**
1. Arrancar **primero RDS** y esperar `db-instance-available`.
2. Arrancar la EC2 y esperar `instance-running`.
3. Ejecutar `smoke.sh`.

**Lo que se conserva y lo que pasa al arrancar:**
- La instancia detenida conserva su disco y su Elastic IP, así que el registro A no cambia.
- Al arrancar, `bt-boot` vuelve a leer SSM, y Caddy usa el certificado guardado en el disco y respaldado en S3.
- **Si la EC2 arranca antes que la base**, la aplicación queda en mantenimiento. Se sale con `sudo bt-artisan up` por Session Manager, o con **Deploy pilot** de la misma AMI si hubo cambios de esquema.

Pausado, el piloto cuesta aproximadamente US$9 al mes: EBS, la EIP sin instancia en marcha y el almacenamiento de RDS y S3 (estimación del runbook).

### RDS se reinicia sola a los 7 días

AWS no permite tener una instancia de RDS detenida más de 7 días seguidos: al cumplirse, la arranca y vuelve a cobrar. Durante una pausa larga:
- se revisa su estado con `aws rds describe-db-instances … --query 'DBInstances[0].DBInstanceStatus'`, que muestra `available` si ya arrancó;
- se vuelve a detener cada semana;
- o, para pausas de varias semanas, conviene más «destruir conservando datos» con un snapshot.

### Verificar migraciones por SSM

El log de `deploy-pilot.yml` confirma que el paso de migraciones terminó, pero `gh run view --log` no muestra qué migraciones corrieron. Para confirmarlo:

```bash
$ aws ssm start-session --region us-east-2 --target <instance_id>
$ sudo bt-artisan migrate:status        # dentro de la instancia
```

Una migración aplicada aparece como `Ran` con su número de lote.

### PRs apilados: cambiar la base no relanza el CI

Al redirigir un PR apilado a `main`, GitHub **no** vuelve a ejecutar `ci.yml`. Antes de fusionarlo hay que:
- comparar con `git merge-tree --write-tree` que el árbol resultante sea idéntico al que ya pasó su CI;
- o lanzar `ci.yml` a mano.

### Otras notas

- **Credenciales de corta duración.** La sesión de `aws login` caduca. Si un comando local falla por credenciales en medio de una tarea, se renueva con `aws login` y se repite el comando.
- **`APP_KEY`.** Sin ella, ningún respaldo de la base descifra el NSS ni la póliza. Vive en SSM y en el gestor de contraseñas del responsable.
- **Parámetros.** Tras cambiar un parámetro en SSM hay que reiniciar `bt-boot`, PHP-FPM, Caddy y las colas, o redesplegar.

## Referencia histórica del piloto

Estos identificadores corresponden al **último despliegue registrado** (Sprints 18 y 19, 25 de noviembre de 2026, `docs/sprint-19.md`). Sirven como ejemplo y referencia: **cambian en cada despliegue**, así que siempre se toman de las salidas de Terraform o del resumen del workflow, nunca de este documento.

| Elemento | Valor registrado |
|---|---|
| Versión (`main`) | `ae66735` |
| Build AMI | Ejecución 45530619567 → `ami-08be59a77a7a7cafa` (us-east-2) |
| Deploy pilot | Ejecución 45537218160, plan 2 por agregar, 0 por cambiar y 2 por destruir |
| Instancia | `i-003d4d131e3b6d0e7` |

## Fuentes en el repositorio

- `docs/infra/runbook-pilot.md`
- `docs/sprint-17.md` (T-S17-09), `docs/sprint-19.md` (Cierre y despliegue)
- `.github/workflows/deploy-pilot.yml`, `infra/scripts/ssm-run.sh`, `infra/scripts/smoke.sh`
- `infra/packer/files/sbin/bt-boot.sh`, `infra/packer/files/sbin/bt-artisan`
