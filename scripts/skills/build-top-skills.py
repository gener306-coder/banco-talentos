"""Genera y valida el catálogo semilla de habilidades (backend/database/data/skills/top_skills.csv).

Las listas de abajo son la fuente editable: un bloque por perfil de Educación Dual y uno de habilidades
blandas. ALIASES agrega las abreviaturas con las que también se busca una habilidad (tercera columna,
separadas por «|»); un mismo alias puede apuntar a varias habilidades. Antes de escribir valida longitud
(≤ 80), espacios, conteo (500–1,000), slugs únicos tal como los calcula App\\Support\\CatalogSlug::from
y los alias; si algo falla no escribe nada.

Uso: python3 -I scripts/skills/build-top-skills.py backend/database/data/skills/top_skills.csv
"""
import csv
import re
import sys
import unicodedata

T = "technical"
S = "soft"

BLOCKS = {
    "software": """
Python|JavaScript|TypeScript|Java|C#|C++|C|PHP|Go|Kotlin|Swift|Dart|Rust|Ruby|SQL|Bash|PowerShell
HTML|CSS|Sass|Tailwind CSS|Bootstrap|React|Angular|Vue.js|Next.js|Nuxt|Svelte|Redux|jQuery
Node.js|Express|NestJS|Django|Flask|FastAPI|Spring Boot|.NET|ASP.NET Core|Entity Framework|Laravel|Symfony|Ruby on Rails
Flutter|React Native|Android|iOS|Jetpack Compose|SwiftUI|.NET MAUI|Ionic|Electron
PostgreSQL|MySQL|MariaDB|SQL Server|Oracle Database|SQLite|MongoDB|Redis|Firebase|Supabase|Elasticsearch|DynamoDB|PostGIS
Modelado de bases de datos|Normalización de bases de datos|PL/SQL|T-SQL|Procedimientos almacenados|ORM
REST API|GraphQL|gRPC|WebSockets|OpenAPI|Postman|Microservicios|Arquitectura de software|Patrones de diseño
Programación orientada a objetos|Programación funcional|Estructuras de datos|Algoritmos|Principios SOLID|Clean Code|Domain-Driven Design
Git|GitHub|GitLab|Bitbucket|Control de versiones|Code review|Docker|Docker Compose|Kubernetes|Linux|Nginx|Apache HTTP Server
CI/CD|GitHub Actions|GitLab CI|Jenkins|Terraform|Ansible|AWS|Microsoft Azure|Google Cloud Platform|AWS Lambda|Amazon S3|Amazon EC2|Serverless
Pruebas unitarias|Pruebas de integración|Pruebas end-to-end|TDD|Jest|Vitest|Cypress|Playwright|Selenium|JUnit|PHPUnit|Pest|pytest|Testing Library
Pruebas manuales de software|Aseguramiento de calidad de software|Accesibilidad web|Diseño responsivo|Diseño UX/UI|Figma|Prototipado de interfaces
Seguridad de aplicaciones web|OWASP Top 10|OAuth 2.0|JWT|Autenticación y autorización|Ciberseguridad|Redes de computadoras|TCP/IP|Cisco CCNA
Administración de servidores|Virtualización|VMware|Windows Server|Active Directory|Soporte técnico|Mesa de ayuda|ITIL
Scrum|Metodologías ágiles|Jira|Confluence|Trello|Análisis de requerimientos|UML|Documentación técnica
WordPress|Shopify|Salesforce|SAP ABAP|Power Apps|Power Automate|Low-code|Webpack|Vite|npm|Composer|Maven|Gradle|Visual Studio Code|Unity
Desarrollo web|Desarrollo de aplicaciones móviles|Desarrollo backend|Desarrollo frontend|Consumo de APIs|Expresiones regulares|Programación concurrente
""",
    "datos": """
R|Pandas|NumPy|SciPy|Matplotlib|Seaborn|Plotly|Scikit-learn|TensorFlow|Keras|PyTorch|Jupyter|Google Colab
Estadística descriptiva|Estadística inferencial|Probabilidad|Análisis de regresión|Series de tiempo|Análisis predictivo
Aprendizaje automático|Aprendizaje profundo|Redes neuronales|Árboles de decisión|Clustering|Procesamiento de lenguaje natural
Visión por computadora|OpenCV|IA generativa|Ingeniería de prompts|Modelos de lenguaje (LLM)|Hugging Face|MLOps|MLflow
Análisis de datos|Análisis exploratorio de datos|Limpieza de datos|Visualización de datos|Minería de datos|Big Data
Apache Spark|Hadoop|Apache Kafka|Apache Airflow|ETL|Almacenes de datos|Modelado dimensional|Databricks|Snowflake|BigQuery|Amazon Redshift|dbt
Power BI|Tableau|Looker Studio|Qlik Sense|DAX|Power Query|Tablas dinámicas|Inteligencia de negocios|Tableros de control (KPI)
Pruebas A/B|Web scraping|Beautiful Soup|Gobierno de datos|Calidad de datos|Optimización matemática|Investigación de operaciones
SPSS|SAS|KNIME|Alteryx|Análisis geoespacial|QGIS|ArcGIS|Storytelling con datos
""",
    "mecatronica": """
PLC|Programación de PLC|Allen-Bradley|Siemens TIA Portal|Siemens S7-1200|Siemens S7-1500|Studio 5000|RSLogix 500|CODESYS
Diagrama de escalera (Ladder)|Texto estructurado (IEC 61131-3)|GRAFCET|HMI|SCADA|FactoryTalk View|WinCC|Ignition SCADA
Variadores de frecuencia|Servomotores|Motores a pasos|Control de motores eléctricos|Neumática|Electroneumática|Hidráulica|Electrohidráulica|FluidSIM
Sensores industriales|Actuadores|Instrumentación industrial|Control de procesos|Control PID|Sistemas de control|Teoría de control
Robótica industrial|Programación de robots industriales|Robots FANUC|Robots ABB|RobotStudio|Robots KUKA|Robots Yaskawa Motoman|Robots colaborativos|Universal Robots
Visión artificial industrial|Cognex In-Sight|Keyence|Redes industriales|PROFINET|PROFIBUS|EtherNet/IP|Modbus|IO-Link|OPC UA
Industria 4.0|Internet industrial de las cosas (IIoT)|Gemelo digital|Automatización industrial|Integración de sistemas automatizados|Celdas de manufactura
Mantenimiento industrial|Mantenimiento preventivo|Mantenimiento correctivo|Mantenimiento predictivo|Análisis de vibraciones|Termografía industrial|Lubricación industrial
Diseño mecánico|Diseño de máquinas|Mecanismos|Resistencia de materiales|Transmisión de potencia|Diseño de herramentales|Diseño de dispositivos de sujeción (fixtures)
MATLAB|Simulink|LabVIEW|ROS|Arduino|Raspberry Pi|Diagramas eléctricos de control|Tableros de control eléctrico|Seguridad de máquinas (ISO 13849)
Impresión 3D|Manufactura aditiva|Bandas transportadoras|Sistemas de manejo de materiales|Ingeniería de confiabilidad|Cinemática de robots
""",
    "manufactura": """
Lean Manufacturing|5S|Kaizen|Kanban|Mapeo de flujo de valor (VSM)|SMED|TPM|OEE|Poka-Yoke|Jidoka|Just in Time|Heijunka|Trabajo estandarizado|Gemba|Andon|Hoshin Kanri
Six Sigma|Lean Six Sigma|Six Sigma Yellow Belt|Six Sigma Green Belt|DMAIC|Control estadístico de procesos|Gráficas de control|Capacidad de procesos (Cp y Cpk)
AMEF|PFMEA|DFMEA|Plan de control|APQP|PPAP|MSA|Gage R&R|8D|Análisis de causa raíz|Diagrama de Ishikawa|5 porqués|Reporte A3|Ciclo PDCA|Core Tools AIAG
IATF 16949|ISO 9001|ISO 14001|ISO 45001|ISO 13485|AS9100|Auditorías de calidad|Auditoría por capas (LPA)|Sistemas de gestión de calidad
Inspección de calidad|Control de calidad|Aseguramiento de calidad|Ingeniería de calidad|Atención a quejas de cliente|Mejora continua|Gestión de la calidad total
Metrología|Metrología dimensional|Calibración de instrumentos|Máquina de medición por coordenadas (CMM)|Calibrador vernier|Micrómetro|GD&T
Interpretación de planos|Dibujo técnico|CAD|CAM|AutoCAD|SolidWorks|CATIA|Siemens NX|Autodesk Inventor|Fusion 360|Creo Parametric|Mastercam
CNC|Programación CNC|Código G|Torno CNC|Centro de maquinado CNC|Fresadora|Torno convencional|Maquinado|Herramientas de corte|Controles FANUC CNC|Haas CNC
Soldadura|Soldadura MIG|Soldadura TIG|Soldadura por arco (SMAW)|Soldadura por puntos|Inyección de plástico|Moldes de inyección|Troquelado|Estampado de metales
Tratamientos térmicos|Pintura industrial|Ensamble|Selección de materiales|Ciencia de materiales|Ensayos no destructivos|Ensayos de materiales
Ingeniería de procesos|Ingeniería industrial|Ingeniería de manufactura|Industrialización de productos (NPI)|Estudio de tiempos y movimientos|Balanceo de líneas
Distribución de planta|Ergonomía|Simulación de procesos|FlexSim|Planeación de la producción|Programación de la producción|MRP|Teoría de restricciones
Documentación de procesos|Instrucciones de trabajo|Diseño de experimentos (DOE)|Minitab|Costos de manufactura|Productividad industrial
""",
    "electronica": """
Electrónica analógica|Electrónica digital|Electrónica de potencia|Circuitos eléctricos|Análisis de circuitos|Diseño de circuitos|Simulación de circuitos
Diseño de PCB|Altium Designer|KiCad|Autodesk Eagle|OrCAD|Proteus|Multisim|LTspice|Lectura de diagramas electrónicos|Componentes electrónicos
Soldadura electrónica|Soldadura SMD|Retrabajo de tarjetas electrónicas|IPC-A-610|IPC J-STD-001|IPC/WHMA-A-620|Tecnología de montaje superficial (SMT)|Control de descargas electrostáticas (ESD)
Microcontroladores|Microcontroladores PIC|STM32|ESP32|Sistemas embebidos|Programación de sistemas embebidos|FPGA|VHDL|Verilog|FreeRTOS
I2C|SPI|UART|CAN bus|Internet de las cosas (IoT)|MQTT|LoRaWAN|Bluetooth Low Energy
Osciloscopio|Multímetro|Generador de funciones|Instrumentación electrónica|Fuentes de alimentación|Acondicionamiento de señales|Procesamiento digital de señales
Telecomunicaciones|Radiofrecuencia|Antenas|Fibra óptica|Cableado estructurado|Instalaciones eléctricas|Instalaciones eléctricas residenciales|Instalaciones eléctricas industriales
NOM-001-SEDE|Subestaciones eléctricas|Transformadores|Máquinas eléctricas|Sistemas fotovoltaicos|Energías renovables|Eficiencia energética|Calidad de la energía
Baterías y almacenamiento de energía|Electromovilidad|Electrónica automotriz|Diagnóstico automotriz|Pruebas eléctricas|Pruebas en circuito (ICT)|Pruebas funcionales de tarjetas
Arneses eléctricos|Domótica|Sistemas de videovigilancia (CCTV)|Mantenimiento electrónico|Control electrónico|Electricidad industrial
""",
    "logistica": """
Logística|Cadena de suministro|Gestión de inventarios|Control de inventarios|Análisis ABC de inventarios|Conteo cíclico|Valuación de inventarios|Lote económico (EOQ)
Gestión de almacenes|WMS|TMS|Picking y empaque|Cross-docking|FIFO y FEFO|Recepción y embarque de mercancías|Operación de montacargas|Seguridad en almacenes
Distribución|Transporte de carga|Planeación de rutas|Logística de última milla|Logística inversa|Logística internacional|Gestión de flotillas|Fletes y tarifas
Compras|Abastecimiento estratégico|Gestión de proveedores|Desarrollo de proveedores|Planeación de materiales|Planeación de la demanda|Pronóstico de la demanda|S&OP
Comercio exterior|Incoterms 2020|Aduanas|Clasificación arancelaria|Pedimentos aduanales|Programa IMMEX|Anexo 24|Anexo 30|T-MEC|Reglas de origen|Certificación OEA
Importación y exportación|Tráfico de mercancías|Complemento Carta Porte|Embalaje industrial|Mercancías peligrosas|Trazabilidad|Código de barras|RFID
SAP MM|SAP SD|SAP EWM|ERP|Microsoft Dynamics 365|Odoo|Indicadores logísticos|Costos logísticos|Gestión de pedidos|Planeación de la capacidad|Control de materiales en piso
""",
    "finanzas": """
Contabilidad general|Contabilidad financiera|Contabilidad de costos|Contabilidad gerencial|NIF|NIIF (IFRS)|US GAAP|Estados financieros|Análisis financiero|Razones financieras
Conciliaciones bancarias|Cuentas por pagar|Cuentas por cobrar|Tesorería|Flujo de efectivo|Presupuestos|Control presupuestal|Planeación financiera|Modelado financiero
Evaluación de proyectos de inversión|VPN y TIR|Finanzas corporativas|Costeo ABC|Costos estándar|Cierre contable|Pólizas contables|Activos fijos|Depreciación
Auditoría financiera|Auditoría interna|Control interno|Contabilidad fiscal|ISR|IVA|Declaraciones fiscales|CFDI 4.0|Facturación electrónica|Complemento de pagos|Portal del SAT|Contabilidad electrónica
Nómina|Cuotas obrero-patronales IMSS|INFONAVIT|SUA e IDSE|Ley Federal del Trabajo|CONTPAQi|Aspel COI|Aspel NOI|Aspel SAE|SAP FI|SAP CO|QuickBooks
Excel financiero|Matemáticas financieras|Crédito y cobranza|Análisis de crédito|Gestión de riesgos financieros|Mercados financieros|Instrumentos financieros
Prevención de lavado de dinero (PLD)|Cumplimiento normativo|Reportes financieros|Consolidación financiera|Costos de producción|Análisis de costos|Punto de equilibrio
""",
    "marketing": """
Marketing digital|Mercadotecnia estratégica|Investigación de mercados|Segmentación de mercados|Comportamiento del consumidor|Branding|Posicionamiento de marca|Plan de marketing
SEO|SEM|Google Ads|Meta Ads|TikTok Ads|LinkedIn Ads|Google Analytics 4|Google Tag Manager|Google Search Console|Analítica web|Métricas de marketing|ROI y ROAS
Marketing de contenidos|Copywriting|Gestión de redes sociales|Community management|Email marketing|Mailchimp|HubSpot|Inbound marketing|Automatización de marketing|Growth marketing
CRM|Zoho CRM|Embudos de venta|Ventas consultivas|Ventas B2B|Prospección de clientes|Gestión de cuentas clave|Pronóstico de ventas|Estrategia de precios
Comercio electrónico|Gestión de marketplaces|Trade marketing|Merchandising|Publicidad|Relaciones públicas|Marketing de influencers|Marketing B2B|Mercadotecnia internacional|Benchmarking
Diseño gráfico|Adobe Photoshop|Adobe Illustrator|Canva|Adobe Premiere Pro|Edición de video|Fotografía de producto|Experiencia del cliente (CX)|Net Promoter Score (NPS)|Servicio al cliente
""",
    "transversal": """
Microsoft Excel|Excel avanzado|Macros en Excel (VBA)|Microsoft Word|Microsoft PowerPoint|Microsoft Outlook|Microsoft Teams|Microsoft 365|Google Workspace|Google Sheets
Gestión de proyectos|PMBOK|Microsoft Project|Elaboración de reportes técnicos|Lectura e interpretación de normas|Matemáticas aplicadas
Seguridad industrial|Higiene industrial|Normas Oficiales Mexicanas de la STPS|Bloqueo y etiquetado (LOTO)|Uso de equipo de protección personal|Trabajos en altura|Espacios confinados
Primeros auxilios|Protección civil|Manejo de residuos peligrosos|Gestión ambiental
""",
}

