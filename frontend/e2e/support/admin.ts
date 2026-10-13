/**
 * Sesión ADMIN compartida por los escenarios de administración. La crea `admin.setup.ts`
 * con un único inicio de sesión: el login limita a 5 intentos por minuto por correo y a 20
 * por IP, y repetirlo en cada escenario agotaba ese margen.
 */
export const ADMIN_STATE = 'playwright/.auth/admin.json'

/**
 * Opciones para el contexto de otra persona (titular, sesión anterior). `browser.newContext()`
 * hereda las opciones de `test.use`, incluida la sesión ADMIN: hay que vaciarla explícitamente.
 */
export const NO_SESSION = { storageState: { cookies: [], origins: [] } }
