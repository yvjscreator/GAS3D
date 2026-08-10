import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFBX } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { PrintDecal } from './PrintDecal'
import type { GarmentModelConfig } from '../../types/garment'
import { printPlacements, type PrintPlacement, type PrintSettings, type PrintZoneAdjustment } from '../../types/studio'

type PrintSlot = {
  map: { value: THREE.Texture }; center: { value: THREE.Vector3 }; right: { value: THREE.Vector3 }
  up: { value: THREE.Vector3 }; normal: { value: THREE.Vector3 }; size: { value: THREE.Vector2 }
  depth: { value: number }; opacity: { value: number }; enabled: { value: number }
}
type ActiveZoneUniforms = {
  center: { value: THREE.Vector3 }; right: { value: THREE.Vector3 }; up: { value: THREE.Vector3 }; normal: { value: THREE.Vector3 }
  size: { value: THREE.Vector2 }; depth: { value: number }; enabled: { value: number }
}
type PrintUniforms = { slots: PrintSlot[]; active: ActiveZoneUniforms; flat: Record<string, { value: unknown }> }

function createPrintUniforms(): PrintUniforms {
  const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  empty.needsUpdate = true
  const slots = printPlacements.map((): PrintSlot => ({
    map: { value: empty }, center: { value: new THREE.Vector3() }, right: { value: new THREE.Vector3(1, 0, 0) },
    up: { value: new THREE.Vector3(0, 1, 0) }, normal: { value: new THREE.Vector3(0, 0, 1) }, size: { value: new THREE.Vector2(1, 1) },
    depth: { value: 1 }, opacity: { value: 1 }, enabled: { value: 0 },
  }))
  const active: ActiveZoneUniforms = {
    center: { value: new THREE.Vector3() }, right: { value: new THREE.Vector3(1, 0, 0) }, up: { value: new THREE.Vector3(0, 1, 0) },
    normal: { value: new THREE.Vector3(0, 0, 1) }, size: { value: new THREE.Vector2(1, 1) }, depth: { value: 1 }, enabled: { value: 1 },
  }
  const flat: Record<string, { value: unknown }> = {}
  slots.forEach((slot, index) => {
    flat[`uPrintMap${index}`] = slot.map; flat[`uPrintCenter${index}`] = slot.center; flat[`uPrintRight${index}`] = slot.right
    flat[`uPrintUp${index}`] = slot.up; flat[`uPrintNormal${index}`] = slot.normal; flat[`uPrintSize${index}`] = slot.size
    flat[`uPrintDepth${index}`] = slot.depth; flat[`uPrintOpacity${index}`] = slot.opacity; flat[`uPrintEnabled${index}`] = slot.enabled
  })
  flat.uActiveZoneCenter = active.center; flat.uActiveZoneRight = active.right; flat.uActiveZoneUp = active.up
  flat.uActiveZoneNormal = active.normal; flat.uActiveZoneSize = active.size; flat.uActiveZoneDepth = active.depth; flat.uActiveZoneEnabled = active.enabled
  return { slots, active, flat }
}

