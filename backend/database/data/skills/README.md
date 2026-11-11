# Catálogo semilla de habilidades

`top_skills.csv` es la propuesta de catálogo inicial para `skills`, preparada en la planeación del Sprint 10. Su objetivo es que el autocompletar no arranque vacío (arranque en frío). **Todavía no lo carga el sistema:** la carga y la búsqueda tolerante a errores esperan a que sus historias se aprueben en el archivo del Sprint.

## Contenido

820 habilidades curadas para los perfiles de Educación Dual en México: 757 `technical` y 63 `soft`.

| Bloque | Filas |
| --- | --- |
| Desarrollo de software | 180 |
| Manufactura (Lean, Six Sigma, Core Tools, CNC, CAD/CAM, metrología) | 121 |
| Mecatrónica (PLC, HMI/SCADA, robótica, neumática, redes industriales) | 87 |
| Electrónica y electricidad (PCB, IPC, embebidos, NOM-001-SEDE) | 79 |
| Ciencia de datos y BI | 75 |
| Finanzas y contabilidad (NIF, CFDI 4.0, nómina, CONTPAQi/Aspel) | 66 |
| Logística y comercio exterior (IMMEX, Anexo 24/30, T-MEC, Carta Porte) | 63 |
| Marketing y ventas | 59 |
| Transversales (Office, gestión de proyectos, seguridad industrial STPS) | 27 |
| Habilidades blandas | 63 |

## Columnas

| Columna | Contenido |
| --- | --- |
| `name` | Nombre visible, de hasta 80 caracteres (`skills.name`). |
| `kind` | `technical` o `soft` (`App\Enums\SkillKind`). |

## Criterios de curaduría

- **Herramientas y tecnologías:** se escriben con su nombre comercial oficial (`JavaScript`, `Node.js`, `C#`, `SolidWorks`, `Siemens TIA Portal`).
- **Conceptos:** van en español (`Control estadístico de procesos`, `Trabajo en equipo`). Las siglas de uso común en la industria se conservan (`PLC`, `CNC`, `5S`, `SMED`, `NIF`, `SEO`).
- **Duplicados:** no puede haber dos habilidades con el mismo slug de `App\Support\CatalogSlug::from` (minúsculas, sin acentos, espacios simples). Una habilidad que pertenece a dos perfiles, como `Kanban`, aparece una sola vez.
- **Excluido:**
  - Niveles de idioma, porque ya los cubre `student_languages`.
  - Nichos ajenos al modelo dual, como medicina clínica o artes escénicas.

## Editarlo

La fuente editable son las listas de `scripts/skills/build-top-skills.py`, no el CSV. Para agregar, quitar o renombrar una habilidad, edita su bloque en el script y regenera el archivo:

```bash
python3 -I scripts/skills/build-top-skills.py backend/database/data/skills/top_skills.csv
```

Antes de escribir, el script valida la longitud, los espacios, el conteo (de 500 a 1,000) y que no haya slugs repetidos. Si algo falla, lista los errores y no modifica el CSV.

Una carga futura no debe pisar habilidades que ya existan en la base. El tipo y el nombre de una habilidad los fija quien la registró primero (`SkillCatalog::ids()` usa `insertOrIgnore`).
