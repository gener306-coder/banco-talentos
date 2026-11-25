# Documentación técnica — Banco de Talentos

Documentación técnica del sistema tal como está en `main`, verificada contra el código. Es la fuente única de dos salidas:
- **esta documentación viva**, que GitHub muestra con sus diagramas Mermaid;
- **un PDF formal** en tamaño Carta, más cada diagrama en SVG y PNG, generados con `sh scripts/docs-pdf.sh` (ver [Generación](#generación)).

Sprint: [Sprint 20](../sprint-20.md). Estado: completo. Los siete capítulos y los 18 diagramas están verificados contra el código, y el PDF formal se genera con `sh scripts/docs-pdf.sh`.

## Capítulos

El orden de esta lista es el orden del PDF.

1. **Visión general**
   1. [Visión general y alcance](01-vision-general/01-vision-y-alcance.md)
   2. [Stack tecnológico y versiones](01-vision-general/02-stack.md)
   3. [Arquitectura: monolito modular](01-vision-general/03-arquitectura.md)
   4. Decisiones de arquitectura (ADRs)
      - [ADR-001 — Monolito modular](01-vision-general/adr/ADR-001-monolito-modular.md)
      - [ADR-002 — Packer y Terraform](01-vision-general/adr/ADR-002-packer-terraform.md)
      - [ADR-003 — Infraestructura inmutable](01-vision-general/adr/ADR-003-infraestructura-inmutable.md)
      - [ADR-004 — VPC sin NAT Gateway](01-vision-general/adr/ADR-004-vpc-sin-nat.md)
      - [ADR-005 — OIDC entre GitHub Actions y AWS](01-vision-general/adr/ADR-005-oidc-github-aws.md)
      - [ADR-006 — Privacidad por diseño](01-vision-general/adr/ADR-006-privacidad-por-diseno.md)
2. **Dominio y proceso**
   1. [Roles y casos de uso](02-dominio-y-proceso/01-roles-y-casos-de-uso.md)
   2. [Matriz de permisos](02-dominio-y-proceso/02-matriz-de-permisos.md)
   3. [Metodología: Sprints, PRs y CI/CD](02-dominio-y-proceso/03-metodologia.md)
3. **Datos**
   1. [Modelo de datos](03-datos/01-modelo-de-datos.md)
   2. [Almacenamiento de archivos y S3](03-datos/02-almacenamiento-s3.md)
   3. [Ficha compartida: lista blanca revocable](03-datos/03-ficha-compartida.md)
4. **Backend**
   1. [Arquitectura Laravel](04-backend/01-arquitectura-laravel.md)
   2. [Catálogo resumido de la API](04-backend/02-catalogo-api.md)
   3. [Colas y procesamiento de video](04-backend/03-colas-y-video.md)
   4. [Correos transaccionales con marca](04-backend/04-correos-transaccionales.md)
5. **Frontend**
   1. [Arquitectura de la SPA](05-frontend/01-arquitectura-spa.md)
   2. [Componentes compartidos](05-frontend/02-componentes-compartidos.md)
   3. [Tokens de marca y CSP](05-frontend/03-tokens-y-csp.md)
6. **Infraestructura y operación**
   1. [Topología AWS](06-infraestructura/01-topologia-aws.md)
   2. [AMI inmutable con Packer](06-infraestructura/02-packer.md)
   3. [Terraform](06-infraestructura/03-terraform.md)
   4. [GitHub Actions y CI/CD](06-infraestructura/04-github-actions.md)
   5. [Operación del piloto](06-infraestructura/05-operacion.md)
7. **Calidad y entorno**
   1. [Seguridad](07-calidad-y-entorno/01-seguridad.md)
   2. [Estrategia y conteos de pruebas](07-calidad-y-entorno/02-estrategia-de-pruebas.md)
   3. [Entorno local (Linux, macOS y Windows con WSL 2)](07-calidad-y-entorno/03-entorno-local.md)

## Catálogo de diagramas

`sh scripts/docs-pdf.sh diagramas` compara esta tabla con los bloques de los capítulos: cada identificador debe existir una sola vez y no puede haber bloques fuera del catálogo.

| ID | Diagrama | Tipo | Capítulo | Origen en el repositorio |
|---|---|---|---|---|
| D01 | Casos de uso por rol | `flowchart` | [Roles y casos de uso](02-dominio-y-proceso/01-roles-y-casos-de-uso.md) | `UserRole.php`, `routes/api.php` |
| D02 | C4 nivel 1: contexto del sistema | `flowchart` | [Visión general](01-vision-general/01-vision-y-alcance.md) | `config/mail.php`, `config/filesystems.php`, `Caddyfile` |
| D03 | C4 nivel 2: contenedores | `flowchart` | [Arquitectura](01-vision-general/03-arquitectura.md) | `Caddyfile`, `infra/packer/files/systemd/`, `envs/pilot/main.tf` |
| D04 | C4 nivel 3: componentes del backend | `flowchart` | [Arquitectura Laravel](04-backend/01-arquitectura-laravel.md) | `bootstrap/app.php`, `app/Http/`, `app/Services/`, `app/Jobs/` |
| D05a | ER: cuentas y organizaciones | `erDiagram` | [Modelo de datos](03-datos/01-modelo-de-datos.md) | migraciones de `users`, `institutions`, `companies`, `municipalities`, `account_audit_events` |
| D05b | ER: alumnos y CV | `erDiagram` | [Modelo de datos](03-datos/01-modelo-de-datos.md) | migraciones de `students` y `student_*`, `skills` |
| D05c | ER: vinculación | `erDiagram` | [Modelo de datos](03-datos/01-modelo-de-datos.md) | migraciones de `opportunities`, `linkage_*`, `student_disclosures` |
| D05d | ER: medios y tablas de soporte | `erDiagram` | [Modelo de datos](03-datos/01-modelo-de-datos.md) | migraciones de `institution_videos`, `sessions`, `cache`, `jobs` |
| D06 | Secuencia: verificación del correo de acceso | `sequenceDiagram` | [Correos transaccionales](04-backend/04-correos-transaccionales.md) | `AccountEmailController.php`, `AccessEmailLink.php` |
| D07 | Secuencia: cambio del correo de acceso | `sequenceDiagram` | [Correos transaccionales](04-backend/04-correos-transaccionales.md) | `AccountEmailController.php`, `RequestAccessEmailChangeRequest.php` |
| D08 | Estados de una solicitud de vinculación | `stateDiagram-v2` | [Roles y casos de uso](02-dominio-y-proceso/01-roles-y-casos-de-uso.md) | `LinkageRequestStatus.php`, migraciones de `linkage_requests` |
| D09 | Secuencia: vinculación y ficha compartida | `sequenceDiagram` | [Ficha compartida](03-datos/03-ficha-compartida.md) | `StudentDisclosureController.php`, `StudentDisclosure.php`, `TerminatesLinkage.php` |
| D10 | Secuencia: subida y transcodificación de video | `sequenceDiagram` | [Colas y video](04-backend/03-colas-y-video.md) | `InstitutionVideoController.php`, `ProcessInstitutionVideo.php`, `VideoProcessor.php` |
| D11 | Topología AWS del piloto | `flowchart` | [Topología AWS](06-infraestructura/01-topologia-aws.md) | `infra/terraform/modules/*` |
| D12 | Construcción de la AMI con Packer | `flowchart` | [Packer](06-infraestructura/02-packer.md) | `build-ami.yml`, `banco-talentos.pkr.hcl`, `infra/packer/scripts/` |
| D13 | Pipeline de CI/CD | `flowchart` | [GitHub Actions](06-infraestructura/04-github-actions.md) | `ci.yml`, `build-ami.yml`, `deploy-pilot.yml` |
| D14 | Federación OIDC con AWS | `sequenceDiagram` | [GitHub Actions](06-infraestructura/04-github-actions.md) | `infra/terraform/bootstrap/main.tf` |
| D15 | Flujo de Sprints y Pull Requests | `flowchart` | [Metodología](02-dominio-y-proceso/03-metodologia.md) | `CLAUDE.md`, `docs/sprint-*.md` |

## Convenciones

- **Un diagrama, un lugar.** Cada diagrama es un bloque ```` ```mermaid ```` dentro del capítulo que lo usa. Su primera línea es `%% <ID>: <título>`. No existen copias `.mmd`: el script extrae los bloques desde los capítulos.
- **Tema de marca.** En GitHub los diagramas usan el tema de la plataforma, para leerse en modo claro y oscuro. Los nodos clave llevan clases con la paleta oficial. Las exportaciones y el PDF aplican además [`tools/mermaid-theme.json`](tools/mermaid-theme.json): vino `#991B30`, gris grafito `#57565B` y dorado `#B99058`, este último solo en bordes y separadores ([identidad visual](../design/identidad-visual.md)).
- **Verificable.** Cada capítulo termina con «Fuentes en el repositorio». Una afirmación sin fuente no entra.
- **Sin binarios en Git.** `docs/tecnica/build/` está en `.gitignore`.

## Generación

Solo necesitas Docker o Podman. La imagen (`tools/Dockerfile`) fija Node 24, el Chromium de Playwright 1.63, Mermaid 12.3.0, Paged.js 0.4.3 y markdown-it 15.0.3, con las fuentes Noto.

```sh
sh scripts/docs-pdf.sh             # PDF formal en tamaño Carta (también valida y exporta los diagramas)
sh scripts/docs-pdf.sh diagramas   # solo valida los diagramas y exporta build/diagramas/Dxx.svg y Dxx.png
```

| Salida | Ruta |
|---|---|
| PDF formal | `docs/tecnica/build/Banco-de-Talentos-Documentacion-Tecnica.pdf` |
| Diagramas | `docs/tecnica/build/diagramas/Dxx.svg` y `Dxx.png` (a 2×) |
| HTML intermedio | `docs/tecnica/build/pdf/documento.html` (para depurar la maquetación) |

**Cómo se arma el PDF** (`tools/build.mjs`):
1. Exporta los diagramas.
2. Arma el documento:
   - portada con los logotipos oficiales, leídos de `frontend/public/brand/` sin copiarlos;
   - «Acerca de este documento»;
   - el contenido y el índice de figuras, con números de página;
   - los capítulos en el orden de la lista de arriba.
3. Pagina con Paged.js:
   - tamaño Carta;
   - encabezado con el capítulo y pie con la parte y «Página X de Y»;
   - páginas horizontales solo para D06, D07, D09 y D10.

La maquetación vive en `assets/pdf.css` y `assets/portada.html`. La portada indica el commit con el que se generó el PDF; si hay cambios sin confirmar en `docs/tecnica/`, lo marca con `+cambios`.
