# Catálogo semilla de habilidades

`top_skills.csv` es el catálogo inicial de `skills` (HU-S10-01). Su objetivo es que el autocompletar no arranque vacío (arranque en frío). Se carga con `php artisan skills:seed` en cada entorno, después de migrar y cada vez que cambie el archivo ([docs/HU-S10-01.md](../../../../docs/HU-S10-01.md)).

## Contenido

820 habilidades curadas para los perfiles de Educación Dual en México: 757 `technical` y 63 `soft`. 12 llevan alias.

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
| `aliases` | Opcional. Abreviaturas o nombres alternos con los que también se encuentra la habilidad, separados por `\|`: `c sharp\|csharp`. |

## Criterios de curaduría

- **Herramientas y tecnologías:** se escriben con su nombre comercial oficial (`JavaScript`, `Node.js`, `C#`, `SolidWorks`, `Siemens TIA Portal`).
- **Conceptos:** van en español (`Control estadístico de procesos`, `Trabajo en equipo`). Las siglas de uso común en la industria se conservan (`PLC`, `CNC`, `5S`, `SMED`, `NIF`, `SEO`).
- **Duplicados:** no puede haber dos habilidades con el mismo slug de `App\Support\CatalogSlug::from` (minúsculas, sin acentos, espacios simples). Una habilidad que pertenece a dos perfiles, como `Kanban`, aparece una sola vez.
- **Alias:** van en minúsculas y sin acentos. Solo se agregan abreviaturas o nombres alternos de uso real (`js`, `k8s`, `ml`). Un mismo alias puede apuntar a varias habilidades (`bd`), pero no puede ser igual al nombre de otra habilidad.
- **Excluido:**
  - Niveles de idioma, porque ya los cubre `student_languages`.
  - Nichos ajenos al modelo dual, como medicina clínica o artes escénicas.

## Editarlo

La fuente editable son las listas y el diccionario `ALIASES` de `scripts/skills/build-top-skills.py`, no el CSV. Para agregar, quitar o renombrar una habilidad, o cambiar sus alias, edita el script y regenera el archivo:

```bash
python3 -I scripts/skills/build-top-skills.py backend/database/data/skills/top_skills.csv
```

Antes de escribir, el script valida la longitud, los espacios, el conteo (de 500 a 1,000), que no haya slugs repetidos y los alias. Si algo falla, lista los errores y no modifica el CSV.

Después de regenerarlo, ejecuta `skills:seed`. Para las habilidades que ya existen, el comando actualiza el tipo y los alias con los del archivo, pero nunca cambia su nombre. Quitar una habilidad del archivo no la borra de la base.
