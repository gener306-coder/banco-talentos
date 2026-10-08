# Backend

API REST de Banco de Talentos – Educación Dual, con Laravel 13 y Sanctum.

## Autenticación de la SPA

La autenticación usa sesiones y cookies: no se emiten API tokens ni se guarda
la sesión en localStorage. El navegador accede mediante el proxy de Vite,
usando siempre el mismo hostname (`localhost` o `127.0.0.1`).

1. `GET /sanctum/csrf-cookie` prepara la sesión y la cookie `XSRF-TOKEN`.
2. `POST /api/login` recibe `email` y `password`, enviando cookies y
   `X-XSRF-TOKEN` con el valor decodificado de la cookie CSRF.
3. `GET /api/me` recupera `{user: {id, name, email, role, institution}}`;
   `institution` es `{id, name}` para cuentas `INSTITUTION` y `null` en otros roles.
4. `POST /api/logout` invalida la sesión y responde 204.

Login y logout usan el grupo `web` para aplicar sesión y protección CSRF
incluso sin cabeceras Origin/Referer. La API utiliza `statefulApi()` y la
lista explícita `SANCTUM_STATEFUL_DOMAINS`. Laravel 13 valida el origen
`Sec-Fetch-Site: same-origin` o, cuando corresponde, el token CSRF.

Las cuentas deben estar activas. Los roles son `ADMIN`, `INSTITUTION`,
`COMPANY` y `SECRETARY`; el middleware `role` exige coincidencia exacta,
sin acceso implícito de administrador a otros roles. Los cuatro roles pueden
iniciar sesión. ADMIN puede además gestionar instituciones mediante los cinco
endpoints descritos en [HU-S1-02](../docs/HU-S1-02.md), con CCT único y cambio de
estado sin eliminación.

Las cuentas `INSTITUTION` requieren además una institución activa: si se
inactiva, el login responde 401 (`INSTITUTION_INACTIVE`) y las sesiones abiertas
se cierran en la siguiente petición.

El login devuelve el mismo error 422 para credenciales incorrectas o cuentas
inactivas. Las peticiones sin sesión reciben 401; la autorización por rol
devuelve 403; los fallos CSRF devuelven 419. El login admite cinco solicitudes
por minuto para correo/IP y veinte por IP; al excederlas responde 429.

## Cuentas institucionales

Descritas en [HU-S1-03](../docs/HU-S1-03.md):

| Método y ruta | Acceso | Uso |
| --- | --- | --- |
| `POST /api/institution-accounts` | ADMIN | Alta con `name`, `email` e `institution_id`; el rol se asigna en servidor. |
| `POST /api/institution-accounts/resend-setup` | ADMIN | Reenvía el enlace a una cuenta pendiente e invalida el anterior. |
| `POST /api/institution-accounts/password-setup` | Público con token y CSRF | La persona titular establece su contraseña inicial. |
| `POST /api/institution-accounts/password-reset/start` | ADMIN | Inicia el restablecimiento con `email` e `institution_id` ([HU-S1-04](../docs/HU-S1-04.md)); responde solo `reset_delivery`. |
| `POST /api/institution-accounts/password-reset` | Público con token y CSRF | La persona titular establece su nueva contraseña; cierra las sesiones abiertas de la cuenta. |

ADMIN no define ni recibe la contraseña ni el enlace. El token se guarda como
hash, caduca en 60 minutos y es de un solo uso. El correo se envía después del
commit; en local se entrega a Mailpit y en `testing` no se envía. Mientras la
cuenta tenga la configuración pendiente, el login responde 401
(`PASSWORD_SETUP_REQUIRED`).

El restablecimiento usa el broker `institution_reset` con su propia tabla de
tokens (hash, 60 minutos, uso único). `AuthenticateSession` de Sanctum invalida
las sesiones por cookie cuando cambia el hash de la contraseña. El enlace apunta
a `FRONTEND_URL` + `FRONTEND_PASSWORD_RESET_PATH` (por defecto `/reset-password`).

## Crear cuentas locales

Después de aplicar las migraciones, ejecuta desde el repositorio:

```bash
docker compose exec backend php artisan auth:create-user
```

El comando funciona únicamente en `APP_ENV=local` y requiere una terminal
interactiva. Solicita nombre, correo, un rol explícito, el estado activo y una
contraseña oculta con confirmación. No recibe contraseñas como argumentos,
no tiene valores predeterminados de privilegio y no crea cuentas conocidas.

No hay registro público, recuperación de contraseña iniciada por la propia
cuenta ni datos de usuarios precargados. Este comando no asigna institución: las cuentas
institucionales se crean desde la interfaz ADMIN. `UserFactory` proporciona
solamente cuentas para pruebas.

## Verificación

Consulta el [README del repositorio](../README.md) para ejecutar las pruebas
Pest contra una base aislada. No ejecutes `migrate:fresh` sobre desarrollo.
