import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from './VideoPlayer'

type Observed = { callback: IntersectionObserverCallback; element: Element }
let observers: Observed[] = []

class FakeIntersectionObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) { this.callback = callback }
  observe(element: Element) { observers.push({ callback: this.callback, element }) }
  disconnect() { observers = observers.filter((observer) => observer.callback !== this.callback) }
  unobserve() {}
  takeRecords() { return [] }
}

/** jsdom no implementa la reproducción: se simula el estado y los eventos que dispara el navegador. */
function stubMedia() {
  const state = new WeakMap<HTMLMediaElement, boolean>()
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return state.get(this) ?? true })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    state.set(this, false)
    this.dispatchEvent(new Event('play'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    state.set(this, true)
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
}

function intersect(isIntersecting: boolean, index = 0) {
  const { callback, element } = observers[index]
  act(() => callback([{ isIntersecting, target: element } as IntersectionObserverEntry], {} as IntersectionObserver))
}

const props = { src: '/video.mp4', poster: '/poster.jpg', durationSeconds: 92, width: 1280, height: 720 }
const videoOf = (label: string) => screen.getByLabelText(`Video: ${label}`) as HTMLVideoElement

beforeEach(() => {
  observers = []
  stubMedia()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('reproductor propio HU-S9-04', () => {
  it('no usa controles nativos ni ofrece descarga, y no descarga nada antes de reproducir', () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    const video = videoOf('Mi experiencia')

    expect(video).not.toHaveAttribute('controls')
    expect(video).toHaveAttribute('controlsList', 'nodownload')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).toHaveAttribute('poster', '/poster.jpg')
    expect(fireEvent.contextMenu(video)).toBe(false)
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument()
  })

  it('reproduce, pausa y reanuda desde sus botones', async () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)

    fireEvent.click(screen.getByRole('button', { name: 'Reproducir: Mi experiencia' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    const pause = await screen.findByRole('button', { name: 'Pausar' })
    expect(screen.queryByRole('button', { name: 'Reproducir: Mi experiencia' })).not.toBeInTheDocument()

    fireEvent.click(pause)
    expect(await screen.findByRole('button', { name: 'Reproducir: Mi experiencia' })).toBeInTheDocument()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
  })

  it('tocar el video con el ratón pausa o reanuda', async () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    fireEvent.click(videoOf('Mi experiencia'))
    await screen.findByRole('button', { name: 'Pausar' })
    fireEvent.click(videoOf('Mi experiencia'))
    expect(await screen.findByRole('button', { name: 'Reproducir: Mi experiencia' })).toBeInTheDocument()
  })

  it('mueve la línea de tiempo y la anuncia con el tiempo legible', () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    const seek = screen.getByRole('slider', { name: 'Posición del video' })
    expect(seek).toHaveAttribute('aria-valuetext', '0:00 de 1:32')

    fireEvent.change(seek, { target: { value: '42' } })
    expect(videoOf('Mi experiencia').currentTime).toBe(42)
    expect(seek).toHaveAttribute('aria-valuetext', '0:42 de 1:32')
    expect(screen.getByText('0:42 / 1:32')).toBeInTheDocument()
  })

  it('silencia y activa el sonido, y avisa al feed para mantenerlo', () => {
    const onMutedChange = vi.fn()
    render(<VideoPlayer {...props} label="Mi experiencia" muted onMutedChange={onMutedChange} />)
    expect(videoOf('Mi experiencia').muted).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Activar sonido' }))
    expect(onMutedChange).toHaveBeenCalledWith(false)
  })

  it('responde al teclado: espacio, flechas y M', async () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    const player = screen.getByRole('group', { name: 'Reproductor: Mi experiencia' })

    fireEvent.keyDown(player, { key: ' ' })
    await screen.findByRole('button', { name: 'Pausar' })
    fireEvent.keyDown(player, { key: 'ArrowRight' })
    expect(videoOf('Mi experiencia').currentTime).toBe(10)
    fireEvent.keyDown(player, { key: 'ArrowLeft' })
    expect(videoOf('Mi experiencia').currentTime).toBe(0)
    expect(screen.getByRole('button', { name: 'Silenciar' })).toBeInTheDocument()
    fireEvent.keyDown(player, { key: 'm' })
    expect(screen.getByRole('button', { name: 'Activar sonido' })).toBeInTheDocument()
    expect(videoOf('Mi experiencia').muted).toBe(true)
  })

  it('oculta los controles a los 2.5 s de reproducir y los muestra con el puntero', async () => {
    vi.useFakeTimers()
    try {
      render(<VideoPlayer {...props} label="Mi experiencia" />)
      const player = screen.getByRole('group', { name: 'Reproductor: Mi experiencia' })
      expect(player).toHaveAttribute('data-controls', 'shown')

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir: Mi experiencia' })); await Promise.resolve() })
      expect(player).toHaveAttribute('data-controls', 'shown')
      act(() => { vi.advanceTimersByTime(2500) })
      expect(player).toHaveAttribute('data-controls', 'hidden')

      fireEvent.pointerMove(player, { pointerType: 'mouse' })
      expect(player).toHaveAttribute('data-controls', 'shown')
    } finally {
      vi.useRealTimers()
    }
  })

  it('al terminar ofrece volver a ver', async () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    fireEvent.ended(videoOf('Mi experiencia'))
    expect(await screen.findByRole('button', { name: 'Volver a ver: Mi experiencia' })).toBeInTheDocument()
  })

  it('si falla ofrece reintentar y pide URLs nuevas', () => {
    const onRetry = vi.fn()
    render(<VideoPlayer {...props} label="Mi experiencia" onRetry={onRetry} />)
    fireEvent.error(videoOf('Mi experiencia'))

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo reproducir este video.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reserva proporción vertical con el póster difuminado detrás', () => {
    const { container } = render(<VideoPlayer {...props} width={720} height={1280} label="Vertical" />)
    expect(screen.getByRole('group', { name: 'Reproductor: Vertical' })).toHaveAttribute('data-orientation', 'vertical')
    expect(container.querySelector('.story-player-backdrop')).toHaveAttribute('src', '/poster.jpg')
  })
})

