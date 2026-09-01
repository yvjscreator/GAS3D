import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFBX, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { PrintDecal } from './PrintDecal'
import type { GarmentModelConfig } from '../../types/garment'
import { printPlacements, type EditorMode, type PrintAlignmentRequest, type PrintPlacement, type PrintSettings, type PrintZoneAdjustment } from '../../types/studio'
import { PrintTransformOverlay } from './print/PrintTransformOverlay'
import { PrintZoneOverlay } from './print/PrintZoneOverlay'
import {
  clampUvCenterToIsland, createPrintSurfaceFrame, createPrintUvSurfaceFrame, createZoneSurfaceFrame, createZoneUvSurfaceFrame,
  getPrintMovementLimits, getUvPrintMovementLimits, isUvPointInIsland, isUvPointInside, uvPointToFrame, type UvSurfaceFrame,
} from './print/SurfaceFrame'
import { createCottonMaterial, createGarmentPrintUniforms, installGarmentPrintShader } from './print/GarmentPrintShader'
import { sampleUvSurfacePoint } from './print/UvSurfaceSampler'
import type { AmbilightRig } from './ambilightRig'
import { renderAssetManager } from '../../render/RenderAssetManager'

type UvInteraction =
  | { mode: 'designMove'; placement: PrintPlacement; zone: UvSurfaceFrame; pointerOffset: THREE.Vector2; startX: number; startY: number; axisLock: 'x' | 'y' | null }
  | { mode: 'designScale'; placement: PrintPlacement; centerX: number; centerY: number; startDistance: number; startScale: number }
  | { mode: 'zoneMove'; placement: PrintPlacement; frame: UvSurfaceFrame; pointerOffset: THREE.Vector2; startX: number; startY: number; axisLock: 'x' | 'y' | null }
  | { mode: 'zoneResize'; placement: PrintPlacement; frame: UvSurfaceFrame; baseWidth: number; baseHeight: number }

type PrintDraft = { placement: PrintPlacement } & Partial<Pick<PrintSettings, 'x' | 'y' | 'scale'>>
type ZoneDraft = { placement: PrintPlacement; value: Partial<PrintZoneAdjustment> }

type PointerCaptureTarget = { setPointerCapture?: (pointerId: number) => void; releasePointerCapture?: (pointerId: number) => void }
const pointerTarget = (event: ThreeEvent<PointerEvent>) => event.target as PointerCaptureTarget | null
const alignmentVector = (alignment: PrintAlignmentRequest['alignment']): [number, number] => {
  const x = alignment.endsWith('Left') ? -1 : alignment.endsWith('Right') ? 1 : 0
  const y = alignment.startsWith('top') ? 1 : alignment.startsWith('bottom') ? -1 : 0
  return [x, y]
}

function ShirtMesh({ color, config, prints }: { color: string; config: GarmentModelConfig; prints: PrintSettings[] }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.72, -1.75); shape.lineTo(0.72, -1.75); shape.lineTo(0.82, 0.85)
    shape.lineTo(1.72, 0.48); shape.lineTo(2.12, 1.62); shape.lineTo(1.24, 2.02)
    shape.lineTo(0.7, 1.72); shape.lineTo(0.52, 2.16); shape.lineTo(-0.52, 2.16)
    shape.lineTo(-0.7, 1.72); shape.lineTo(-1.24, 2.02); shape.lineTo(-2.12, 1.62)
    shape.lineTo(-1.72, 0.48); shape.lineTo(-0.82, 0.85); shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 7 })
    geo.translate(0, -0.15, -0.3)
    geo.computeVertexNormals()
    return geo
  }, [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, envMapIntensity: 0.15 }), [color])
  material.color.set(color)
  return <>
    <mesh geometry={geometry} material={material} castShadow receiveShadow>
      {prints.map((print) => print.url && <PrintDecal key={print.placement} settings={print} zone={config.printZones[print.placement]} />)}
    </mesh>
    <mesh position={[0, 1.79, 0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[0.47, 0.09, 16, 48]} />
      <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
    </mesh>
  </>
}

