import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { ExitFullscreenIcon, FullscreenIcon, PauseIcon, PlayIcon, ReplayIcon, VolumeIcon, VolumeOffIcon } from '../ui/icons'
import { canAutoPlay, duration } from './api'
import './videos.css'

const HIDE_CONTROLS_MS = 2500
const VISIBLE_FRACTION = 0.6
const SKIP_SECONDS = 10

/** Solo un video se reproduce a la vez en toda la aplicación. */
let current: HTMLVideoElement | null = null


interface VideoPlayerProps {
  src: string
  poster: string | null
  /** Nombre accesible del video: «Video: {label}». */
  label: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  /** Arranca sin sonido al estar visible y se pausa al salir de la pantalla (feed de HU-S9-04). */
  autoPlay?: boolean
  /** Sonido compartido por los videos del feed: al activarlo se mantiene para los siguientes. */
  muted?: boolean
  onMutedChange?: (muted: boolean) => void
  /** Al reintentar tras un fallo: la URL firmada pudo vencer, así que el feed pide URLs nuevas. */
  onRetry?: () => void
  /** `none` salvo un archivo local, que no se descarga de ningún lado (vista previa antes de subir, HU-S9-07). */
  preload?: 'none' | 'metadata'
  onMetadata?: (metadata: { duration: number; width: number; height: number }) => void
  /** El navegador no puede mostrar este archivo. Con ella, quien la pasa decide qué mostrar en lugar de «Reintentar». */
  onUnplayable?: () => void
}

/**
 * Reproductor propio de los videos (HU-S9-04), con la identidad visual y sin la opción de descarga de los controles
 * nativos. Quita la opción, no impide copiar el archivo con herramientas de desarrollador. `preload="none"`: nada se
 * descarga hasta reproducir.
 */