describe('reproducción automática del feed HU-S9-04', () => {
  it('arranca sin sonido al estar visible y se pausa al salir', () => {
    render(<VideoPlayer {...props} label="Mi experiencia" autoPlay muted onMutedChange={() => {}} />)
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()

    intersect(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(videoOf('Mi experiencia').muted).toBe(true)

    intersect(false)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)

    // Se pausó por salir de la pantalla, no por el usuario: al volver se reanuda.
    intersect(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  })

  it('no reanuda solo un video que el usuario pausó', async () => {
    render(<VideoPlayer {...props} label="Mi experiencia" autoPlay muted onMutedChange={() => {}} />)
    intersect(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))

    intersect(false)
    intersect(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('reproduce un solo video a la vez', async () => {
    render(<>
      <VideoPlayer {...props} label="Primero" autoPlay muted onMutedChange={() => {}} />
      <VideoPlayer {...props} label="Segundo" autoPlay muted onMutedChange={() => {}} />
    </>)
    intersect(true, 0)
    intersect(true, 1)

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(videoOf('Primero').paused).toBe(true)
    expect(videoOf('Segundo').paused).toBe(false)
  })

  it('no arranca solo si el usuario pidió reducir movimiento', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }))
    render(<VideoPlayer {...props} label="Mi experiencia" autoPlay muted onMutedChange={() => {}} />)

    expect(observers).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reproducir: Mi experiencia' })).toBeInTheDocument()
  })

  it('no arranca solo con ahorro de datos', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } })
    render(<VideoPlayer {...props} label="Mi experiencia" autoPlay muted onMutedChange={() => {}} />)
    expect(observers).toHaveLength(0)
  })

  it('la vista previa de la institución no arranca sola', () => {
    render(<VideoPlayer {...props} label="Mi experiencia" />)
    expect(observers).toHaveLength(0)
  })
})
