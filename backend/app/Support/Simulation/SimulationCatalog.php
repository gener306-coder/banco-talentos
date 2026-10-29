<?php

namespace App\Support\Simulation;

/**
 * Listas de valores verosímiles para la simulación de carga (tarea transversal, no es una historia del Sprint). Sin
 * Faker: el proyecto no lo usa y así los datos no dependen de una biblioteca externa.
 */
final class SimulationCatalog
{
    public const GIVEN_NAMES = [
        'Sofía', 'Valentina', 'Regina', 'Camila', 'Ximena', 'María José', 'Renata', 'Fernanda', 'Daniela', 'Andrea',
        'Mariana', 'Victoria', 'Natalia', 'Paula', 'Alejandra', 'Ana Paula', 'Itzel', 'Guadalupe', 'Karla', 'Diana',
        'Valeria', 'Monserrat', 'Jimena', 'Abril', 'Ángela', 'Lucía', 'Fátima', 'Brenda', 'Citlali', 'Yaretzi',
        'Santiago', 'Mateo', 'Sebastián', 'Leonardo', 'Emiliano', 'Diego', 'Daniel', 'Miguel Ángel', 'Alejandro', 'Iker',
        'José Luis', 'Juan Pablo', 'Luis Fernando', 'Carlos', 'Jorge', 'Ricardo', 'Eduardo', 'Fernando', 'Óscar', 'Héctor',
        'Kevin', 'Brandon', 'Uriel', 'Axel', 'Ángel', 'Rodrigo', 'Gael', 'Emmanuel', 'Iván', 'Alan',
    ];

    public const SURNAMES = [
        'Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz',
        'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz',
        'Mendoza', 'Aguilar', 'Ortiz', 'Moreno', 'Castillo', 'Romero', 'Álvarez', 'Méndez', 'Chávez', 'Rivera',
        'Juárez', 'Ramos', 'Domínguez', 'Herrera', 'Medina', 'Castro', 'Vargas', 'Guzmán', 'Velázquez', 'Muñoz',
        'Rojas', 'De la Cruz', 'Contreras', 'Salazar', 'Luna', 'Ortega', 'Santiago', 'Guerrero', 'Estrada', 'Bautista',
        'Cortés', 'Soto', 'Alvarado', 'Espinoza', 'Lara', 'Ávila', 'Ríos', 'Cervantes', 'Solís', 'Delgado',
    ];

    /** Carreras por área; cada área tiene su propio conjunto de habilidades, certificaciones y proyectos. */
    public const PROGRAMS = [
        'tech' => ['Ingeniería en Sistemas Computacionales', 'Ingeniería en Tecnologías de la Información', 'Ingeniería en Software', 'Licenciatura en Ciencia de Datos', 'TSU en Desarrollo de Software Multiplataforma'],
        'engineering' => ['Ingeniería Mecatrónica', 'Ingeniería Industrial', 'Ingeniería Mecánica', 'Ingeniería Eléctrica', 'Ingeniería en Manufactura Avanzada', 'Ingeniería Química', 'TSU en Mantenimiento Industrial'],
        'business' => ['Licenciatura en Administración', 'Licenciatura en Contaduría', 'Licenciatura en Negocios Internacionales', 'Ingeniería en Logística y Transporte', 'Licenciatura en Mercadotecnia'],
        'health' => ['Licenciatura en Enfermería', 'Licenciatura en Nutrición', 'Licenciatura en Fisioterapia', 'Ingeniería Biomédica'],
        'design' => ['Licenciatura en Diseño Gráfico', 'Licenciatura en Diseño Industrial', 'Licenciatura en Arquitectura', 'Licenciatura en Comunicación'],
        'agro' => ['Ingeniería en Agronomía', 'Ingeniería en Industrias Alimentarias', 'Ingeniería Ambiental'],
    ];

    /** Peso de cada área en la matrícula. */
    public const AREA_WEIGHTS = ['tech' => 26, 'engineering' => 30, 'business' => 20, 'health' => 9, 'design' => 8, 'agro' => 7];

