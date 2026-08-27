import { useStudioStore } from '../../store/studioStore'
export function GarmentPanel() {
  const { garmentColor, setGarmentColor } = useStudioStore()
  return <section className="panel"><h2>Prenda</h2><p className="muted">Male oversized T-shirt · GLB V2 optimizado</p><div className="swatches"><button aria-label="Negro" className={garmentColor === '#050505' ? 'active' : ''} style={{ background: '#050505' }} onClick={() => setGarmentColor('#050505')} /><button aria-label="Blanco" className={garmentColor === '#F5F5F3' ? 'active pale' : 'pale'} style={{ background: '#F5F5F3' }} onClick={() => setGarmentColor('#F5F5F3')} /><label className="color-picker"><input type="color" value={garmentColor} onChange={(e) => setGarmentColor(e.target.value)} />Personalizado</label></div></section>
}
