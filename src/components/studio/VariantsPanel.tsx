import { useRef, useState } from 'react'
import { garmentVariantPresets } from '../../config/garmentVariants'
import { useStudioStore } from '../../store/studioStore'
import type { VariantAssetRole } from '../../types/studio'
import { removeMedia, storeMedia, variantMediaKey } from '../../utils/mediaStorage'
import { ArrowRight, ImagePlus, Trash2 } from '../icons'
import { ResponsiveOptionGrid } from '../ui'

async function inspectImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const dimensions = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dimensions
}

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
      const inspected = await Promise.all(candidates.map(async (file) => ({ file, ...(await inspectImage(file)) })))
      inspected.sort((a, b) => b.width * b.height - a.width * a.height)
      const assignments: [VariantAssetRole, typeof inspected[number]][] = [['large', inspected[0]], ['small', inspected[1]]]
      assignments.forEach(([role, item]) => {
        if (variantAssets[role].url) URL.revokeObjectURL(variantAssets[role].url!)
        void storeMedia(variantMediaKey(role), item.file)
        setVariantAsset(role, { url: URL.createObjectURL(item.file), name: item.file.name, width: item.width, height: item.height })
      })
      setError(null)
    } catch { setError('No se pudieron leer las dimensiones de una imagen.') }
  }
  const clear = () => {
    ;(['large', 'small'] as VariantAssetRole[]).forEach((role) => {
      if (variantAssets[role].url) URL.revokeObjectURL(variantAssets[role].url!)
      void removeMedia(variantMediaKey(role))
      setVariantAsset(role, { url: null, name: null, width: 0, height: 0 })
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
    {(variantAssets.large.name || variantAssets.small.name) && <div className="variant-assets">{(['large', 'small'] as VariantAssetRole[]).map((role) => <div key={role} className="variant-asset">{variantAssets[role].url && <img src={variantAssets[role].url!} alt="" />}<span><b>{role === 'large' ? 'Principal' : 'Secundaria'}</b><small>{variantAssets[role].width} × {variantAssets[role].height}</small></span></div>)}</div>}
    <ResponsiveOptionGrid minWidth={170} className="variant-presets">{garmentVariantPresets.map((preset, index) => <button key={preset.id} disabled={!ready} className={activeVariantId === preset.id && ready ? 'variant-preset active' : 'variant-preset'} onClick={() => selectPreset(preset)}><i>{index + 1}</i><span>{preset.label}</span><small>{ready ? 'Lista' : 'Esperando imágenes'}</small></button>)}</ResponsiveOptionGrid>
    {ready && <div className="variant-ready-actions"><p className="variant-sequence-note"><span>1</span><ArrowRight size={12} /><span>2</span><ArrowRight size={12} /><span>3</span><ArrowRight size={12} /><span>4</span></p><button className="text-button" onClick={clear}><Trash2 size={12} /> Vaciar biblioteca</button></div>}
    {error && <p className="error">{error}</p>}
  </section>
}