    public const TECHNICAL_SKILLS = [
        'tech' => ['PHP', 'Laravel', 'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Node.js', 'Python', 'Django', 'Java', 'Spring Boot', 'C#', '.NET', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Docker', 'Git', 'Linux', 'AWS', 'Azure', 'Power BI', 'Excel avanzado', 'Pandas', 'Machine Learning', 'Kotlin', 'Swift', 'Flutter', 'HTML y CSS', 'Pruebas automatizadas', 'Redes de cómputo', 'Ciberseguridad'],
        'engineering' => ['AutoCAD', 'SolidWorks', 'CATIA', 'PLC Siemens', 'PLC Allen-Bradley', 'Lean Manufacturing', 'Six Sigma', 'Kaizen', '5S', 'Control estadístico de procesos', 'Metrología', 'Soldadura MIG', 'Neumática', 'Hidráulica', 'Robótica industrial', 'Mantenimiento preventivo', 'AMEF', 'PPAP', 'Diseño de experimentos', 'Simulación de procesos', 'Instalaciones eléctricas', 'LabVIEW', 'MATLAB', 'Minitab', 'Lectura de planos', 'Torno CNC'],
        'business' => ['Contabilidad general', 'CONTPAQi', 'SAP', 'Excel avanzado', 'Power BI', 'Nómina', 'Facturación electrónica', 'Análisis financiero', 'Comercio exterior', 'Logística', 'Gestión de inventarios', 'Mercadotecnia digital', 'Google Analytics', 'Atención al cliente', 'Ventas consultivas', 'Gestión de proyectos', 'Auditoría', 'Costos', 'Reclutamiento y selección'],
        'health' => ['Primeros auxilios', 'Toma de signos vitales', 'Expediente clínico', 'Nutrición clínica', 'Rehabilitación física', 'Bioseguridad', 'Equipo biomédico', 'Atención hospitalaria', 'Educación para la salud', 'Evaluación antropométrica'],
        'design' => ['Adobe Illustrator', 'Adobe Photoshop', 'Adobe InDesign', 'Figma', 'Diseño UX', 'Tipografía', 'Fotografía', 'Edición de video', 'Blender', 'SketchUp', 'Revit', 'Rhinoceros', 'Branding', 'Animación 2D', 'Redacción publicitaria'],
        'agro' => ['Buenas prácticas agrícolas', 'Inocuidad alimentaria', 'HACCP', 'Análisis de suelos', 'Riego tecnificado', 'Control de plagas', 'Análisis microbiológico', 'Gestión ambiental', 'ISO 14001', 'Tratamiento de aguas'],
    ];

    public const SOFT_SKILLS = [
        'Trabajo en equipo', 'Comunicación efectiva', 'Liderazgo', 'Resolución de problemas', 'Pensamiento crítico',
        'Adaptabilidad', 'Gestión del tiempo', 'Responsabilidad', 'Creatividad', 'Negociación', 'Orientación a resultados',
        'Aprendizaje autónomo', 'Atención al detalle', 'Empatía', 'Toma de decisiones',
    ];

    public const HEADLINES = [
        'tech' => ['Desarrollador web en formación', 'Estudiante de software con interés en backend', 'Analista de datos junior', 'Desarrolladora frontend en formación', 'Soporte técnico y redes'],
        'engineering' => ['Estudiante de ingeniería con interés en manufactura', 'Técnico en mantenimiento industrial', 'Practicante de calidad y mejora continua', 'Automatización y control', 'Diseño mecánico asistido por computadora'],
        'business' => ['Estudiante de administración con interés en finanzas', 'Auxiliar contable en formación', 'Logística y cadena de suministro', 'Mercadotecnia digital', 'Comercio exterior y aduanas'],
        'health' => ['Estudiante de enfermería con práctica hospitalaria', 'Nutrición clínica y comunitaria', 'Rehabilitación y fisioterapia', 'Mantenimiento de equipo biomédico'],
        'design' => ['Diseñadora gráfica en formación', 'Diseño de experiencia de usuario', 'Visualización arquitectónica', 'Diseño de producto'],
        'agro' => ['Producción agrícola sustentable', 'Calidad e inocuidad de alimentos', 'Gestión ambiental y tratamiento de aguas'],
    ];

    public const CERTIFICATIONS = [
        'tech' => [['AWS Certified Cloud Practitioner', 'Amazon Web Services'], ['Microsoft Azure Fundamentals', 'Microsoft'], ['CCNA', 'Cisco'], ['Scrum Fundamentals', 'SCRUMstudy'], ['Python Essentials', 'Cisco Networking Academy']],
        'engineering' => [['Green Belt Six Sigma', 'Instituto Mexicano de Calidad'], ['Seguridad industrial NOM-030', 'STPS'], ['SolidWorks Associate', 'Dassault Systèmes'], ['Lean Manufacturing', 'CONOCER']],
        'business' => [['Certificación en contabilidad', 'CONOCER'], ['SAP Business One', 'SAP'], ['Google Ads', 'Google'], ['Excel Expert', 'Microsoft']],
        'health' => [['Soporte vital básico', 'Cruz Roja Mexicana'], ['Manejo higiénico de alimentos', 'Secretaría de Salud']],
        'design' => [['Adobe Certified Professional', 'Adobe'], ['Google UX Design', 'Google']],
        'agro' => [['Buenas prácticas de manufactura', 'SENASICA'], ['Auditor interno ISO 14001', 'Bureau Veritas']],
    ];

    public const PROJECTS = [
        'tech' => ['Sistema de control escolar', 'Aplicación móvil de reservaciones', 'Tablero de indicadores de ventas', 'API para inventarios', 'Portal de servicio social'],
        'engineering' => ['Celda robotizada didáctica', 'Reducción de desperdicio en línea de ensamble', 'Plan de mantenimiento preventivo', 'Banco de pruebas neumático', 'Estudio de tiempos y movimientos'],
        'business' => ['Plan de negocios para cafetería', 'Análisis de costos de una pyme', 'Estrategia de redes sociales', 'Reingeniería de almacén', 'Estudio de mercado regional'],
        'health' => ['Campaña de vacunación comunitaria', 'Plan de alimentación escolar', 'Programa de pausas activas'],
        'design' => ['Identidad gráfica para cooperativa', 'Rediseño de aplicación bancaria', 'Mobiliario urbano modular', 'Revista universitaria'],
        'agro' => ['Huerto escolar con riego por goteo', 'Control de calidad en planta de lácteos', 'Composta para residuos orgánicos'],
    ];

    public const ROLES = ['Desarrollo', 'Coordinación', 'Análisis', 'Diseño', 'Documentación', 'Pruebas', 'Investigación'];

    public const INSTITUTION_TYPES = [
        ['Universidad Tecnológica de', 'UT', 'EUT'],
        ['Universidad Politécnica de', 'UP', 'EUP'],
        ['Instituto Tecnológico de', 'IT', 'DIT'],
        ['Tecnológico de Estudios Superiores de', 'TES', 'EIT'],
        ['Universidad Intercultural de', 'UI', 'EUI'],
    ];

    public const COMPANY_WORDS = [
        'Grupo', 'Industrias', 'Servicios', 'Corporativo', 'Manufacturas', 'Tecnologías', 'Soluciones', 'Distribuidora',
        'Comercializadora', 'Consultores', 'Logística', 'Alimentos', 'Ingeniería', 'Desarrollos', 'Laboratorios',
    ];

    public const COMPANY_NAMES = [
        'Altiplano', 'Nevado', 'Teotlalli', 'Mexiquense', 'Valle Verde', 'Atlas', 'Quetzal', 'Horizonte', 'Ocelotl',
        'Tollocan', 'Sierra Madre', 'Ajolote', 'Xinantécatl', 'Lerma', 'Centauro', 'Nopal', 'Aztlán', 'Pirámide',
        'Mazahua', 'Otomí', 'Bosque Real', 'Cumbre', 'Puente', 'Faro', 'Raíz', 'Volcán', 'Cóndor', 'Trébol', 'Orión',
    ];

    public const COMPANY_SUFFIXES = ['S.A. de C.V.', 'S. de R.L. de C.V.', 'S.A.P.I. de C.V.', 'S.C.'];

    /** Peso de los sectores SCIAN entre las empresas. */
    public const SECTOR_WEIGHTS = [
        '31-33' => 30, '54' => 14, '43' => 8, '46' => 8, '48-49' => 7, '51' => 6, '23' => 5, '72' => 4, '62' => 4,
        '56' => 4, '52' => 3, '11' => 3, '61' => 2, '81' => 2,
    ];

    /** Áreas académicas que buscan las empresas de cada sector. */
    public const SECTOR_AREAS = [
        '31-33' => ['engineering', 'engineering', 'business'], '54' => ['tech', 'business', 'design'], '43' => ['business'],
        '46' => ['business', 'design'], '48-49' => ['business', 'engineering'], '51' => ['tech', 'design'], '23' => ['engineering', 'design'],
        '72' => ['business', 'agro'], '62' => ['health'], '56' => ['business', 'tech'], '52' => ['business', 'tech'],
        '11' => ['agro'], '61' => ['tech', 'business'], '81' => ['business'],
    ];

    public const OPPORTUNITY_TITLES = [
        'tech' => ['Desarrollo de aplicaciones web', 'Soporte a infraestructura de TI', 'Análisis de datos de producción', 'Automatización de reportes', 'Pruebas de software'],
        'engineering' => ['Mejora continua en línea de producción', 'Mantenimiento de maquinaria', 'Ingeniería de calidad', 'Programación de PLC', 'Diseño de herramentales'],
        'business' => ['Auxiliar de contabilidad', 'Control de inventarios', 'Apoyo en comercio exterior', 'Mercadotecnia digital', 'Planeación de compras'],
        'health' => ['Apoyo en área hospitalaria', 'Nutrición en comedor industrial', 'Salud ocupacional'],
        'design' => ['Diseño de material promocional', 'Diseño de interfaces', 'Modelado de producto'],
        'agro' => ['Control de calidad de alimentos', 'Producción en invernadero', 'Gestión ambiental de planta'],
    ];

    public const LINKAGE_MESSAGES = [
        'Nos interesa su perfil para el proyecto descrito en la oportunidad.',
        'Buscamos incorporar a un alumno en el siguiente periodo de Educación Dual.',
        'Su experiencia en proyectos académicos encaja con lo que necesitamos.',
        'Quisiéramos coordinar una entrevista con la institución.',
    ];

    public const RESPONSE_MESSAGES = [
        'Coordinemos la entrevista con el área de vinculación.',
        'El alumno está disponible a partir del próximo periodo.',
        'Por ahora el alumno ya cuenta con un proyecto de Educación Dual.',
        'Gracias por su interés; el perfil no coincide con el periodo solicitado.',
    ];

    /** Estados vecinos para repartir el 15 % de ubicaciones fuera del estado principal. */
    public const NEIGHBOR_STATES = [
        '15' => ['09', '13', '16', '17', '21', '29', '12'],
        '28' => ['19', '24', '30'],
        '09' => ['15', '17'],
    ];
}
