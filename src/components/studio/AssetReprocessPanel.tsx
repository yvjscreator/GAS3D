import { useCallback, useEffect, useMemo, useState } from 'react'
import { renderAssetManager } from '../../render/RenderAssetManager'
import { useStudioStore } from '../../store/studioStore'
import type { CollectionAssetRole, VariantAssetRole } from '../../types/studio'
import { collectionMediaKey, loadMediaMetadata, loadSourceMedia, storePreparedMedia, variantMediaKey } from '../../utils/mediaStorage'
import { prepareVideoAsset, type PreparedVideoAssetMetadata } from '../../utils/mediaProcessor'
import { Image, RefreshCw, ShieldCheck } from '../icons'

type Target = {
  key: string
  label: string
  kind: 'variant' | 'collection'
  role: VariantAssetRole | CollectionAssetRole
  itemId?: string
}
type AssetStatus = { metadata: PreparedVideoAssetMetadata | null; hasSource: boolean }

export function AssetReprocessPanel({ onTaskChange }: { onTaskChange?: (message: string | null) => void }) {
  const studio = useStudioStore()
  const [statuses, setStatuses] = useState<Record<string, AssetStatus>>({})
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const targets = useMemo<Target[]>(() => {
    const result: Target[] = []
    if (studio.variantAssets.large.name) result.push({ key: variantMediaKey('large'), label: `Principal · ${studio.variantAssets.large.name}`, kind: 'variant', role: 'large' })
    if (studio.variantAssets.small.name) result.push({ key: variantMediaKey('small'), label: `Companion · ${studio.variantAssets.small.name}`, kind: 'variant', role: 'small' })
    studio.collectionItems.forEach((item) => {
      if (item.asset.name) result.push({ key: collectionMediaKey(item.id, 'main'), label: `${item.name} · Principal`, kind: 'collection', role: 'main', itemId: item.id })
      if (item.companionAsset.name) result.push({ key: collectionMediaKey(item.id, 'companion'), label: `${item.name} · Companion`, kind: 'collection', role: 'companion', itemId: item.id })
    })
    return result
  }, [studio.collectionItems, studio.variantAssets.large.name, studio.variantAssets.small.name])
  const targetKey = targets.map((item) => `${item.key}:${item.label}`).join('|')
  const refresh = useCallback(async () => {
    const entries = await Promise.all(targets.map(async (target) => {
      const [metadata, source] = await Promise.all([loadMediaMetadata<PreparedVideoAssetMetadata>(target.key), loadSourceMedia(target.key)])
      return [target.key, { metadata, hasSource: Boolean(source) }] as const
    }))
    setStatuses(Object.fromEntries(entries))
  }, [targets])
  useEffect(() => { void refresh() }, [refresh, targetKey])
  const outdated = targets.filter((target) => { const metadata = statuses[target.key]?.metadata; return !metadata || metadata.profile !== studio.assetQualityProfile || metadata.alphaMode !== studio.alphaPipelineMode })
  const reprocessable = targets.filter((target) => statuses[target.key]?.hasSource)
  const selected = studio.campaignMode === 'collection'
    ? targets.find((target) => target.kind === 'collection' && target.itemId === studio.activeCollectionItemId && target.role === studio.activeCollectionAssetRole)
    : (() => { const combination = studio.designCombinations.find((item) => item.id === studio.activeDesignCombinationId); const role: VariantAssetRole = combination?.focusRole === 'companion' ? 'small' : 'large'; return targets.find((target) => target.kind === 'variant' && target.role === role) })()
  const replaceUrls = (target: Target, prepared: Awaited<ReturnType<typeof prepareVideoAsset>>) => {
    const url = URL.createObjectURL(prepared.renderBlob); const thumbnailUrl = URL.createObjectURL(prepared.thumbnailBlob)
    const metadata = prepared.metadata
    if (target.kind === 'variant') {
      const role = target.role as VariantAssetRole; const current = useStudioStore.getState().variantAssets[role]
      useStudioStore.getState().setVariantAsset(role, { ...current, url, thumbnailUrl, width: metadata.proxyWidth, height: metadata.proxyHeight, originalWidth: metadata.originalWidth, originalHeight: metadata.originalHeight, originalBytes: metadata.originalBytes, renderBytes: metadata.renderBytes, profile: metadata.profile })
      window.setTimeout(() => { if (current.url) { renderAssetManager.invalidate(current.url); URL.revokeObjectURL(current.url) } if (current.thumbnailUrl) URL.revokeObjectURL(current.thumbnailUrl) }, 1200)
      return
    }
    const item = useStudioStore.getState().collectionItems.find((candidate) => candidate.id === target.itemId)
    if (!item) { URL.revokeObjectURL(url); URL.revokeObjectURL(thumbnailUrl); return }
    const companion = target.role === 'companion'; const current = companion ? item.companionAsset : item.asset
    useStudioStore.getState().updateCollectionItem(item.id, companion ? { companionAsset: { ...current, url, thumbnailUrl, width: metadata.proxyWidth, height: metadata.proxyHeight, originalWidth: metadata.originalWidth, originalHeight: metadata.originalHeight, originalBytes: metadata.originalBytes, renderBytes: metadata.renderBytes, profile: metadata.profile }, companionPrint: { ...item.companionPrint, url, name: current.name } } : { asset: { ...current, url, thumbnailUrl, width: metadata.proxyWidth, height: metadata.proxyHeight, originalWidth: metadata.originalWidth, originalHeight: metadata.originalHeight, originalBytes: metadata.originalBytes, renderBytes: metadata.renderBytes, profile: metadata.profile }, print: { ...item.print, url, name: current.name } })
    window.setTimeout(() => { if (current.url) { renderAssetManager.invalidate(current.url); URL.revokeObjectURL(current.url) } if (current.thumbnailUrl) URL.revokeObjectURL(current.thumbnailUrl) }, 1200)
  }
  const process = async (requested: Target[]) => {
    const available = requested.filter((target) => statuses[target.key]?.hasSource)
    if (!available.length) { setMessage('No hay originales almacenados para esta selección. Vuelve a importar esas artes una vez.'); return }
    setRunning(true); setMessage(null)
    let completed = 0
    try {
      for (const target of available) {
        onTaskChange?.(`Reprocesando · ${target.label} · ${completed + 1}/${available.length}`)
        const [source, metadata] = await Promise.all([loadSourceMedia(target.key), loadMediaMetadata<PreparedVideoAssetMetadata>(target.key)])
        if (!source) throw new Error(`Falta el original de ${target.label}.`)
        const file = new File([source], metadata?.originalName ?? target.label, { type: source.type || 'image/png' })
        const prepared = await prepareVideoAsset(file, { profile: studio.assetQualityProfile, alphaMode: studio.alphaPipelineMode })
        if (!prepared.renderBlob.size || !prepared.thumbnailBlob.size) throw new Error(`El nuevo proxy de ${target.label} está vacío.`)
        await storePreparedMedia(target.key, prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata, source)
        replaceUrls(target, prepared); completed += 1
      }
      const result = `${completed} artes actualizadas · ${studio.assetQualityProfile} · ${studio.alphaPipelineMode}`
      setMessage(result); onTaskChange?.(result); await refresh()
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo completar el reprocesado.'
      setMessage(detail); onTaskChange?.(`Error de reprocesado · ${detail}`)
    } finally { setRunning(false) }
  }
  return <section className="asset-reprocess"><div className="advanced-section-title"><RefreshCw size={14} /><span>Reprocesar artes actuales</span></div>
    <div className="asset-health-summary"><ShieldCheck size={18} /><span><strong>{Math.max(0, targets.length - outdated.length)} de {targets.length} coinciden</strong><small>{outdated.length} requieren actualización · {targets.length - reprocessable.length} sin original almacenado</small></span></div>
    <p className="muted">Los originales permanecen en IndexedDB; solo el proxy preparado entra a memoria y GPU.</p>
    <div className="reprocess-actions"><button disabled={running || !outdated.some((item) => statuses[item.key]?.hasSource)} onClick={() => void process(outdated)}><RefreshCw size={13} /> Reprocesar desactualizadas</button><button disabled={running || !selected || !statuses[selected.key]?.hasSource} onClick={() => selected && void process([selected])}><Image size={13} /> Arte seleccionada</button><button disabled={running || !reprocessable.length} onClick={() => void process(reprocessable)}><RefreshCw size={13} /> Reprocesar todas</button></div>
    {message && <p className={message.includes('actualizadas') ? 'success' : 'error'}>{message}</p>}
  </section>
}
