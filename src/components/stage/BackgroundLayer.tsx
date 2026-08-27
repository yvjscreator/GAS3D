import { useEffect, useRef } from 'react'
import type { BackgroundSettings } from '../../types/studio'

export function BackgroundLayer({ background, mediaRef }: { background: BackgroundSettings; mediaRef: React.MutableRefObject<HTMLImageElement | HTMLVideoElement | null> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (background.type === 'video' && videoRef.current) {
      mediaRef.current = videoRef.current
      videoRef.current.muted = !background.videoAudioEnabled
      videoRef.current.volume = background.videoVolume / 100
      if (background.videoPaused) videoRef.current.pause()
      else void videoRef.current.play().catch(() => undefined)
    }
    else mediaRef.current = null
    return () => { mediaRef.current = null }
  }, [background.type, background.url, background.videoPaused, background.videoAudioEnabled, background.videoVolume, mediaRef])
  const style = { filter: `blur(${background.blur * 0.18}px)`, transform: background.blur ? 'scale(1.06)' : undefined }
  if (background.type === 'image' && background.url) return <img ref={(node) => { mediaRef.current = node }} className="background-media" style={style} src={background.url} alt="Fondo cargado" />
  if (background.type === 'video' && background.url) return <video ref={videoRef} className="background-media" style={style} src={background.url} muted={!background.videoAudioEnabled} loop playsInline />
  return <div className="background-color" style={{ backgroundColor: background.color }} />
}