SOFT = """
Comunicación efectiva|Comunicación oral|Comunicación escrita|Hablar en público|Escucha activa|Asertividad|Persuasión|Retroalimentación efectiva
Trabajo en equipo|Colaboración|Trabajo multidisciplinario|Trabajo remoto|Relaciones interpersonales|Respeto a la diversidad
Liderazgo|Delegación|Mentoría|Toma de decisiones|Gestión del cambio|Negociación|Manejo de conflictos
Resolución de problemas|Pensamiento crítico|Pensamiento analítico|Pensamiento lógico|Pensamiento sistémico|Pensamiento estratégico|Creatividad|Innovación
Adaptabilidad|Flexibilidad|Tolerancia a la ambigüedad|Trabajo bajo presión|Tolerancia a la frustración|Resiliencia|Inteligencia emocional|Empatía
Gestión del tiempo|Organización|Planificación|Atención al detalle|Sentido de urgencia|Seguimiento de instrucciones|Autogestión|Autonomía
Responsabilidad|Puntualidad|Proactividad|Iniciativa|Compromiso|Disciplina|Ética profesional|Integridad|Motivación|Actitud de servicio
Orientación a resultados|Orientación al cliente|Aprendizaje continuo|Aprendizaje autónomo|Curiosidad|Mentalidad de crecimiento|Emprendimiento|Visión de negocio
"""


