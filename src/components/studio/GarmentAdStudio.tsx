import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AdStage } from '../stage/AdStage'
import { GarmentPanel } from './GarmentPanel'
import { DesignPanel } from './DesignPanel'
import { BackgroundPanel } from './BackgroundPanel'
import { AnimationPanel } from './AnimationPanel'
import { FormatSelector } from './FormatSelector'
import { ExportPanel } from './ExportPanel'
import { useStudioStore } from '../../store/studioStore'
import { useRecording } from '../../hooks/useRecording'
import { printPlacements } from '../../types/studio'
import { backgroundMediaKey, loadMedia, printMediaKey } from '../../utils/mediaStorage'

function AccordionSection({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="control-accordion" open={open}><summary><span>{title}</span><b>⌄</b></summary><div className="accordion-body">{children}</div></details>
}

export function GarmentAdStudio() {
  const studio = useStudioStore(); const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null); const { start } = useRecording()
  useEffect(() => {
    let active = true
    const restoredUrls: string[] = []
    const restore = async () => {
      for (const placement of printPlacements) {
        const current = useStudioStore.getState().prints[placement]
        if (!current.name) continue
        const blob = await loadMedia(printMediaKey(placement)).catch(() => null)
        if (!active || !blob) continue
        const url = URL.createObjectURL(blob); restoredUrls.push(url)
        useStudioStore.getState().setPrint(placement, { url })
      }
      const state = useStudioStore.getState()
      if (state.background.type !== 'color' && state.background.name) {
        const blob = await loadMedia(backgroundMediaKey).catch(() => null)
        if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().setBackground({ url }) }
      }
    }
    void restore()
    return () => { active = false; restoredUrls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])
  const play = () => { if (studio.background.type === 'video' && media.current instanceof HTMLVideoElement) { media.current.currentTime = 0; void media.current.play() }; studio.play() }
  const record = () => {
    studio.setRecording('recording', 0, null); play()
    start({ renderCanvas: canvas, media: media.current, background: studio.background, duration: studio.duration,
      onProgress: (seconds) => studio.setRecording('recording', seconds),
      onFinish: (message) => studio.setRecording('ready', studio.duration, message),
      onError: (message) => studio.setRecording('error', 0, message),
    })
  }
  const viewer = { garmentColor: studio.garmentColor, printApplications: Object.values(studio.prints), printZoneAdjustments: studio.printZoneAdjustments, activePrintPlacement: studio.activePrintPlacement, zoneEditMode: studio.zoneEditMode, onPrintMove: (placement: Parameters<typeof studio.setPrint>[0], x: number, y: number) => studio.setPrint(placement, { x, y }), onPrintScale: (placement: Parameters<typeof studio.setPrint>[0], scale: number) => studio.setPrint(placement, { scale }), onPrintZoneChange: (placement: Parameters<typeof studio.setPrintZoneAdjustment>[0], value: Parameters<typeof studio.setPrintZoneAdjustment>[1]) => studio.setPrintZoneAdjustment(placement, value), showPrintGuides: studio.recordingStatus !== 'recording', animation: studio.animation, duration: studio.duration, playbackKey: studio.playbackKey, targetRotation: studio.targetRotation }
  return <main className="studio zen-studio">
    <button className="controls-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? '‹' : '☰'}<span>{sidebarOpen ? 'Ocultar' : 'Controles'}</span></button>
    <div className={sidebarOpen ? 'zen-layout' : 'zen-layout sidebar-closed'}>
      <aside className="control-drawer">
        <div className="drawer-spacer" />
        <AccordionSection title="Prenda"><GarmentPanel /></AccordionSection>
        <AccordionSection title="Diseños y zonas" open><DesignPanel /></AccordionSection>
        <AccordionSection title="Fondo"><BackgroundPanel /></AccordionSection>
        <AccordionSection title="Formato"><FormatSelector /></AccordionSection>
        <AccordionSection title="Animación"><AnimationPanel /></AccordionSection>
        <AccordionSection title="Grabación"><ExportPanel onRecord={record} /></AccordionSection>
      </aside>
      <section className="zen-workspace">
        <AdStage format={studio.format} background={studio.background} mediaRef={media} onCanvasReady={setCanvas} viewer={viewer} />
        <div className="workspace-status">{studio.zoneEditMode ? 'CONFIGURANDO ZONA' : 'EDITANDO DISEÑO'} · {studio.activePrintPlacement}</div>
        <div className="action-dock"><button className="preview-button" disabled={studio.recordingStatus === 'recording'} onClick={play}>▶ Previsualizar</button><button className="record-button footer-record" disabled={studio.recordingStatus === 'recording'} onClick={record}>● Grabar</button></div>
        <p className="preview-hint">{studio.zoneEditMode ? 'Arrastra la zona iluminada · usa las esquinas para definir sus límites' : 'Arrastra el diseño · esquinas para escalar · fuera para girar'}</p>
        {studio.recordingStatus === 'recording' && <div className="recording-overlay"><i /> GRABANDO <strong>{studio.recordingElapsed.toFixed(1)} / {studio.duration}s</strong></div>}
      </section>
    </div>
  </main>
}
