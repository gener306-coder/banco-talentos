// Tema: fija data-theme antes del primer pintado para evitar un destello (ver src/ui/theme.ts).
// T-S17-03: vive fuera de index.html para que la CSP del servidor admita solo script-src 'self', sin hashes ni nonces.
;(function () {
  var preference = null
  try { preference = localStorage.getItem('bt-theme') } catch (error) { /* almacenamiento bloqueado */ }
  // T-S14-06: el tema claro es el predeterminado; solo «Oscuro» o «Sistema» con el sistema en oscuro lo cambian.
  var dark = preference === 'dark' || (preference === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