# Abreviaturas y nombres alternos con los que también se busca una habilidad (HU-S10-01). Se escriben ya
# normalizados (minúsculas, sin acentos). Un alias puede repetirse en varias habilidades.
ALIASES = {
    "JavaScript": ["js"],
    "TypeScript": ["ts"],
    "C#": ["c sharp", "csharp"],
    "C++": ["cpp"],
    "Go": ["golang"],
    "Kubernetes": ["k8s"],
    "Aprendizaje automático": ["ml", "machine learning"],
    "Aprendizaje profundo": ["dl", "deep learning"],
    "Procesamiento de lenguaje natural": ["nlp", "pln"],
    "Inteligencia de negocios": ["bi", "business intelligence"],
    "Modelado de bases de datos": ["bd"],
    "Normalización de bases de datos": ["bd"],
}


def split(text):
    return [item.strip() for line in text.strip().splitlines() for item in line.split("|") if item.strip()]


def slug(name):
    """Réplica de CatalogSlug::from: espacios simples, sin acentos, minúsculas."""
    name = re.sub(r"\s+", " ", name).strip()
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return ascii_.lower()


rows = [(n, T) for block in BLOCKS.values() for n in split(block)] + [(n, S) for n in split(SOFT)]

errors = []
seen = {}
for name, kind in rows:
    if len(name) > 80:
        errors.append(f"> 80: {name}")
    if name != re.sub(r"\s+", " ", name).strip():
        errors.append(f"espacios: {name!r}")
    key = slug(name)
    if key in seen:
        errors.append(f"slug duplicado: {name!r} ~ {seen[key]!r}")
    seen[key] = name