export function VideoPlayer({ src, poster, label, durationSeconds, width, height, autoPlay = false, muted: sharedMuted, onMutedChange, onRetry, preload = 'none', onMetadata, onUnplayable }: VideoPlayerProps) {
  const container = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Una pausa del usuario se respeta: el video no se reanuda solo al volver a la pantalla.
  const pausedByUser = useRef(false)
  const lastPointer = useRef('mouse')
  const [localMuted, setLocalMuted] = useState(false)
  const muted = sharedMuted ?? localMuted
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(false)
  const [time, setTime] = useState(0)
  const [total, setTotal] = useState(durationSeconds ?? 0)
  const [controlsShown, setControlsShown] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function' ||
    'webkitEnterFullscreen' in HTMLVideoElement.prototype

  const setMuted = useCallback((value: boolean) => {
    setLocalMuted(value)
    onMutedChange?.(value)
  }, [onMutedChange])

  // React no actualiza la propiedad `muted` de un <video> ya montado.
  useEffect(() => {
    if (video.current) video.current.muted = muted
  }, [muted])

  const start = useCallback(() => {
    const element = video.current
    if (!element) return
    element.play()?.catch(() => {
      // El navegador puede exigir silencio para arrancar sin un gesto del usuario.
      if (element.muted) return
      element.muted = true
      setMuted(true)
      element.play()?.catch(() => { /* Queda el póster con su botón. */ })
    })
  }, [setMuted])

  useEffect(() => {
    if (!autoPlay || !canAutoPlay() || typeof IntersectionObserver === 'undefined' || !container.current) return
    const observer = new IntersectionObserver(([entry]) => {
      const element = video.current
      if (!element) return
      if (entry.isIntersecting && !pausedByUser.current && !element.ended) start()
      else if (!entry.isIntersecting && !element.paused) element.pause()
    }, { threshold: VISIBLE_FRACTION })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [autoPlay, start])

  useEffect(() => {
    const element = video.current
    return () => {
      clearTimeout(hideTimer.current)
      if (current === element) current = null
    }
  }, [])

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  /** Muestra los controles y programa ocultarlos; solo se ocultan mientras se reproduce (`playing`, en el render). */
  const revealControls = useCallback(() => {
    setControlsShown(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsShown(false), HIDE_CONTROLS_MS)
  }, [])

  function toggle() {
    const element = video.current
    if (!element) return
    if (element.paused) {
      pausedByUser.current = false
      start()
    } else {
      pausedByUser.current = true
      element.pause()
    }
    revealControls()
  }

  /** En pantalla táctil, si los controles están ocultos, el primer toque solo los muestra. */
  function pressVideo() {
    if (lastPointer.current === 'touch' && playing && !controlsShown) revealControls()
    else toggle()
  }

  function seek(seconds: number) {
    const element = video.current
    if (!element) return
    element.currentTime = seconds
    setTime(seconds)
    setEnded(false)
  }

  function toggleFullscreen() {
    const box = container.current as (HTMLDivElement & { requestFullscreen?: () => Promise<void> }) | null
    const element = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (box?.requestFullscreen) void box.requestFullscreen()
    else element?.webkitEnterFullscreen?.() // iPhone solo permite pantalla completa en el propio video.
  }

  function retry() {
    setFailed(false)
    // load() cubre la misma URL todavía vigente; una URL nueva se carga sola al cambiar `src`.
    video.current?.load()
    onRetry?.()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const onControl = target.tagName === 'BUTTON'
    const onSeek = target.tagName === 'INPUT'
    switch (event.key) {
      case ' ':
      case 'k':
        if (onControl || onSeek) return
        toggle()
        break
      case 'ArrowLeft':
      case 'ArrowRight':
        if (onSeek) return
        seek(Math.min(total, Math.max(0, time + (event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS))))
        break
      case 'm':
        setMuted(!muted)
        break
      case 'f':
        toggleFullscreen()
        break
      default:
        return
    }
    event.preventDefault()
    revealControls()
  }

  const progress = total > 0 ? Math.min(100, (time / total) * 100) : 0
  const vertical = width !== null && height !== null && height > width
  const showBar = !playing || controlsShown

  return (
    <div ref={container} className="story-player" role="group" tabIndex={0} aria-label={`Reproductor: ${label}`}
      data-orientation={vertical ? 'vertical' : 'horizontal'} data-controls={showBar ? 'shown' : 'hidden'}
      onKeyDown={onKeyDown} onPointerMove={(event) => { if (event.pointerType !== 'touch') revealControls() }}
      onPointerDown={(event) => { lastPointer.current = event.pointerType }} onFocus={revealControls}>
      {vertical && poster && <img className="story-player-backdrop" src={poster} alt="" aria-hidden="true" />}
      <video ref={video} className="story-player-video" src={src} poster={poster ?? undefined} preload={preload} playsInline
        controlsList="nodownload" disablePictureInPicture aria-label={`Video: ${label}`}
        onContextMenu={(event) => event.preventDefault()} onClick={pressVideo}
        onPlay={(event) => {
          if (current && current !== event.currentTarget) current.pause()
          current = event.currentTarget
          setPlaying(true)
          setEnded(false)
          setFailed(false)
        }}
        onPause={() => setPlaying(false)} onEnded={() => { pausedByUser.current = true; setPlaying(false); setEnded(true) }}
        onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration)) setTotal(event.currentTarget.duration) }}
        onLoadedMetadata={(event) => {
          const { duration: seconds, videoWidth, videoHeight } = event.currentTarget
          if (Number.isFinite(seconds)) onMetadata?.({ duration: seconds, width: videoWidth, height: videoHeight })
        }}
        onError={() => {
          setWaiting(false)
          setPlaying(false)
          if (onUnplayable) onUnplayable()
          else setFailed(true)
        }} />

      {failed
        ? (
          <div className="story-player-failure" role="alert">
            <p>No se pudo reproducir este video.</p>
            <button type="button" className="story-player-control wide" onClick={retry}>Reintentar</button>
          </div>
        )
        : (
          <>
            {!playing && (
              <button type="button" className="story-player-play" onClick={toggle} aria-label={`${ended ? 'Volver a ver' : 'Reproducir'}: ${label}`}>
                {ended ? <ReplayIcon /> : <PlayIcon />}
              </button>
            )}
            {waiting && playing && <span className="story-player-spinner" role="status" aria-label="Cargando video" />}
            {/* Siempre visible: quien ve un video sin sonido debe poder activarlo sin buscar el control. */}
            <button type="button" className="story-player-control story-player-sound" onClick={() => { setMuted(!muted); revealControls() }}
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
              {muted ? <VolumeOffIcon /> : <VolumeIcon />}
            </button>
            <div className="story-player-bar">
              <button type="button" className="story-player-control" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <input className="story-player-seek" type="range" min={0} max={total || 0} step={1} value={Math.min(time, total)}
                aria-label="Posición del video" aria-valuetext={`${duration(Math.floor(time))} de ${duration(Math.floor(total))}`}
                style={{ '--story-progress': `${progress}%` } as CSSProperties}
                onChange={(event) => seek(Number(event.target.value))} />
              <span className="story-player-time">{duration(Math.floor(time))} / {duration(Math.floor(total))}</span>
              {canFullscreen && (
                <button type="button" className="story-player-control" onClick={toggleFullscreen} aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                  {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                </button>
              )}
            </div>
          </>
        )}
    </div>
  )
}