type LoadedShirtProps = {
  color: string; config: GarmentModelConfig; prints: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; editorMode: EditorMode
  alignmentRequest: PrintAlignmentRequest | null
  ambilightRig: AmbilightRig; ambilightEnabled: boolean
  onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void
  onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides: boolean; onPrintDragState: (dragging: boolean) => void
}

function LoadedShirt({ source, color, config, prints, printZoneAdjustments, activePrintPlacement, editorMode, alignmentRequest, ambilightRig, ambilightEnabled, onPrintMove, onPrintScale, onPrintZoneChange, showPrintGuides, onPrintDragState }: LoadedShirtProps & { source: THREE.Object3D }) {
  const { camera, gl } = useThree()
  const uvInteraction = useRef<UvInteraction | null>(null)
  const printDraftRef = useRef<PrintDraft | null>(null)
  const zoneDraftRef = useRef<ZoneDraft | null>(null)
  const [printDraft, setPrintDraft] = useState<PrintDraft | null>(null)
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(null)
  const handledAlignment = useRef(0)
  const printUniforms = useMemo(() => createGarmentPrintUniforms(), [])
  const [printTextures, setPrintTextures] = useState<Record<string, THREE.Texture>>({})
  const heldTextureUrls = useRef(new Set<string>())
  useFrame(() => {
    printUniforms.ambilight.color.value.copy(ambilightRig.average)
    printUniforms.ambilight.reach.value = ambilightRig.reach
    printUniforms.ambilight.strength.value = ambilightEnabled ? ambilightRig.strength : 0
  })
  const prepared = useMemo(() => {
    const clone = source.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const normalizer = 4.5 / Math.max(size.x, size.y, size.z)
    clone.traverse((item) => {
      if (!('isMesh' in item) || !item.isMesh) return
      const mesh = item as THREE.Mesh
      mesh.castShadow = false; mesh.receiveShadow = false
      const wasArray = Array.isArray(mesh.material)
      const originalMaterials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const materials = originalMaterials.map(createCottonMaterial)
      materials.forEach((material) => { material.side = THREE.FrontSide; installGarmentPrintShader(material, printUniforms) })
      mesh.material = wasArray ? materials : materials[0]
    })
    clone.position.sub(center)
    return { clone, center, normalizer }
  }, [source, printUniforms])
  useEffect(() => {
    prepared.clone.traverse((item) => {
      if (!('isMesh' in item) || !item.isMesh) return
      const mesh = item as THREE.Mesh
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        if ('color' in material && material.color instanceof THREE.Color) material.color.set(color)
        if ('metalness' in material) material.metalness = 0
        if ('roughness' in material) material.roughness = 0.92
      })
    })
  }, [color, prepared])
  const printUrlKey = JSON.stringify(Array.from(new Set(prints.flatMap((print) => print.url ? [print.url] : []))).sort())
  useEffect(() => {
    let active = true
    const urls = JSON.parse(printUrlKey) as string[]
    if (!urls.length) {
      const previous = heldTextureUrls.current; heldTextureUrls.current = new Set(); setPrintTextures({})
      previous.forEach((url) => renderAssetManager.releaseTexture(url)); return
    }
    void Promise.allSettled(urls.map(async (url) => [url, await renderAssetManager.acquireTexture(url)] as const)).then((results) => {
      const acquired = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      if (!active || acquired.length !== urls.length) { acquired.forEach(([url]) => renderAssetManager.releaseTexture(url)); return }
      const previous = heldTextureUrls.current
      heldTextureUrls.current = new Set(urls)
      setPrintTextures(Object.fromEntries(acquired))
      requestAnimationFrame(() => previous.forEach((url) => renderAssetManager.releaseTexture(url)))
    })
    return () => { active = false }
  }, [printUrlKey])
  useEffect(() => () => { heldTextureUrls.current.forEach((url) => renderAssetManager.releaseTexture(url)); heldTextureUrls.current.clear() }, [])

  const renderedPrints = useMemo(() => printDraft
    ? prints.map((print) => print.placement === printDraft.placement ? { ...print, ...printDraft } : print)
    : prints, [printDraft, prints])
  const renderedZoneAdjustments = useMemo(() => zoneDraft
    ? { ...printZoneAdjustments, [zoneDraft.placement]: { ...printZoneAdjustments[zoneDraft.placement], ...zoneDraft.value } }
    : printZoneAdjustments, [printZoneAdjustments, zoneDraft])
  const previewPrint = useCallback((placement: PrintPlacement, value: Partial<Pick<PrintSettings, 'x' | 'y' | 'scale'>>) => {
    const next = printDraftRef.current?.placement === placement
      ? { ...printDraftRef.current, ...value }
      : { placement, ...value }
    printDraftRef.current = next
    setPrintDraft(next)
  }, [])
  const previewZone = useCallback((placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => {
    const next = zoneDraftRef.current?.placement === placement
      ? { placement, value: { ...zoneDraftRef.current.value, ...value } }
      : { placement, value }
    zoneDraftRef.current = next
    setZoneDraft(next)
  }, [])
  const commitPrintDraft = useCallback(() => {
    const draft = printDraftRef.current
    if (!draft) return
    if (draft.x !== undefined || draft.y !== undefined) {
      const current = prints.find((item) => item.placement === draft.placement)
      onPrintMove?.(draft.placement, draft.x ?? current?.x ?? 0, draft.y ?? current?.y ?? 0)
    }
    if (draft.scale !== undefined) onPrintScale?.(draft.placement, draft.scale)
    printDraftRef.current = null
    setPrintDraft(null)
  }, [onPrintMove, onPrintScale, prints])
  const commitZoneDraft = useCallback(() => {
    const draft = zoneDraftRef.current
    if (!draft) return
    onPrintZoneChange?.(draft.placement, draft.value)
    zoneDraftRef.current = null
    setZoneDraft(null)
  }, [onPrintZoneChange])

  const getZoneFrame = useCallback((placement: PrintPlacement) => createZoneSurfaceFrame(
    config, placement, renderedZoneAdjustments[placement], prepared.normalizer, prepared.center,
  ), [config, renderedZoneAdjustments, prepared.center, prepared.normalizer])
  const getFrame = useCallback((placement: PrintPlacement, settings: PrintSettings) => {
    const texture = settings.url ? printTextures[settings.url] : undefined
    const image = texture?.image as { width?: number; height?: number } | undefined
    const aspect = image?.width && image?.height ? image.width / image.height : 1
    return createPrintSurfaceFrame(getZoneFrame(placement), settings, prepared.normalizer, aspect, texture)
  }, [getZoneFrame, prepared.normalizer, printTextures])
  const getUvZoneFrame = useCallback((placement: PrintPlacement) => createZoneUvSurfaceFrame(
    config, placement, renderedZoneAdjustments[placement], prepared.normalizer,
  ), [config, prepared.normalizer, renderedZoneAdjustments])
  const getUvFrame = useCallback((placement: PrintPlacement, settings: PrintSettings) => {
    const zone = getUvZoneFrame(placement)
    if (!zone) return null
    const texture = settings.url ? printTextures[settings.url] : undefined
    const image = texture?.image as { width?: number; height?: number } | undefined
    const aspect = image?.width && image?.height ? image.width / image.height : 1
    return createPrintUvSurfaceFrame(zone, settings, prepared.normalizer, aspect)
  }, [getUvZoneFrame, prepared.normalizer, printTextures])

  useEffect(() => {
    printPlacements.forEach((placement, index) => {
      const slot = printUniforms.slots[index]
      const settings = renderedPrints.find((item) => item.placement === placement)
      if (!settings) { slot.enabled.value = 0; return }
      const texture = settings.url ? printTextures[settings.url] : undefined
      const uvFrame = getUvFrame(placement, settings)
      if (uvFrame) {
        const zoneFrame = getUvZoneFrame(placement)!
        slot.uvMode.value = 1
        slot.uvCenter.value.copy(uvFrame.center); slot.uvRight.value.copy(uvFrame.right); slot.uvUp.value.copy(uvFrame.up)
        slot.uvSize.value.set(uvFrame.width, uvFrame.height)
        slot.uvZoneCenter.value.copy(zoneFrame.center); slot.uvZoneRight.value.copy(zoneFrame.right); slot.uvZoneUp.value.copy(zoneFrame.up)
        slot.uvZoneSize.value.set(zoneFrame.width, zoneFrame.height)
      } else {
        const frame = getFrame(placement, settings)
        slot.uvMode.value = 0
        slot.center.value.copy(frame.center); slot.right.value.copy(frame.right); slot.up.value.copy(frame.up); slot.normal.value.copy(frame.normal)
        slot.size.value.set(frame.width, frame.height); slot.depth.value = frame.depth
      }
      slot.map.value = texture ?? slot.map.value
      slot.opacity.value = 0.9736
      slot.enabled.value = settings.url && texture ? 1 : 0
    })
    const activeSettings = renderedPrints.find((item) => item.placement === activePrintPlacement)
    const activeUvFrame = editorMode === 'design' && activeSettings?.url
      ? getUvFrame(activePrintPlacement, activeSettings)
      : getUvZoneFrame(activePrintPlacement)
    if (activeUvFrame) {
      printUniforms.active.uvMode.value = 1
      printUniforms.active.uvCenter.value.copy(activeUvFrame.center); printUniforms.active.uvRight.value.copy(activeUvFrame.right); printUniforms.active.uvUp.value.copy(activeUvFrame.up)
      printUniforms.active.uvSize.value.set(activeUvFrame.width, activeUvFrame.height)
      printUniforms.active.handleRadius.value = 0.009
    } else {
      const activeFrame = editorMode === 'design' && activeSettings?.url
        ? getFrame(activePrintPlacement, activeSettings)
        : getZoneFrame(activePrintPlacement)
      printUniforms.active.uvMode.value = 0
      printUniforms.active.center.value.copy(activeFrame.center)
      printUniforms.active.right.value.copy(activeFrame.right); printUniforms.active.up.value.copy(activeFrame.up); printUniforms.active.normal.value.copy(activeFrame.normal)
      printUniforms.active.size.value.set(activeFrame.width, activeFrame.height); printUniforms.active.depth.value = activeFrame.depth
    }
    printUniforms.active.enabled.value = showPrintGuides ? 1 : 0
    printUniforms.active.fill.value = editorMode === 'zone' ? 1 : 0
  }, [renderedPrints, printTextures, printUniforms, activePrintPlacement, showPrintGuides, editorMode, getFrame, getZoneFrame, getUvFrame, getUvZoneFrame])
  useEffect(() => {
    if (!alignmentRequest || handledAlignment.current === alignmentRequest.id) return
    const [horizontal, vertical] = alignmentVector(alignmentRequest.alignment)
    if (alignmentRequest.target === 'zone') {
      const zoneFrame = getUvZoneFrame(alignmentRequest.placement)
      const uvConfig = config.printZones[alignmentRequest.placement].uv
      if (!zoneFrame || !uvConfig) return
      const islandCenter = zoneFrame.islandMin.clone().add(zoneFrame.islandMax).multiplyScalar(0.5)
      const islandSpan = zoneFrame.islandMax.clone().sub(zoneFrame.islandMin).length()
      const desiredCenter = islandCenter
        .addScaledVector(zoneFrame.right, horizontal * islandSpan)
        .addScaledVector(zoneFrame.up, vertical * islandSpan)
      clampUvCenterToIsland(desiredCenter, zoneFrame)
      const delta = desiredCenter.sub(new THREE.Vector2(...uvConfig.center))
      handledAlignment.current = alignmentRequest.id
      onPrintZoneChange?.(alignmentRequest.placement, {
        x: delta.dot(zoneFrame.right) * zoneFrame.metersPerUv * prepared.normalizer,
        y: delta.dot(zoneFrame.up) * zoneFrame.metersPerUv * prepared.normalizer,
      })
      return
    }
    const settings = renderedPrints.find((item) => item.placement === alignmentRequest.placement)
    if (!settings?.url) return
    if (!printTextures[settings.url]) return
    const uvZone = getUvZoneFrame(alignmentRequest.placement)
    const uvPrint = getUvFrame(alignmentRequest.placement, settings)
    const limits = uvZone && uvPrint
      ? getUvPrintMovementLimits(uvZone, uvPrint, settings.rotation, prepared.normalizer)
      : getPrintMovementLimits(getZoneFrame(alignmentRequest.placement), getFrame(alignmentRequest.placement, settings), settings.rotation, prepared.normalizer)
    handledAlignment.current = alignmentRequest.id
    onPrintMove?.(alignmentRequest.placement, limits.x * horizontal, limits.y * vertical)
  }, [alignmentRequest, config, getFrame, getUvFrame, getUvZoneFrame, getZoneFrame, onPrintMove, onPrintZoneChange, prepared.normalizer, printTextures, renderedPrints])
  const activeSettings = renderedPrints.find((item) => item.placement === activePrintPlacement)
  const activeDesignFrame = activeSettings ? getFrame(activePrintPlacement, activeSettings) : null
  const activeZoneFrame = getZoneFrame(activePrintPlacement)
  const activeUvZoneFrame = getUvZoneFrame(activePrintPlacement)
  const activeUvDesignFrame = activeSettings ? getUvFrame(activePrintPlacement, activeSettings) : null

  const eventUv = (event: ThreeEvent<PointerEvent>) => event.uv ? new THREE.Vector2(event.uv.x, event.uv.y) : null
  const isCornerHit = (point: THREE.Vector2, frame: UvSurfaceFrame) => {
    const local = uvPointToFrame(point, frame)
    return Math.hypot(Math.abs(local.x) - frame.width * 0.5, Math.abs(local.y) - frame.height * 0.5) <= 0.016
  }
  const distanceToIslandEdge = (frame: UvSurfaceFrame, direction: THREE.Vector2) => {
    let distance = Infinity
    if (direction.x > 0) distance = Math.min(distance, (frame.islandMax.x - frame.center.x) / direction.x)
    if (direction.x < 0) distance = Math.min(distance, (frame.islandMin.x - frame.center.x) / direction.x)
    if (direction.y > 0) distance = Math.min(distance, (frame.islandMax.y - frame.center.y) / direction.y)
    if (direction.y < 0) distance = Math.min(distance, (frame.islandMin.y - frame.center.y) / direction.y)
    return distance
  }
  const beginUvInteraction = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    if (!showPrintGuides || !activeUvZoneFrame) return
    const point = eventUv(event)
    if (!point || !isUvPointInIsland(point, activeUvZoneFrame)) return
    if (editorMode === 'design') {
      if (!activeSettings?.url || !activeUvDesignFrame) return
      if (isCornerHit(point, activeUvDesignFrame)) {
        const surfaceNormal = config.printZones[activePrintPlacement].uv?.surfaceNormal
        const worldCenter = surfaceNormal
          ? sampleUvSurfacePoint(prepared.clone, activeUvDesignFrame.center, new THREE.Vector3(...surfaceNormal))
          : null
        if (!worldCenter) return
        const rect = gl.domElement.getBoundingClientRect()
        const projected = worldCenter.project(camera)
        const centerX = rect.left + (projected.x + 1) * rect.width * 0.5
        const centerY = rect.top + (1 - projected.y) * rect.height * 0.5
        uvInteraction.current = {
          mode: 'designScale', placement: activePrintPlacement, centerX, centerY,
          startDistance: Math.max(8, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
          startScale: activeSettings.scale,
        }
      } else if (isUvPointInside(point, activeUvDesignFrame)) {
        const local = uvPointToFrame(point, activeUvZoneFrame)
        uvInteraction.current = {
          mode: 'designMove', placement: activePrintPlacement, zone: activeUvZoneFrame,
          startX: activeSettings.x, startY: activeSettings.y, axisLock: null,
          pointerOffset: new THREE.Vector2(
            local.x - activeSettings.x / prepared.normalizer / activeUvZoneFrame.metersPerUv,
            local.y - activeSettings.y / prepared.normalizer / activeUvZoneFrame.metersPerUv,
          ),
        }
      } else return
    } else if (isCornerHit(point, activeUvZoneFrame)) {
      const adjustment = renderedZoneAdjustments[activePrintPlacement]
      uvInteraction.current = {
        mode: 'zoneResize', placement: activePrintPlacement, frame: activeUvZoneFrame,
        baseWidth: activeUvZoneFrame.width / Math.max(adjustment.width, 0.001),
        baseHeight: activeUvZoneFrame.height / Math.max(adjustment.height, 0.001),
      }
    } else if (isUvPointInside(point, activeUvZoneFrame)) {
      const adjustment = renderedZoneAdjustments[activePrintPlacement]
      uvInteraction.current = {
        mode: 'zoneMove', placement: activePrintPlacement, frame: activeUvZoneFrame,
        startX: adjustment.x, startY: adjustment.y, axisLock: null,
        pointerOffset: point.clone().sub(activeUvZoneFrame.center),
      }
    } else return
    event.stopPropagation()
    onPrintDragState(true)
    pointerTarget(event)?.setPointerCapture?.(event.pointerId)
  }
  const moveUvInteraction = (event: ThreeEvent<PointerEvent>) => {
    const interaction = uvInteraction.current
    if (!interaction) return
    event.stopPropagation()
    if (interaction.mode === 'designScale') {
      const distance = Math.hypot(event.clientX - interaction.centerX, event.clientY - interaction.centerY)
      const nextScale = THREE.MathUtils.clamp(interaction.startScale * distance / interaction.startDistance, 0.2, 2.5)
      previewPrint(interaction.placement, { scale: nextScale })
      return
    }
    const point = eventUv(event)
    if (!point || !isUvPointInIsland(point, interaction.mode === 'designMove' ? interaction.zone : interaction.frame)) return
    if (interaction.mode === 'designMove') {
      const settings = renderedPrints.find((item) => item.placement === interaction.placement)
      const frame = settings ? getUvFrame(interaction.placement, settings) : null
      if (!settings || !frame) return
      const local = uvPointToFrame(point, interaction.zone).sub(interaction.pointerOffset)
      const limits = getUvPrintMovementLimits(interaction.zone, frame, settings.rotation, prepared.normalizer)
      let x = THREE.MathUtils.clamp(local.x * interaction.zone.metersPerUv * prepared.normalizer, -limits.x, limits.x)
      let y = THREE.MathUtils.clamp(local.y * interaction.zone.metersPerUv * prepared.normalizer, -limits.y, limits.y)
      if (event.shiftKey) {
        interaction.axisLock ??= Math.abs(x - interaction.startX) >= Math.abs(y - interaction.startY) ? 'x' : 'y'
        if (interaction.axisLock === 'x') y = interaction.startY
        else x = interaction.startX
      } else interaction.axisLock = null
      previewPrint(interaction.placement, { x, y })
      return
    }
    if (interaction.mode === 'zoneMove') {
      const desiredCenter = clampUvCenterToIsland(point.clone().sub(interaction.pointerOffset), interaction.frame)
      const uvConfig = config.printZones[interaction.placement].uv
      if (!uvConfig) return
      const delta = desiredCenter.sub(new THREE.Vector2(...uvConfig.center))
      let x = delta.dot(interaction.frame.right) * interaction.frame.metersPerUv * prepared.normalizer
      let y = delta.dot(interaction.frame.up) * interaction.frame.metersPerUv * prepared.normalizer
      if (event.shiftKey) {
        interaction.axisLock ??= Math.abs(x - interaction.startX) >= Math.abs(y - interaction.startY) ? 'x' : 'y'
        if (interaction.axisLock === 'x') y = interaction.startY
        else x = interaction.startX
      } else interaction.axisLock = null
      previewZone(interaction.placement, {
        x,
        y,
      })
      return
    }
    const local = uvPointToFrame(point, interaction.frame)
    const maxHalfWidth = Math.min(distanceToIslandEdge(interaction.frame, interaction.frame.right), distanceToIslandEdge(interaction.frame, interaction.frame.right.clone().negate()))
    const maxHalfHeight = Math.min(distanceToIslandEdge(interaction.frame, interaction.frame.up), distanceToIslandEdge(interaction.frame, interaction.frame.up.clone().negate()))
    previewZone(interaction.placement, {
      width: THREE.MathUtils.clamp(Math.abs(local.x) * 2 / interaction.baseWidth, 0.3, Math.min(1.8, maxHalfWidth * 2 / interaction.baseWidth)),
      height: THREE.MathUtils.clamp(Math.abs(local.y) * 2 / interaction.baseHeight, 0.3, Math.min(1.8, maxHalfHeight * 2 / interaction.baseHeight)),
    })
  }
  const endUvInteraction = (event: ThreeEvent<PointerEvent>) => {
    if (!uvInteraction.current) return
    event.stopPropagation()
    if (uvInteraction.current.mode === 'designMove' || uvInteraction.current.mode === 'designScale') commitPrintDraft()
    else commitZoneDraft()
    uvInteraction.current = null
    onPrintDragState(false)
    pointerTarget(event)?.releasePointerCapture?.(event.pointerId)
  }

  return <group scale={prepared.normalizer}>
    <primitive object={prepared.clone} onPointerDown={beginUvInteraction} onPointerMove={moveUvInteraction} onPointerUp={endUvInteraction} onPointerCancel={endUvInteraction} />
    <group position={prepared.clone.position}>
      {!activeUvZoneFrame && showPrintGuides && editorMode === 'zone' && <PrintZoneOverlay frame={activeZoneFrame} adjustment={renderedZoneAdjustments[activePrintPlacement]} placement={activePrintPlacement} normalizer={prepared.normalizer} onChange={previewZone} onCommit={commitZoneDraft} onDragState={onPrintDragState} />}
      {!activeUvZoneFrame && showPrintGuides && editorMode === 'design' && activeSettings?.url && activeDesignFrame && <PrintTransformOverlay frame={activeDesignFrame} settings={activeSettings} normalizer={prepared.normalizer} onMove={(placement, x, y) => previewPrint(placement, { x, y })} onScale={(placement, scale) => previewPrint(placement, { scale })} onCommit={commitPrintDraft} onDragState={onPrintDragState} />}
    </group>
  </group>
}

function FbxShirt(props: LoadedShirtProps) {
  const source = useFBX(props.config.path!)
  return <LoadedShirt {...props} source={source} />
}

function GlbShirt(props: LoadedShirtProps) {
  const asset = useGLTF(props.config.path!)
  return <LoadedShirt {...props} source={asset.scene} />
}

export function GarmentModel(props: LoadedShirtProps) {
  if (props.config.kind === 'fbx' && props.config.path) return <FbxShirt {...props} />
  if ((props.config.kind === 'glb' || props.config.kind === 'gltf') && props.config.path) return <GlbShirt {...props} />
  return <group position={props.config.transform.position} rotation={props.config.transform.rotation} scale={props.config.transform.scale}>
    <ShirtMesh {...props} />
  </group>
}
