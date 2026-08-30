import { useEffect, useRef } from 'react'
import type { BackgroundSettings } from '../../types/studio'

export function BackgroundLayer({ background, mediaRef }: { background: BackgroundSettings; mediaRef: React.MutableRefObject<HTMLImageElement | HTMLVideoElement | null> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    mediaRef.current = background.type === 'video' ? video : null
    return () => { if (mediaRef.current === video) mediaRef.current = null }
  }, [background.type, background.url, mediaRef])
  useEffect(() => {
    if (background.type === 'video' && videoRef.current) videoRef.current.muted = !background.videoAudioEnabled
  }, [background.type, background.videoAudioEnabled])
  useEffect(() => {
    if (background.type === 'video' && videoRef.current) videoRef.current.volume = Math.min(1, Math.max(0, background.videoVolume / 100))
  }, [background.type, background.videoVolume])
  useEffect(() => {
    if (background.type !== 'video' || !videoRef.current) return
    if (background.videoPaused) videoRef.current.pause()
    else if (videoRef.current.paused) void videoRef.current.play().catch(() => undefined)
  }, [background.type, background.url, background.videoPaused])
  const style = { filter: `blur(${background.blur * 0.18}px)`, transform: background.blur ? 'scale(1.06)' : undefined }
  if (background.type === 'image' && background.url) return <img ref={(node) => { mediaRef.current = node }} className="background-media" style={style} src={background.url} alt="Fondo cargado" />
  if (background.type === 'video' && background.url) return <video ref={videoRef} className="background-media" style={style} src={background.url} muted={!background.videoAudioEnabled} loop playsInline />
  return <div className="background-color" style={{ backgroundColor: background.color }} />
}
