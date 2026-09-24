# Backend

Base Laravel 13 para la API REST de Banco de Talentos – Educación Dual.

El archivo `routes/api.php` está preparado para futuras historias aprobadas.
La única ruta HTTP inicial es `/up`, el health check del framework. No hay
modelos de negocio, migraciones, datos de ejemplo ni autenticación implementada.
Sanctum queda instalado como dependencia, con sus rutas deshabilitadas.

Las pruebas de arranque usan Pest; ejecútalas con `composer test` dentro del
contenedor backend.

Consulta el [README del repositorio](../README.md) para iniciar el entorno local.
