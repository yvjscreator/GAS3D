import { useEffect, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { AlphaPipelineMode, AssetQualityProfile } from '../../types/studio'
import { FlaskConical, Gauge, ShieldCheck } from '../icons'
import { ResponsiveOptionGrid, SelectableCard } from '../ui'
import { renderAssetManager } from '../../render/RenderAssetManager'

const qualityOptions: { id: AssetQualityProfile; name: string; detail: string }[] = [
  { id: 'performance', name: 'Rendimiento', detail: 'Máximo 1536 px; menor memoria y carga rápida.' },
  { id: 'automatic', name: 'Automático', detail: 'Hasta 3072 px; equilibrio para generales y acercamientos.' },
  { id: 'quality', name: 'Máxima calidad', detail: 'Hasta 4096 px; más detalle y mayor consumo de GPU.' },
]

const alphaOptions: { id: AlphaPipelineMode; name: string; detail: string }[] = [
  { id: 'pngCurrent', name: 'Alpha A · PNG', detail: 'PNG reducido con el pipeline de transparencia actual.' },
  { id: 'webpLossless', name: 'Alpha B · WebP', detail: 'WebP a calidad máxima conservando canal alpha.' },
  { id: 'webpHigh', name: 'Alpha C · WebP HQ', detail: 'WebP a 92% para comparar peso, glows y bordes.' },
  { id: 'straightAlpha', name: 'Alpha D · Limpieza', detail: 'PNG con dilatación RGB en píxeles transparentes.' },
]

export function RenderLabPanel() {
  const studio = useStudioStore()
  const [metrics, setMetrics] = useState(() => renderAssetManager.getMetrics())
  useEffect(() => { const timer = window.setInterval(() => setMetrics(renderAssetManager.getMetrics()), 1000); return () => window.clearInterval(timer) }, [])
  const memoryMb = metrics.estimatedTextureBytes / 1024 / 1024
  return <section className="panel render-lab-panel"><h2><FlaskConical size={15} /> Laboratorio de render</h2>
    <p className="muted">Estos ajustes se aplican a las próximas imágenes que importes. Conserva las alternativas hasta completar la comparación visual.</p>
    <div className="advanced-section-title"><Gauge size={14} /><span>Calidad de artes</span></div>
    <ResponsiveOptionGrid minWidth={150} className="render-lab-grid">{qualityOptions.map((option) => <SelectableCard key={option.id} selected={studio.assetQualityProfile === option.id} onClick={() => studio.setAssetQualityProfile(option.id)}><strong>{option.name}</strong><small>{option.detail}</small></SelectableCard>)}</ResponsiveOptionGrid>
    <div className="advanced-section-title"><ShieldCheck size={14} /><span>Transparencia</span></div>
    <ResponsiveOptionGrid minWidth={160} className="render-lab-grid">{alphaOptions.map((option) => <SelectableCard key={option.id} selected={studio.alphaPipelineMode === option.id} onClick={() => studio.setAlphaPipelineMode(option.id)}><strong>{option.name}</strong><small>{option.detail}</small></SelectableCard>)}</ResponsiveOptionGrid>
    <div className="render-metrics"><span><strong>{metrics.cachedTextures}</strong> texturas en caché</span><span><strong>{metrics.referencedTextures}</strong> en uso</span><span><strong>{memoryMb.toFixed(1)} MB</strong> estimados</span><span><strong>{metrics.drawCalls}</strong> draw calls</span><span><strong>{metrics.triangles.toLocaleString()}</strong> triángulos</span></div>
  </section>
}