if not 500 <= len(rows) <= 1000:
    errors.append(f"conteo fuera de rango: {len(rows)}")

names = {name for name, _ in rows}
for name, aliases in ALIASES.items():
    if name not in names:
        errors.append(f"alias de una habilidad que no existe: {name!r}")
    if len(set(aliases)) != len(aliases):
        errors.append(f"alias repetido en {name!r}")
    for alias in aliases:
        if alias != slug(alias) or not alias or "|" in alias or len(alias) > 80:
            errors.append(f"alias sin normalizar o inválido en {name!r}: {alias!r}")
        # Un alias igual al slug de una habilidad no aporta: esa búsqueda ya la resuelve el prefijo.
        if alias in seen:
            errors.append(f"el alias {alias!r} de {name!r} es el nombre de la habilidad {seen[alias]!r}")
if errors:
    print("\n".join(errors))
    sys.exit(1)

with open(sys.argv[1], "w", encoding="utf-8", newline="") as fh:
    writer = csv.writer(fh, lineterminator="\n")
    writer.writerow(["name", "kind", "aliases"])
    writer.writerows((name, kind, "|".join(ALIASES.get(name, []))) for name, kind in rows)

counts = {}
for block, text in BLOCKS.items():
    counts[block] = len(split(text))
counts["soft"] = len(split(SOFT))
print(len(rows), counts, "con alias:", len(ALIASES))
