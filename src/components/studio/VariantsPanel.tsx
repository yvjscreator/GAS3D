import { useRef, useState } from 'react'
import { garmentVariantPresets } from '../../config/garmentVariants'
import { useStudioStore } from '../../store/studioStore'
import type { VariantAssetRole } from '../../types/studio'
import { removePreparedMedia, storePreparedMedia, variantMediaKey } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { ArrowRight, ImagePlus, Trash2 } from '../icons'
import { ResponsiveOptionGrid } from '../ui'

export function VariantsPanel() {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const { variantAssets, setVariantAsset, activeVariantId, setActiveVariantId, setActivePrintPlacement, setTargetRotation } = useStudioStore()
  const ready = Boolean(variantAssets.large.url && variantAssets.small.url)
  const choose = async (files?: FileList | null) => {
    if (!files || files.length !== 2) { setError('Selecciona exactamente dos imágenes.'); return }
    const candidates = Array.from(files)
    if (candidates.some((file) => !['image/png', 'image/webp'].includes(file.type))) { setError('Ambas imágenes deben ser PNG o WebP.'); return }
    try {
      const inspected = await Promise.all(candidates.map(async (file) => ({ file, prepared: await prepareVideoAsset(file) })))
      inspected.sort((a, b) => b.prepared.metadata.originalWidth * b.prepared.metadata.originalHeight - a.prepared.metadata.originalWidth * a.prepared.metadata.originalHeight)
      const assignments: [VariantAssetRole, typeof inspected[number]][] = [['large', inspected[0]], ['small', inspected[1]]]
      await Promise.all(assignments.map(async ([role, item]) => {
        if (variantAssets[role].url) URL.revokeObjectURL(variantAssets[role].url!)
        if (variantAssets[role].thumbnailUrl) URL.revokeObjectURL(variantAssets[role].thumbnailUrl!)
        await storePreparedMedia(variantMediaKey(role), item.prepared.renderBlob, item.prepared.thumbnailBlob, item.prepared.metadata)
        setVariantAsset(role, { url: URL.createObjectURL(item.prepared.renderBlob), thumbnailUrl: URL.createObjectURL(item.prepared.thumbnailBlob), name: item.file.name, width: item.prepared.metadata.proxyWidth, height: item.prepared.metadata.proxyHeight, originalWidth: item.prepared.metadata.originalWidth, originalHeight: item.prepared.metadata.originalHeight, originalBytes: item.prepared.metadata.originalBytes, renderBytes: item.prepared.metadata.renderBytes, profile: item.prepared.metadata.profile })
      }))
      setError(null)
    } catch { setError('No se pudieron leer las dimensiones de una imagen.') }
  }
  const clear = () => {
    ;(['large', 'small'] as VariantAssetRole[]).forEach((role) => {
      if (variantAssets[role].url) URL.revokeObjectURL(variantAssets[role].url!)
      if (variantAssets[role].thumbnailUrl) URL.revokeObjectURL(variantAssets[role].thumbnailUrl!)
      void removePreparedMedia(variantMediaKey(role))
      setVariantAsset(role, { url: null, thumbnailUrl: null, name: null, width: 0, height: 0 })
    })
  }
  const selectPreset = (preset: typeof garmentVariantPresets[number]) => {
    setActiveVariantId(preset.id)
    setActivePrintPlacement(preset.focusPlacement)
    setTargetRotation(preset.focusPlacement === 'backCenter' ? Math.PI : 0)
  }
  return <section className="panel variants-panel"><h2>Variantes</h2>
    <input ref={input} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => { void choose(event.target.files); event.target.value = '' }} />
    <p className="muted">Carga dos artes. La de mayor resolución se asignará como principal.</p>
    <button className="upload-button" onClick={() => input.current?.click()}><ImagePlus size={14} /> {ready ? 'Reemplazar las 2 imágenes' : 'Cargar 2 imágenes'}</button>
    {(variantAssets.large.name || variantAssets.small.name) && <div className="variant-assets">{(['large', 'small'] as VariantAssetRole[]).map((role) => <div key={role} className="variant-asset">{(variantAssets[role].thumbnailUrl || variantAssets[role].url) && <img src={(variantAssets[role].thumbnailUrl || variantAssets[role].url)!} alt="" />}<span><b>{role === 'large' ? 'Principal' : 'Secundaria'}</b><small>{variantAssets[role].width} × {variantAssets[role].height}</small></span></div>)}</div>}
    <ResponsiveOptionGrid minWidth={170} className="variant-presets">{garmentVariantPresets.map((preset, index) => <button key={preset.id} disabled={!ready} className={activeVariantId === preset.id && ready ? 'variant-preset active' : 'variant-preset'} onClick={() => selectPreset(preset)}><i>{index + 1}</i><span>{preset.label}</span><small>{ready ? 'Lista' : 'Esperando imágenes'}</small></button>)}</ResponsiveOptionGrid>
    {ready && <div className="variant-ready-actions"><p className="variant-sequence-note"><span>1</span><ArrowRight size={12} /><span>2</span><ArrowRight size={12} /><span>3</span><ArrowRight size={12} /><span>4</span></p><button className="text-button" onClick={clear}><Trash2 size={12} /> Vaciar biblioteca</button></div>}
    {error && <p className="error">{error}</p>}
  </section>
}
