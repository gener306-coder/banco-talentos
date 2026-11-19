import { initialsOf } from '../auth/user'

/**
 * Avatar de la persona (T-S14-03): el mismo en el menú de cuenta (`sm`) y en Mi cuenta (`lg`). Muestra las iniciales con
 * el tinte de la marca y un anillo fino; `src` queda listo para una foto de perfil futura. Es decorativo: el nombre
 * siempre está escrito junto a él o en el nombre accesible del control que lo contiene.
 */
export function UserAvatar({ name, size = 'sm', src = null }: { name: string; size?: 'sm' | 'lg'; src?: string | null }) {
  return (
    <span className={`user-avatar ${size}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initialsOf(name)}
    </span>
  )
}
