import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T-S14-18: si el navegador no decodifica el MP4 H.264, el reproductor cambia solo a la versión WebM y lo recuerda.
// El módulo se carga de nuevo en cada prueba: la preferencia vive en él durante la sesión.
async function player() {
  const { VideoPlayer } = await import('./VideoPlayer')
  return VideoPlayer
}

function failWith(video: HTMLElement, code: number) {
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  fireEvent.error(video)
}

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})

describe('versión WebM de respaldo (T-S14-18)', () => {
  it('con un error de decodificación cambia a WebM sin mostrar el error, y el siguiente video arranca con WebM', async () => {
    const VideoPlayer = await player()
    const { unmount } = render(<VideoPlayer src="/v.mp4" fallbackSrc="/v.webm" poster={null} label="Talleres" durationSeconds={30} width={1280} height={720} />)
    const video = screen.getByLabelText('Video: Talleres')
    expect(video).toHaveAttribute('src', '/v.mp4')

    failWith(video, 3)
    expect(video).toHaveAttribute('src', '/v.webm')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()

    render(<VideoPlayer src="/b.mp4" fallbackSrc="/b.webm" poster={null} label="Laboratorios" durationSeconds={30} width={1280} height={720} />)
    expect(screen.getByLabelText('Video: Laboratorios')).toHaveAttribute('src', '/b.webm')
  })

  it('un error de red no cambia de versión: muestra el error con «Reintentar»', async () => {
    const VideoPlayer = await player()
    render(<VideoPlayer src="/v.mp4" fallbackSrc="/v.webm" poster={null} label="Talleres" durationSeconds={30} width={1280} height={720} />)
    const video = screen.getByLabelText('Video: Talleres')
    failWith(video, 2)
    expect(video).toHaveAttribute('src', '/v.mp4')
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo reproducir este video.')
  })

  it('sin versión WebM, un error de formato muestra el error como antes', async () => {
    const VideoPlayer = await player()
    render(<VideoPlayer src="/v.mp4" poster={null} label="Talleres" durationSeconds={30} width={1280} height={720} />)
    failWith(screen.getByLabelText('Video: Talleres'), 3)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('si la versión WebM también falla, muestra el error', async () => {
    const VideoPlayer = await player()
    render(<VideoPlayer src="/v.mp4" fallbackSrc="/v.webm" poster={null} label="Talleres" durationSeconds={30} width={1280} height={720} />)
    const video = screen.getByLabelText('Video: Talleres')
    failWith(video, 3)
    failWith(video, 4)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
