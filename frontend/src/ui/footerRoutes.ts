/**
 * HU-S15-03: vistas sin footer. Las conversaciones ocupan el alto de la ventana (100dvh, linkage.css) y el feed de las
 * Historias del Dual carga más al acercarse al final, así que el footer nunca se alcanzaría. Todas las demás lo muestran.
 */
const HIDDEN = [/^\/(institution\/)?linkage-requests\/[^/]+\/chat\/?$/, /^\/promocion\/?$/]

export function showsFooter(pathname: string): boolean {
  return !HIDDEN.some((pattern) => pattern.test(pathname))
}
