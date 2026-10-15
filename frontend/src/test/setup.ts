import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Con todos los archivos en paralelo, el primer render de una vista completa en jsdom puede superar
// el segundo que findBy/waitFor esperan por defecto; 3 s evita fallos por carga sin ocultar errores reales.
configure({ asyncUtilTimeout: 3000 })

afterEach(cleanup)
