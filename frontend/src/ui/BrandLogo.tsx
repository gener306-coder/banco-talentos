import { useResolvedTheme } from './theme'

/**
 * Logotipo de Nodologístico (docs/design/identidad-visual.md): la versión a color en el tema claro y la blanca en el
 * oscuro (HU-S8-03). Las dos miden lo mismo, así que cambiar de tema no mueve nada. La altura la fija `className`.
 */
export function BrandLogo({ className }: { className: string }) {
  const theme = useResolvedTheme()
  return (
    <img src={theme === 'dark' ? '/brand/logob.png' : '/brand/logo.png'} alt="Nodologístico" width={404} height={480} className={className} />
  )
}
