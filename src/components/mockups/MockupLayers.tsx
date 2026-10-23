import { useEffect, useRef } from 'react'
import { Settings2, Shirt } from 'lucide-react'
import type { MockImage, ViewName } from './mockupEngine'
import { VIEWS, type Product } from './mockupProduct'
import type { ViewMode, ViewModes } from './mockupWorkspace'


function LayerThumbnail({ photo }: { photo: MockImage | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, 80, 80)
    // Product navigation closes working bitmaps before passive thumbnail effects.
    if (!photo || !photo.bitmap.width || !photo.bitmap.height) return
    const ratio = Math.min(80 / photo.width, 80 / photo.height)
    context.drawImage(photo.bitmap, (80 - photo.width * ratio) / 2, (80 - photo.height * ratio) / 2, photo.width * ratio, photo.height * ratio)
  }, [photo])
  return <span className="mockup-layer-thumbnail" aria-hidden="true">{photo ? <canvas ref={canvas} width="80" height="80" /> : <Shirt size={20} />}</span>
}

export function MockupLayers({ product, active, modes, labels, photos, disabled, onSelect, onMode, onManage }: {
  product: Product; active: ViewName; modes: ViewModes; labels: Record<ViewName, string>
  photos: Record<ViewName, MockImage | null>; disabled: boolean
  onSelect: (view: ViewName) => void; onMode: (view: ViewName, mode: ViewMode) => void; onManage: () => void
}) {
  return <section className="mockup-layers" aria-label="Capas del producto">
    <div className="mockup-layers-heading"><h2>Capas</h2><button type="button" onClick={onManage} disabled={disabled} aria-label="Configurar producto y vistas" title="Configurar producto y vistas"><Settings2 size={16} /></button></div>
    <div className="mockup-layer-list">
      {VIEWS.filter(view => product.views[view].enabled).map(view => <article key={view} className={'mockup-layer' + (view === active ? ' is-active' : '')} data-view={view}>
        <button type="button" className="mockup-layer-select" aria-pressed={view === active} disabled={disabled} onClick={() => onSelect(view)}>
          <LayerThumbnail photo={photos[view]} /><span><strong>{labels[view]}</strong><small>{product.views[view].zones.length} {product.views[view].zones.length === 1 ? 'zona' : 'zonas'}</small></span>
        </button>
        <button type="button" role="switch" aria-label={'Modo MockUp de ' + labels[view]} aria-checked={modes[view] === 'mockup'} disabled={disabled}
          className="mockup-layer-mode" onClick={() => onMode(view, modes[view] === 'setup' ? 'mockup' : 'setup')}>
          <span className={modes[view] === 'setup' ? 'is-current' : ''}>Config.</span><i aria-hidden="true" /><span className={modes[view] === 'mockup' ? 'is-current' : ''}>MockUp</span>
        </button>
      </article>)}
    </div>
  </section>
}
