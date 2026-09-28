# Backend

API REST de Banco de Talentos – Educación Dual, con Laravel 13 y Sanctum.

## Autenticación de la SPA

La autenticación usa sesiones y cookies: no se emiten API tokens ni se guarda
la sesión en localStorage. El navegador accede mediante el proxy de Vite,
usando siempre el mismo hostname (`localhost` o `127.0.0.1`).

1. `GET /sanctum/csrf-cookie` prepara la sesión y la cookie `XSRF-TOKEN`.
2. `POST /api/login` recibe `email` y `password`, enviando cookies y
   `X-XSRF-TOKEN` con el valor decodificado de la cookie CSRF.
3. `GET /api/me` recupera `{user: {id, name, email, role}}`.
4. `POST /api/logout` invalida la sesión y responde 204.

Login y logout usan el grupo `web` para aplicar sesión y protección CSRF
incluso sin cabeceras Origin/Referer. La API utiliza `statefulApi()` y la
lista explícita `SANCTUM_STATEFUL_DOMAINS`. Laravel 13 valida el origen
`Sec-Fetch-Site: same-origin` o, cuando corresponde, el token CSRF.

Las cuentas deben estar activas. Los roles son `ADMIN`, `INSTITUTION`,
`COMPANY` y `SECRETARY`; el middleware `role` exige coincidencia exacta,
sin acceso implícito de administrador a otros roles. Los cuatro roles pueden
iniciar sesión; las funciones de negocio se implementarán en otras historias.

El login devuelve el mismo error 422 para credenciales incorrectas o cuentas
inactivas. Las peticiones sin sesión reciben 401; la autorización por rol
devuelve 403; los fallos CSRF devuelven 419. El login admite cinco solicitudes
por minuto para correo/IP y veinte por IP; al excederlas responde 429.

## Crear cuentas locales

Después de aplicar las migraciones, ejecuta desde el repositorio:

```bash
docker compose exec backend php artisan auth:create-user
```

El comando funciona únicamente en `APP_ENV=local` y requiere una terminal
interactiva. Solicita nombre, correo, un rol explícito, el estado activo y una
contraseña oculta con confirmación. No recibe contraseñas como argumentos,
no tiene valores predeterminados de privilegio y no crea cuentas conocidas.

No hay registro público, recuperación de contraseña ni datos de usuarios
precargados. `UserFactory` proporciona solamente cuentas para pruebas.

## Verificación

Consulta el [README del repositorio](../README.md) para ejecutar las pruebas
Pest contra una base aislada. No ejecutes `migrate:fresh` sobre desarrollo.
