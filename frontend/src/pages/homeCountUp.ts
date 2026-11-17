/**
 * T-S12-11: los indicadores cuentan hasta su valor solo la primera vez que se ve el inicio desde que se cargó la app.
 * La marca vive en memoria, no en el almacenamiento del navegador, que la app mantiene vacío (authentication.spec).
 */
let counted = false

export function firstViewInSession(): boolean {
  if (counted) return false
  counted = true
  return true
}

/** Solo para pruebas: vuelve a permitir el conteo. */
export function resetHomeCountUp() {
  counted = false
}
