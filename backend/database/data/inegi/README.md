# Catálogo de municipios (INEGI)

`municipios.csv` es el catálogo de municipios con el que el servidor calcula la ubicación aproximada de alumnos y empresas (HU-S4-04, PostGIS Fase B).

## Fuente y atribución

Fuente: INEGI. *Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades*. <https://www.inegi.org.mx/app/ageeml/>

La información se usa conforme a los [Términos de Libre Uso de la Información del INEGI](https://www.inegi.org.mx/inegi/terminos.html), que permiten reproducirla y transformarla citando la fuente. Este archivo **transforma** los catálogos originales: une cada municipio con las coordenadas de una localidad de referencia y conserva solo las columnas que usa el sistema. No es un producto oficial del INEGI.

## Edición

| Catálogo | Archivo del INEGI | Generado por el INEGI | Registros usados |
| --- | --- | --- | --- |
| Municipios (AGEM) | `catun_municipio.zip` → `AGEEML_20268211656753_utf8.csv` | 21 de agosto de 2026 | 2,478 municipios |
| Localidades | `catun_localidad.zip` → `AGEEML_20251141548499.csv` | 14 de enero de 2025 | Coordenadas de la localidad de referencia |

Descargados el 21 de octubre de 2026 desde <https://www.inegi.org.mx/contenidos/app/ageeml/>. Era la publicación más reciente. Según el historial de cortes del propio catálogo, el número de municipios es de **2,478** desde el corte de agosto de 2024; antes era de 2,475 a 2,477. Es una edición estable.

## Columnas

| Columna | Contenido |
| --- | --- |
| `code` | Clave geoestadística de 5 dígitos: estado y municipio (`CVEGEO`). |
| `state_code` | Clave INEGI del estado (`01`–`32`). |
| `municipality_code` | Clave del municipio dentro del estado (3 dígitos). |
| `name` | Nombre oficial del municipio o alcaldía. |
| `reference_locality_code`, `reference_locality_name` | Localidad cuyas coordenadas se usan como punto del municipio. |
| `latitude`, `longitude` | Coordenadas decimales (WGS 84) de esa localidad, con 6 decimales. |

**Punto de referencia:** es la **cabecera municipal** (`CVE_CAB`), no el centroide del polígono, porque en municipios grandes y despoblados el centroide puede caer en zonas vacías. Las 16 alcaldías de la Ciudad de México no tienen cabecera (`----`); para ellas se usa su localidad más poblada, que es su zona urbana.

## Regenerarlo con una edición nueva

```bash
python3 -I scripts/inegi/build-municipios.py <municipios_utf8.csv> <localidades.csv> backend/database/data/inegi/municipios.csv
```

Después:

1. Actualiza esta tabla de edición.
2. Actualiza `App\Support\MunicipalityCatalog::EXPECTED_COUNT` con el nuevo número de municipios.
3. Crea una migración nueva que llame a `MunicipalityCatalog::sync()`.

La carga es un upsert por clave: actualiza los nombres y los puntos sin borrar municipios a los que ya apuntan alumnos o empresas.
