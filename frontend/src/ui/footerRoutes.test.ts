import { describe, expect, it } from 'vitest'
import { showsFooter } from './footerRoutes'

describe('footer por ruta HU-S15-03', () => {
  it.each([
    '/login', '/set-initial-password', '/reset-password', '/legal/privacidad', '/legal/cookies', '/', '/welcome', '/account',
    '/students', '/students/4/cv', '/linkage-requests/7', '/institution/linkage-requests/7', '/institution/videos', '/reports',
  ])('se muestra en %s', (path) => expect(showsFooter(path)).toBe(true))

  it.each(['/linkage-requests/7/chat', '/institution/linkage-requests/7/chat', '/promocion'])('se oculta en %s', (path) => {
    expect(showsFooter(path)).toBe(false)
  })
})
