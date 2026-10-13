import { useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Layers3, LoaderCircle, Plus, X } from 'lucide-react'

export type BatchAsset = {
  id: number
  file: File
  status: 'pending' | 'processing' | 'ready' | 'error'
  detail?: string
  progress?: number
}

type Props = {
  items: BatchAsset[]
  selectedId: number | null
  running: boolean
  current: number
  summary: string | null
  onSelect: (item: BatchAsset) => void
  onRemove: (id: number) => void
  onAdd: () => void
  onClose: () => void
}

function BatchThumbnail({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let queued = false
    const draw = async () => {
      if (queued) return
      queued = true
      let bitmap: ImageBitmap | null = null
      try {
        // Native decoder downscaling keeps large source photos out of sidebar RAM.
        bitmap = await createImageBitmap(file, { resizeWidth: 80, resizeQuality: 'medium' })
        if (cancelled) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, 64, 64)
        const scale = Math.min(64 / bitmap.width, 64 / bitmap.height)
        const width = bitmap.width * scale
        const height = bitmap.height * scale
        ctx.drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height)
      } catch {
        // Invalid files remain visible with a placeholder and are reported at export.
      } finally {
        bitmap?.close()
      }
    }

    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((records) => {
        if (!records.some((record) => record.isIntersecting)) return
        observer.disconnect()
        void draw()
      }, { rootMargin: '120px' })
      : null

    if (observer) observer.observe(canvas)
    else void draw()

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [file])

  return <span className="images-layer-thumbnail">
    <canvas ref={canvasRef} width={64} height={64} aria-hidden="true" />
  </span>
}

export function ImagesBatchSidebar({
  items, selectedId, running, current, summary, onSelect, onRemove, onAdd, onClose,
}: Props) {
  return <aside className="images-batch-sidebar" aria-label="Capas de imágenes del lote">
    <div className="images-batch-sidebar-header">
      <div className="images-batch-sidebar-title">
        <Layers3 size={16} />
        <span><strong>Imágenes</strong><small>{items.length} en el lote{running ? ' · ' + current + ' procesándose' : ''}</small></span>
      </div>
      <button className="images-batch-sidebar-close" type="button" aria-label="Cerrar lista de imágenes" onClick={onClose}><X size={17} /></button>
    </div>
    <div className="images-batch-layer-list">
      {!items.length && <p className="images-batch-layer-empty">Añade imágenes para verlas como capas y procesarlas juntas.</p>}
      {items.map((item, index) =>
        <div className={'images-batch-layer' + (selectedId === item.id ? ' selected' : '')} key={item.id}>
          <button type="button" className="images-batch-layer-select" onClick={() => onSelect(item)} disabled={running}
            aria-current={selectedId === item.id ? 'true' : undefined} title={item.file.name}>
            <BatchThumbnail file={item.file} />
            <span className="images-batch-layer-copy">
              <strong>{item.file.name}</strong>
              <small>{item.status === 'ready' ? 'Listo · PNG' :
                item.status === 'processing' ? 'Procesando · ' + (item.progress ?? 0) + '%' :
                item.status === 'error' ? item.detail || 'Error al procesar' :
                'Imagen ' + (index + 1) + ' · pendiente'}</small>
            </span>
            <span className={'images-batch-layer-status ' + item.status} aria-label={item.status}>
              {item.status === 'ready' ? <CheckCircle2 size={15} /> :
                item.status === 'error' ? <AlertCircle size={15} /> :
                item.status === 'processing' ? <LoaderCircle size={15} /> : null}
            </span>
          </button>
          <button type="button" className="images-batch-layer-remove" disabled={running} onClick={() => onRemove(item.id)}
            aria-label={'Quitar ' + item.file.name} title="Quitar del lote"><X size={14} /></button>
        </div>,
      )}
    </div>
    <div className="images-batch-sidebar-footer">
      {summary && <p className="images-batch-sidebar-summary" role="status">{summary}</p>}
      <button type="button" className="images-batch-sidebar-add" disabled={running} onClick={onAdd}>
        <Plus size={16} /> Añadir imágenes
      </button>
    </div>
  </aside>
}