function installPrintShader(material: THREE.Material, uniforms: PrintUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms.flat)
    const declarations = uniforms.slots.map((_, index) => `
uniform sampler2D uPrintMap${index}; uniform vec3 uPrintCenter${index}; uniform vec3 uPrintRight${index};
uniform vec3 uPrintUp${index}; uniform vec3 uPrintNormal${index}; uniform vec2 uPrintSize${index};
uniform float uPrintDepth${index}; uniform float uPrintOpacity${index}; uniform float uPrintEnabled${index};`).join('')
    const applications = uniforms.slots.map((_, index) => `diffuseColor.rgb = applyGarmentPrint(diffuseColor.rgb, uPrintMap${index}, uPrintCenter${index}, uPrintRight${index}, uPrintUp${index}, uPrintNormal${index}, uPrintSize${index}, uPrintDepth${index}, uPrintOpacity${index}, uPrintEnabled${index}, vPrintPosition);`).join('\n')
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vPrintPosition;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPrintPosition = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
${declarations}
uniform vec3 uActiveZoneCenter; uniform vec3 uActiveZoneRight; uniform vec3 uActiveZoneUp; uniform vec3 uActiveZoneNormal;
uniform vec2 uActiveZoneSize; uniform float uActiveZoneDepth; uniform float uActiveZoneEnabled;
varying vec3 vPrintPosition;
vec3 applyGarmentPrint(vec3 baseColor, sampler2D printMap, vec3 printCenter, vec3 printRight, vec3 printUp, vec3 printNormal, vec2 printSize, float printDepth, float printOpacity, float printEnabled, vec3 localPosition) {
  vec3 printDelta = localPosition - printCenter;
  vec2 printUv = vec2(dot(printDelta, printRight), dot(printDelta, printUp)) / printSize + 0.5;
  float printBounds = step(0.0, printUv.x) * step(printUv.x, 1.0) * step(0.0, printUv.y) * step(printUv.y, 1.0);
  float printDepthMask = step(abs(dot(printDelta, printNormal)), printDepth * 0.5);
  vec4 printSample = texture2D(printMap, printUv);
  float printCoverage = smoothstep(0.015, 0.06, printSample.a);
  float printMask = printBounds * printDepthMask * printEnabled * printOpacity;
  float printAlpha = printCoverage * printMask;
  return baseColor * (1.0 - printAlpha) + printSample.rgb * printCoverage * printMask;
}
void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${applications}
vec3 activeZoneDelta = vPrintPosition - uActiveZoneCenter;
vec2 activeZoneUv = vec2(dot(activeZoneDelta, uActiveZoneRight), dot(activeZoneDelta, uActiveZoneUp)) / uActiveZoneSize + 0.5;
float activeZoneBounds = step(0.0, activeZoneUv.x) * step(activeZoneUv.x, 1.0) * step(0.0, activeZoneUv.y) * step(activeZoneUv.y, 1.0);
float activeZoneDepthMask = step(abs(dot(activeZoneDelta, uActiveZoneNormal)), uActiveZoneDepth * 0.5);
float activeZoneMask = activeZoneBounds * activeZoneDepthMask * uActiveZoneEnabled;
float activeZoneEdgeDistance = min(min(activeZoneUv.x, 1.0 - activeZoneUv.x), min(activeZoneUv.y, 1.0 - activeZoneUv.y));
float activeZoneBorder = (1.0 - smoothstep(0.0, 0.035, activeZoneEdgeDistance)) * activeZoneMask;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.48, 0.95), activeZoneMask * 0.16);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.72, 1.0), activeZoneBorder * 0.82);
`)
  }
  material.customProgramCacheKey = () => 'garment-multi-print-v2'
  material.needsUpdate = true
}

function createCottonMaterial(source: THREE.Material) {
  const original = source as THREE.MeshPhongMaterial
  const material = new THREE.MeshStandardMaterial({
    name: source.name,
    color: original.color?.clone() ?? new THREE.Color('#ffffff'),
    map: original.map ?? null,
    normalMap: original.normalMap ?? null,
    alphaMap: original.alphaMap ?? null,
    transparent: original.transparent,
    opacity: original.opacity,
    alphaTest: original.alphaTest,
    side: THREE.FrontSide,
    metalness: 0,
    roughness: 0.92,
    envMapIntensity: 0.08,
  })
  if (original.normalScale) material.normalScale.copy(original.normalScale).multiplyScalar(0.38)
  return material
}

type ZoneFrame = {
  baseCenter: THREE.Vector3; center: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; normal: THREE.Vector3
  width: number; height: number; depth: number; texture?: THREE.Texture
}

function PrintTransformOverlay({ frame, settings, normalizer, onScale, onDragState }: {
  frame: ZoneFrame; settings: PrintSettings; normalizer: number; onScale?: (placement: PrintPlacement, scale: number) => void; onDragState: (dragging: boolean) => void
}) {
  const resize = useRef<{ startX: number; startY: number; startScale: number; sx: number; sy: number } | null>(null)
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, -frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(-frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0),
  ]), [frame.width, frame.height])
  useEffect(() => () => geometry.dispose(), [geometry])
  const quaternion = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal)), [frame.right, frame.up, frame.normal])
  const position = frame.center.clone().addScaledVector(frame.normal, 0.035 / normalizer)
  const handleSize = 0.075 / normalizer
  const stopResize = (event: ThreeEvent<PointerEvent>) => {
    if (!resize.current) return
    event.stopPropagation(); resize.current = null; onDragState(false)
    ;(event.target as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
  }
  return <group position={position} quaternion={quaternion} renderOrder={20}>
    <lineSegments geometry={geometry} renderOrder={20}><lineBasicMaterial color="#8ec5ff" transparent opacity={0.95} depthTest={false} toneMapped={false} /></lineSegments>
    {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy], index) => <mesh key={index}
      position={[sx * frame.width / 2, sy * frame.height / 2, 0]} renderOrder={21}
      onPointerDown={(event) => { event.stopPropagation(); resize.current = { startX: event.clientX, startY: event.clientY, startScale: settings.scale, sx, sy }; onDragState(true); (event.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId) }}
      onPointerMove={(event) => { if (!resize.current) return; event.stopPropagation(); const state = resize.current; const change = ((event.clientX - state.startX) * state.sx - (event.clientY - state.startY) * state.sy) * 0.004; onScale?.(settings.placement, THREE.MathUtils.clamp(state.startScale + change, 0.2, 2.5)) }}
      onPointerUp={stopResize} onPointerCancel={stopResize}>
      <circleGeometry args={[handleSize, 18]} />
      <meshBasicMaterial color="#eaf5ff" depthTest={false} toneMapped={false} />
    </mesh>)}
  </group>
}

function ZoneEditOverlay({ frame, adjustment, placement, normalizer, onChange, onSurfaceMove, onTouch, onDragState }: {
  frame: ZoneFrame; adjustment: PrintZoneAdjustment; placement: PrintPlacement; normalizer: number
  onChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void
  onSurfaceMove?: (event: ThreeEvent<PointerEvent>) => void
  onTouch: (active: boolean) => void; onDragState: (dragging: boolean) => void
}) {
  const interaction = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; x: number; y: number; width: number; height: number; sx: number; sy: number } | null>(null)
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, -frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(-frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0),
  ]), [frame.width, frame.height])
  useEffect(() => () => geometry.dispose(), [geometry])
  const quaternion = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal)), [frame.right, frame.up, frame.normal])
  const position = frame.center.clone().addScaledVector(frame.normal, 0.04 / normalizer)
  const handleSize = 0.085 / normalizer
  const begin = (event: ThreeEvent<PointerEvent>, mode: 'move' | 'resize', sx = 0, sy = 0) => {
    event.stopPropagation(); interaction.current = { mode, startX: event.clientX, startY: event.clientY, x: adjustment.x, y: adjustment.y, width: adjustment.width, height: adjustment.height, sx, sy }
    onTouch(true); onDragState(true); (event.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const state = interaction.current; if (!state) return; event.stopPropagation()
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY
    if (state.mode === 'move') onSurfaceMove?.(event)
    else onChange?.(placement, { width: THREE.MathUtils.clamp(state.width + dx * state.sx * 0.004, 0.4, 1.8), height: THREE.MathUtils.clamp(state.height - dy * state.sy * 0.004, 0.4, 1.8) })
  }
  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!interaction.current) return; event.stopPropagation(); interaction.current = null; onDragState(false); onTouch(false)
    ;(event.target as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
  }
  return <group position={position} quaternion={quaternion} renderOrder={30}>
    <mesh renderOrder={29} onPointerOver={() => onTouch(true)} onPointerOut={() => { if (!interaction.current) onTouch(false) }} onPointerDown={(event) => begin(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <planeGeometry args={[frame.width, frame.height]} /><meshBasicMaterial color="#3897ff" transparent opacity={0.035} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
    <lineSegments geometry={geometry} renderOrder={30}><lineBasicMaterial color="#43a3ff" transparent opacity={1} depthTest={false} toneMapped={false} /></lineSegments>
    {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy], index) => <mesh key={index} position={[sx * frame.width / 2, sy * frame.height / 2, 0.01]} renderOrder={31}
      onPointerOver={() => onTouch(true)} onPointerOut={() => { if (!interaction.current) onTouch(false) }} onPointerDown={(event) => begin(event, 'resize', sx, sy)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <circleGeometry args={[handleSize, 18]} /><meshBasicMaterial color="#43a3ff" depthTest={false} toneMapped={false} />
    </mesh>)}
  </group>
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
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, envMapIntensity: 0.15 }), [])
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

function FbxShirt({ color, config, prints, printZoneAdjustments, activePrintPlacement, zoneEditMode, onPrintMove, onPrintScale, onPrintZoneChange, showPrintGuides, onPrintDragState }: {
  color: string; config: GarmentModelConfig; prints: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; zoneEditMode: boolean
  onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void
  onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides: boolean; onPrintDragState: (dragging: boolean) => void
}) {
  const source = useFBX(config.path!)
  const printUniforms = useMemo(createPrintUniforms, [])
  const textureLoader = useMemo(() => new THREE.TextureLoader(), [])
  const [printTextures, setPrintTextures] = useState<Partial<Record<PrintPlacement, THREE.Texture>>>({})
  const drag = useRef<{ placement: PrintPlacement; offsetX: number; offsetY: number } | null>(null)
  const [zoneTouched, setZoneTouched] = useState(false)
  const prepared = useMemo(() => {
    const clone = source.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const normalizer = 4.5 / Math.max(size.x, size.y, size.z)
    let largest: THREE.Mesh | null = null; let vertices = 0
    clone.traverse((item) => {
      if (!('isMesh' in item) || !item.isMesh) return
      const mesh = item as THREE.Mesh
      mesh.castShadow = false; mesh.receiveShadow = false
      const count = mesh.geometry.getAttribute('position')?.count ?? 0
      if (count > vertices) { vertices = count; largest = mesh }
      const wasArray = Array.isArray(mesh.material)
      const originalMaterials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const materials = originalMaterials.map(createCottonMaterial)
      materials.forEach((material) => { material.side = THREE.FrontSide; installPrintShader(material, printUniforms) })
      mesh.material = wasArray ? materials : materials[0]
    })
    clone.position.sub(center)
    return { clone, center, normalizer, mesh: largest as THREE.Mesh | null }
  }, [source, printUniforms])
  useEffect(() => {
    const mesh = prepared.mesh
    if (!mesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      if ('color' in material && material.color instanceof THREE.Color) material.color.set(color)
      if ('metalness' in material) material.metalness = 0
      if ('roughness' in material) material.roughness = 0.92
      material.needsUpdate = true
    })
  }, [color, prepared])
  const printUrlKey = prints.map((print) => `${print.placement}:${print.url ?? ''}`).join('|')
  useEffect(() => {
    let active = true
    const loadedTextures: THREE.Texture[] = []
    setPrintTextures({})
    prints.forEach((print) => {
      if (!print.url) return
      textureLoader.load(print.url, (loaded) => {
        if (!active) { loaded.dispose(); return }
        loaded.colorSpace = THREE.SRGBColorSpace; loaded.premultiplyAlpha = true; loaded.generateMipmaps = false
        loaded.minFilter = THREE.LinearFilter; loaded.magFilter = THREE.LinearFilter
        loaded.wrapS = THREE.ClampToEdgeWrapping; loaded.wrapT = THREE.ClampToEdgeWrapping; loaded.needsUpdate = true
        loadedTextures.push(loaded)
        setPrintTextures((current) => ({ ...current, [print.placement]: loaded }))
      })
    })
    return () => { active = false; loadedTextures.forEach((texture) => texture.dispose()) }
  // URLs are the only values that require reloading image data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printUrlKey, textureLoader])

  const getFrame = (placement: PrintPlacement, settings: PrintSettings) => {
    const zone = config.printZones[placement]
    const adjustment = printZoneAdjustments[placement]
    const center = new THREE.Vector3(zone.position[0] / prepared.normalizer + prepared.center.x, zone.position[1] / prepared.normalizer + prepared.center.y, zone.position[2] / prepared.normalizer + prepared.center.z)
    const baseEuler = new THREE.Euler(...zone.rotation), orientationEuler = new THREE.Euler(...(adjustment.rotation ?? zone.rotation))
    const baseRight = new THREE.Vector3(1, 0, 0).applyEuler(baseEuler), baseUp = new THREE.Vector3(0, 1, 0).applyEuler(baseEuler), baseNormal = new THREE.Vector3(0, 0, 1).applyEuler(baseEuler)
    const orientationRight = new THREE.Vector3(1, 0, 0).applyEuler(orientationEuler), orientationUp = new THREE.Vector3(0, 1, 0).applyEuler(orientationEuler)
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(orientationEuler)
    const angle = THREE.MathUtils.degToRad(settings.rotation), cos = Math.cos(angle), sin = Math.sin(angle)
    const right = orientationRight.clone().multiplyScalar(cos).addScaledVector(orientationUp, sin).normalize()
    const up = orientationUp.clone().multiplyScalar(cos).addScaledVector(orientationRight, -sin).normalize()
    center.addScaledVector(baseRight, adjustment.x / prepared.normalizer).addScaledVector(baseUp, adjustment.y / prepared.normalizer).addScaledVector(baseNormal, (adjustment.z ?? 0) / prepared.normalizer)
    const baseCenter = center.clone()
    center.addScaledVector(right, settings.x / prepared.normalizer).addScaledVector(up, settings.y / prepared.normalizer)
    const texture = printTextures[placement]
    const aspect = texture?.image ? texture.image.width / Math.max(texture.image.height, 1) : 1
    const width = zone.scale[0] * adjustment.width * settings.scale / prepared.normalizer
    return { zone, baseCenter, center, right, up, normal, width, height: width / Math.max(aspect, 0.1), depth: zone.scale[2] * 2.4 / prepared.normalizer, texture }
  }
  const getZoneFrame = (placement: PrintPlacement): ZoneFrame => {
    const zone = config.printZones[placement], adjustment = printZoneAdjustments[placement]
    const baseEuler = new THREE.Euler(...zone.rotation), orientationEuler = new THREE.Euler(...(adjustment.rotation ?? zone.rotation))
    const baseRight = new THREE.Vector3(1, 0, 0).applyEuler(baseEuler), baseUp = new THREE.Vector3(0, 1, 0).applyEuler(baseEuler), baseNormal = new THREE.Vector3(0, 0, 1).applyEuler(baseEuler)
    const right = new THREE.Vector3(1, 0, 0).applyEuler(orientationEuler), up = new THREE.Vector3(0, 1, 0).applyEuler(orientationEuler), normal = new THREE.Vector3(0, 0, 1).applyEuler(orientationEuler)
    const center = new THREE.Vector3(zone.position[0] / prepared.normalizer + prepared.center.x, zone.position[1] / prepared.normalizer + prepared.center.y, zone.position[2] / prepared.normalizer + prepared.center.z)
      .addScaledVector(baseRight, adjustment.x / prepared.normalizer).addScaledVector(baseUp, adjustment.y / prepared.normalizer).addScaledVector(baseNormal, (adjustment.z ?? 0) / prepared.normalizer)
    return { baseCenter: center.clone(), center, right, up, normal, width: zone.scale[0] * adjustment.width / prepared.normalizer, height: zone.scale[1] * adjustment.height / prepared.normalizer, depth: zone.scale[2] * 2.1 / prepared.normalizer }
  }

  useEffect(() => {
    printPlacements.forEach((placement, index) => {
      const slot = printUniforms.slots[index]
      const settings = prints.find((item) => item.placement === placement)
      if (!settings) { slot.enabled.value = 0; return }
      const frame = getFrame(placement, settings)
      slot.map.value = frame.texture ?? slot.map.value; slot.center.value.copy(frame.center)
      slot.right.value.copy(frame.right); slot.up.value.copy(frame.up); slot.normal.value.copy(frame.normal)
      slot.size.value.set(frame.width, frame.height); slot.depth.value = frame.depth
      slot.opacity.value = 0.88 + settings.integration * 0.0012
      slot.enabled.value = settings.url && frame.texture ? 1 : 0
    })
    const activeFrame = getZoneFrame(activePrintPlacement)
    printUniforms.active.center.value.copy(activeFrame.center)
    printUniforms.active.right.value.copy(activeFrame.right); printUniforms.active.up.value.copy(activeFrame.up); printUniforms.active.normal.value.copy(activeFrame.normal)
    printUniforms.active.size.value.set(activeFrame.width, activeFrame.height); printUniforms.active.depth.value = activeFrame.depth
    printUniforms.active.enabled.value = showPrintGuides && zoneEditMode && zoneTouched ? 1 : 0
  }, [prints, printTextures, printUniforms, printZoneAdjustments, activePrintPlacement, showPrintGuides, zoneEditMode, zoneTouched])

  const localPoint = (event: ThreeEvent<PointerEvent>) => prepared.mesh?.worldToLocal(event.point.clone()) ?? null
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (zoneEditMode) return
    const settings = prints.find((item) => item.placement === activePrintPlacement)
    const point = localPoint(event)
    if (!settings?.url || !point) return
    const frame = getFrame(activePrintPlacement, settings)
    const delta = point.clone().sub(frame.center)
    const px = delta.dot(frame.right), py = delta.dot(frame.up), pz = Math.abs(delta.dot(frame.normal))
    if (Math.abs(px) > frame.width / 2 || Math.abs(py) > frame.height / 2 || pz > frame.depth / 2) return
    event.stopPropagation()
    drag.current = { placement: activePrintPlacement, offsetX: px * prepared.normalizer, offsetY: py * prepared.normalizer }
    onPrintDragState(true)
    ;(event.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId)
  }
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    const settings = prints.find((item) => item.placement === drag.current?.placement)
    const point = localPoint(event)
    if (!settings || !point) return
    event.stopPropagation()
    const frame = getFrame(drag.current.placement, settings)
    const fromBase = point.sub(frame.baseCenter)
    const limitX = drag.current.placement.includes('Sleeve') ? 0.45 : 0.85
    const x = THREE.MathUtils.clamp(fromBase.dot(frame.right) * prepared.normalizer - drag.current.offsetX, -limitX, limitX)
    const y = THREE.MathUtils.clamp(fromBase.dot(frame.up) * prepared.normalizer - drag.current.offsetY, -0.9, 0.9)
    onPrintMove?.(drag.current.placement, x, y)
  }
  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    event.stopPropagation(); drag.current = null; onPrintDragState(false)
    ;(event.target as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
  }
  const moveActiveZoneToSurface = (event: ThreeEvent<PointerEvent>) => {
    const mesh = prepared.mesh
    if (!mesh) return
    const hit = event.intersections.find((intersection) => intersection.object === mesh)
    if (!hit?.face) return
    const local = mesh.worldToLocal(hit.point.clone())
    const normal = hit.face.normal.clone().normalize()
    const normalWorld = normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
    if (normalWorld.dot(event.ray.direction) > 0) normal.negate()
    let right = new THREE.Vector3(0, 1, 0).cross(normal)
    if (right.lengthSq() < 0.001) right = new THREE.Vector3(1, 0, 0)
    right.normalize()
    const up = normal.clone().cross(right).normalize()
    const rotation = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal), 'XYZ')
    const zone = config.printZones[activePrintPlacement]
    const baseEuler = new THREE.Euler(...zone.rotation)
    const baseRight = new THREE.Vector3(1, 0, 0).applyEuler(baseEuler), baseUp = new THREE.Vector3(0, 1, 0).applyEuler(baseEuler), baseNormal = new THREE.Vector3(0, 0, 1).applyEuler(baseEuler)
    const baseCenter = new THREE.Vector3(zone.position[0] / prepared.normalizer + prepared.center.x, zone.position[1] / prepared.normalizer + prepared.center.y, zone.position[2] / prepared.normalizer + prepared.center.z)
    const delta = local.sub(baseCenter)
    onPrintZoneChange?.(activePrintPlacement, {
      x: delta.dot(baseRight) * prepared.normalizer,
      y: delta.dot(baseUp) * prepared.normalizer,
      z: delta.dot(baseNormal) * prepared.normalizer,
      rotation: [rotation.x, rotation.y, rotation.z],
    })
  }
  const activeSettings = prints.find((item) => item.placement === activePrintPlacement)
  const activeDesignFrame = activeSettings ? getFrame(activePrintPlacement, activeSettings) : null
  const activeZoneFrame = getZoneFrame(activePrintPlacement)
  return <group scale={prepared.normalizer}>
    <primitive object={prepared.clone} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
    <group position={prepared.clone.position}>
      {showPrintGuides && zoneEditMode && <ZoneEditOverlay frame={activeZoneFrame} adjustment={printZoneAdjustments[activePrintPlacement]} placement={activePrintPlacement} normalizer={prepared.normalizer} onChange={onPrintZoneChange} onSurfaceMove={moveActiveZoneToSurface} onTouch={setZoneTouched} onDragState={onPrintDragState} />}
      {showPrintGuides && !zoneEditMode && activeSettings?.url && activeDesignFrame && <PrintTransformOverlay frame={activeDesignFrame} settings={activeSettings} normalizer={prepared.normalizer} onScale={onPrintScale} onDragState={onPrintDragState} />}
    </group>
  </group>
}

export function GarmentModel(props: { color: string; config: GarmentModelConfig; prints: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; zoneEditMode: boolean; onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void; onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides: boolean; onPrintDragState: (dragging: boolean) => void }) {
  if (props.config.kind === 'fbx' && props.config.path) return <FbxShirt {...props} />
  return <group position={props.config.transform.position} rotation={props.config.transform.rotation} scale={props.config.transform.scale}>
    <ShirtMesh {...props} />
  </group>
}
