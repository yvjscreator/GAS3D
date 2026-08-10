import type { CSSProperties } from 'react'
import { BackgroundLayer } from './BackgroundLayer'
import { GarmentViewer } from '../viewer/GarmentViewer'
import { exportPresets } from '../../config/exportPresets'
import type { BackgroundSettings, FormatId } from '../../types/studio'
import type { GarmentViewerProps } from '../viewer/GarmentViewer'

export function AdStage({ format, background, viewer, onCanvasReady, mediaRef }: { format: FormatId; background: BackgroundSettings; viewer: Omit<GarmentViewerProps, 'onCanvasReady'>; onCanvasReady: (canvas: HTMLCanvasElement) => void; mediaRef: React.MutableRefObject<HTMLImageElement | HTMLVideoElement | null> }) {
  const ratio = exportPresets[format].ratio
  return <section className="preview-shell">
    <div className="preview-frame" style={{ aspectRatio: String(ratio), '--stage-ratio': ratio } as CSSProperties}>
      <BackgroundLayer background={background} mediaRef={mediaRef} />
      <div className="background-shade" style={{ opacity: background.darkness / 100 }} />
      <div className="viewer-layer"><GarmentViewer {...viewer} onCanvasReady={onCanvasReady} /></div>
    </div>
  </section>
}
