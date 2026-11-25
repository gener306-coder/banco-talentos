# Seguridad

[Índice de la documentación técnica](../README.md)

Este capítulo **consolida** las capas de seguridad del sistema, del navegador a la cuenta de AWS. Cada capa ya está explicada en su capítulo; aquí se resume qué protege, dónde vive y cómo se verifica.

## Capas, de extremo a extremo

| Capa | Qué protege | Mecanismo | Detalle |
|---|---|---|---|
| Navegador | Inyección de scripts, *clickjacking*, fugas por *referrer* | CSP estricta (`script-src 'self'`, sin código en línea; `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` | [Tokens y CSP](../05-frontend/03-tokens-y-csp.md) |
| Transporte | Lectura o alteración en tránsito | HTTPS con ACME (Caddy) y redirección de HTTP. TLS obligatorio hacia RDS (`rds.force_ssl`, `DB_SSLMODE=require`) y hacia S3 (política del bucket). SMTP por `smtps`. | [Topología AWS](../06-infraestructura/01-topologia-aws.md) |
| Sesión | Robo o fijación de sesión, CSRF | Cookie de sesión de Sanctum `Secure`, `HttpOnly` y `SameSite=Lax`, de 120 minutos. `X-XSRF-TOKEN` en cada escritura. La sesión se regenera al iniciar sesión y se invalida al salir. Cambiar el correo de acceso cierra las demás sesiones. | [Arquitectura de la SPA](../05-frontend/01-arquitectura-spa.md), [Correos](../04-backend/04-correos-transaccionales.md) |
| Credenciales | Contraseñas débiles o expuestas | Mínimo 12 caracteres y máximo 72 bytes (el límite de bcrypt). Solo se guarda el *hash*. Enlaces de un solo uso con el token guardado como *hash* y vigencia de 60 minutos. Respuestas neutras que no revelan si una cuenta existe. | [Correos](../04-backend/04-correos-transaccionales.md) |
| Abuso | Fuerza bruta y abuso de recursos | Límite general (300 escrituras por minuto por cuenta, 120 por IP) y límites con nombre (`login`: 5 por minuto por correo e IP, `password-forgot`: 3 por hora por correo, subidas, exportaciones…) | [Arquitectura Laravel](../04-backend/01-arquitectura-laravel.md#límites-con-nombre) |
| Autorización | Acceso fuera del rol o de la organización | Cadena `auth:sanctum` → `active` → `role:` → `*.member`. Filtro por organización en cada consulta, con `404` idéntico para lo ajeno (anti-IDOR). Sin rutas `DELETE`. | [Matriz de permisos](../02-dominio-y-proceso/02-matriz-de-permisos.md) |
| Entrada | Datos inválidos o fuera de contrato | Form Requests con `validated()`, 16 de ellos con rechazo explícito de campos no declarados, y `NoContactInformation` en los textos que verá otra organización. En la base, `CHECK`, FK compuestas e índices únicos parciales. | [Arquitectura Laravel](../04-backend/01-arquitectura-laravel.md), [Modelo de datos](../03-datos/01-modelo-de-datos.md) |
| Datos personales | Exposición del alumno | Tablas sensibles separadas, `public_id`, listas explícitas de campos, NSS y póliza cifrados con índice ciego HMAC, y comprobantes solo con sesión. La única excepción es la ficha compartida, con lista blanca `SHAREABLE` (repetida en un `CHECK`), consentimiento registrado, revocación e historial protegido por trigger. | [ADR-006](../01-vision-general/adr/ADR-006-privacidad-por-diseno.md), [Ficha compartida](../03-datos/03-ficha-compartida.md) |
| Archivos | Archivos maliciosos o públicos | Tipo, firma y tamaño validados. Bucket privado y cifrado, con URLs prefirmadas temporales. Los metadatos de los videos (GPS) se eliminan al transcodificar. | [Almacenamiento](../03-datos/02-almacenamiento-s3.md), [Colas y video](../04-backend/03-colas-y-video.md) |
| Trazabilidad | Acciones sin autor | `created_by`, `registered_by`, `requested_by`, `responded_by`, `disclosed_by`… y `account_audit_events` inmutable. La bitácora nunca muestra valores sensibles. | [Modelo de datos](../03-datos/01-modelo-de-datos.md#bitácora-de-trazabilidad) |
| Dependencias | Vulnerabilidades conocidas | `npm audit --audit-level=high` y `composer audit` en cada PR. Lockfiles y acciones de GitHub fijadas por SHA. | [GitHub Actions](../06-infraestructura/04-github-actions.md) |
| Secretos | Fuga de credenciales | En el repositorio no hay secretos: `.env`, `*.tfvars` y `*.tfstate` están ignorados, y el artefacto de la versión falla si contiene un `.env`. En AWS, los secretos viven en SSM como `SecureString`; `APP_KEY` y `MAIL_PASSWORD` nunca pasan por Terraform, y el `.env` solo existe en `/run` (memoria). | [Terraform](../06-infraestructura/03-terraform.md), [Packer](../06-infraestructura/02-packer.md) |
| Nube | Llaves de larga duración, acceso administrativo | OIDC con `sub` exacto por entorno, dos roles con permisos mínimos y aprobación del entorno `pilot`. Sin SSH: Session Manager. IMDSv2 obligatorio. Grupos de seguridad mínimos. RDS sin acceso público. | [ADR-005](../01-vision-general/adr/ADR-005-oidc-github-aws.md), [ADR-004](../01-vision-general/adr/ADR-004-vpc-sin-nat.md) |

## Verificación automática

| Qué | Dónde |
|---|---|
| Toda ruta de la API exige sesión, cuenta activa y rol, salvo las públicas por diseño. Esas públicas tienen su propio límite o firma. Las subidas y exportaciones tienen límite por cuenta. **No existe ninguna ruta `DELETE`.** Las respuestas autenticadas y los errores llevan `no-store` y las cabeceras de seguridad. El límite general responde `429` al excederse. | `backend/tests/Feature/ApiSecurityMatrixTest.php` |
| Aislamiento entre instituciones y empresas (`404`), privacidad del buscador y de la ficha, cifrado del NSS y comprobantes | Las pruebas Pest de cada historia (por ejemplo, `StudentSocialSecurityTest`, `StudentDisclosureTest`) |
| Contraste de los tokens y ausencia de colores fijos | `frontend/src/ui/tokens.test.ts` |
| Cabeceras del piloto: HSTS, CSP, `nosniff`, `no-referrer`, sin `Server`, `401` con `no-store` y redirección a HTTPS | `infra/scripts/smoke.sh`, en cada despliegue |
| Imagen sin configuración horneada (sin `.env`, cachés ni `instance.env`) | `infra/packer/scripts/99-verify.sh` |
| Dependencias vulnerables | `npm audit` y `composer audit` en `ci.yml` |

## Limitaciones conocidas

- **La CSP solo se aplica en el piloto.** Vite no la envía en local ni en las pruebas E2E, así que un recurso que la viole aparece primero en el piloto ([Tokens y CSP](../05-frontend/03-tokens-y-csp.md#cómo-se-verifica)).
- **Alta disponibilidad.** Una sola instancia en una zona; si la zona cae, el piloto cae ([ADR-004](../01-vision-general/adr/ADR-004-vpc-sin-nat.md)).
- **Escaneo continuo.** No hay WAF, escaneo de imágenes ni detección de intrusiones administrada (GuardDuty, Security Hub). La superficie se reduce con el grupo de seguridad, la ausencia de SSH y las cabeceras.
- **`APP_KEY`.** No se rota; su pérdida deja ilegibles el NSS y la póliza. Su respaldo depende del gestor de contraseñas del responsable.
- **Correo sin verificar.** Un correo de acceso sin verificar no bloquea el inicio de sesión (D6 del Sprint 19).

## Fuentes en el repositorio

- `backend/tests/Feature/ApiSecurityMatrixTest.php`
- `backend/app/Http/Middleware/`, `backend/app/Providers/AppServiceProvider.php`, `backend/bootstrap/app.php`
- `backend/app/Http/Requests/Concerns/InstitutionPasswordRules.php`, `backend/app/Http/Controllers/AuthController.php`
- `infra/terraform/envs/pilot/main.tf` (parámetros `SESSION_*`, `DB_SSLMODE`), `infra/terraform/modules/database/main.tf` (`rds.force_ssl`)
- `infra/packer/files/caddy/Caddyfile`, `infra/scripts/smoke.sh`, `infra/packer/scripts/99-verify.sh`
- `.github/workflows/ci.yml`, `.github/workflows/build-ami.yml`
- `.gitignore`, `infra/.gitignore`
- `docs/qa-pre-release-audit.md`
