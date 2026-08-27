import * as THREE from 'three'
import { printPlacements } from '../../../types/studio'

type PrintSlot = {
  map: { value: THREE.Texture }; center: { value: THREE.Vector3 }; right: { value: THREE.Vector3 }
  up: { value: THREE.Vector3 }; normal: { value: THREE.Vector3 }; size: { value: THREE.Vector2 }
  depth: { value: number }; opacity: { value: number }; enabled: { value: number }
  uvCenter: { value: THREE.Vector2 }; uvRight: { value: THREE.Vector2 }; uvUp: { value: THREE.Vector2 }; uvSize: { value: THREE.Vector2 }; uvMode: { value: number }
  uvZoneCenter: { value: THREE.Vector2 }; uvZoneRight: { value: THREE.Vector2 }; uvZoneUp: { value: THREE.Vector2 }; uvZoneSize: { value: THREE.Vector2 }
}
type ActiveFrameUniforms = {
  center: { value: THREE.Vector3 }; right: { value: THREE.Vector3 }; up: { value: THREE.Vector3 }; normal: { value: THREE.Vector3 }
  size: { value: THREE.Vector2 }; depth: { value: number }; enabled: { value: number }; fill: { value: number }
  uvCenter: { value: THREE.Vector2 }; uvRight: { value: THREE.Vector2 }; uvUp: { value: THREE.Vector2 }; uvSize: { value: THREE.Vector2 }; uvMode: { value: number }; handleRadius: { value: number }
}
type AmbilightUniforms = { color: { value: THREE.Color }; strength: { value: number }; reach: { value: number } }
export type GarmentPrintUniforms = { slots: PrintSlot[]; active: ActiveFrameUniforms; ambilight: AmbilightUniforms; flat: Record<string, { value: unknown }> }

export function createGarmentPrintUniforms(): GarmentPrintUniforms {
  const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  empty.needsUpdate = true
  const slots = printPlacements.map((): PrintSlot => ({
    map: { value: empty }, center: { value: new THREE.Vector3() }, right: { value: new THREE.Vector3(1, 0, 0) },
    up: { value: new THREE.Vector3(0, 1, 0) }, normal: { value: new THREE.Vector3(0, 0, 1) }, size: { value: new THREE.Vector2(1, 1) },
    depth: { value: 1 }, opacity: { value: 1 }, enabled: { value: 0 },
    uvCenter: { value: new THREE.Vector2() }, uvRight: { value: new THREE.Vector2(1, 0) }, uvUp: { value: new THREE.Vector2(0, 1) }, uvSize: { value: new THREE.Vector2(1, 1) }, uvMode: { value: 0 },
    uvZoneCenter: { value: new THREE.Vector2() }, uvZoneRight: { value: new THREE.Vector2(1, 0) }, uvZoneUp: { value: new THREE.Vector2(0, 1) }, uvZoneSize: { value: new THREE.Vector2(1, 1) },
  }))
  const active: ActiveFrameUniforms = {
    center: { value: new THREE.Vector3() }, right: { value: new THREE.Vector3(1, 0, 0) }, up: { value: new THREE.Vector3(0, 1, 0) },
    normal: { value: new THREE.Vector3(0, 0, 1) }, size: { value: new THREE.Vector2(1, 1) }, depth: { value: 1 }, enabled: { value: 1 }, fill: { value: 1 },
    uvCenter: { value: new THREE.Vector2() }, uvRight: { value: new THREE.Vector2(1, 0) }, uvUp: { value: new THREE.Vector2(0, 1) }, uvSize: { value: new THREE.Vector2(1, 1) }, uvMode: { value: 0 }, handleRadius: { value: 0.008 },
  }
  const ambilight: AmbilightUniforms = { color: { value: new THREE.Color('#000000') }, strength: { value: 0 }, reach: { value: 0.55 } }
  const flat: Record<string, { value: unknown }> = {}
  slots.forEach((slot, index) => {
    flat[`uPrintMap${index}`] = slot.map; flat[`uPrintCenter${index}`] = slot.center; flat[`uPrintRight${index}`] = slot.right
    flat[`uPrintUp${index}`] = slot.up; flat[`uPrintNormal${index}`] = slot.normal; flat[`uPrintSize${index}`] = slot.size
    flat[`uPrintDepth${index}`] = slot.depth; flat[`uPrintOpacity${index}`] = slot.opacity; flat[`uPrintEnabled${index}`] = slot.enabled
    flat[`uPrintUvCenter${index}`] = slot.uvCenter; flat[`uPrintUvRight${index}`] = slot.uvRight; flat[`uPrintUvUp${index}`] = slot.uvUp
    flat[`uPrintUvSize${index}`] = slot.uvSize; flat[`uPrintUvMode${index}`] = slot.uvMode
    flat[`uPrintUvZoneCenter${index}`] = slot.uvZoneCenter; flat[`uPrintUvZoneRight${index}`] = slot.uvZoneRight
    flat[`uPrintUvZoneUp${index}`] = slot.uvZoneUp; flat[`uPrintUvZoneSize${index}`] = slot.uvZoneSize
  })
  flat.uActiveZoneCenter = active.center; flat.uActiveZoneRight = active.right; flat.uActiveZoneUp = active.up
  flat.uActiveZoneNormal = active.normal; flat.uActiveZoneSize = active.size; flat.uActiveZoneDepth = active.depth
  flat.uActiveZoneEnabled = active.enabled; flat.uActiveZoneFill = active.fill
  flat.uActiveUvCenter = active.uvCenter; flat.uActiveUvRight = active.uvRight; flat.uActiveUvUp = active.uvUp
  flat.uActiveUvSize = active.uvSize; flat.uActiveUvMode = active.uvMode; flat.uActiveHandleRadius = active.handleRadius
  flat.uGarmentAmbilightColor = ambilight.color; flat.uGarmentAmbilightStrength = ambilight.strength
  flat.uGarmentAmbilightReach = ambilight.reach
  return { slots, active, ambilight, flat }
}

export function installGarmentPrintShader(material: THREE.Material, uniforms: GarmentPrintUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms.flat)
    const declarations = uniforms.slots.map((_, index) => `
uniform sampler2D uPrintMap${index}; uniform vec3 uPrintCenter${index}; uniform vec3 uPrintRight${index};
uniform vec3 uPrintUp${index}; uniform vec3 uPrintNormal${index}; uniform vec2 uPrintSize${index};
uniform float uPrintDepth${index}; uniform float uPrintOpacity${index}; uniform float uPrintEnabled${index};
uniform vec2 uPrintUvCenter${index}; uniform vec2 uPrintUvRight${index}; uniform vec2 uPrintUvUp${index}; uniform vec2 uPrintUvSize${index}; uniform float uPrintUvMode${index};
uniform vec2 uPrintUvZoneCenter${index}; uniform vec2 uPrintUvZoneRight${index}; uniform vec2 uPrintUvZoneUp${index}; uniform vec2 uPrintUvZoneSize${index};`).join('')
    const applications = uniforms.slots.map((_, index) => `diffuseColor.rgb = applyGarmentPrint(diffuseColor.rgb, uPrintMap${index}, uPrintCenter${index}, uPrintRight${index}, uPrintUp${index}, uPrintNormal${index}, uPrintSize${index}, uPrintDepth${index}, uPrintOpacity${index}, uPrintEnabled${index}, uPrintUvCenter${index}, uPrintUvRight${index}, uPrintUvUp${index}, uPrintUvSize${index}, uPrintUvMode${index}, uPrintUvZoneCenter${index}, uPrintUvZoneRight${index}, uPrintUvZoneUp${index}, uPrintUvZoneSize${index}, vPrintPosition, vGarmentUv, garmentPrintColor, garmentPrintCoverage);`).join('\n')
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vPrintPosition;\nvarying vec2 vGarmentUv;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPrintPosition = position;\n vGarmentUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
${declarations}
uniform vec3 uActiveZoneCenter; uniform vec3 uActiveZoneRight; uniform vec3 uActiveZoneUp; uniform vec3 uActiveZoneNormal;
uniform vec2 uActiveZoneSize; uniform float uActiveZoneDepth; uniform float uActiveZoneEnabled; uniform float uActiveZoneFill;
uniform vec2 uActiveUvCenter; uniform vec2 uActiveUvRight; uniform vec2 uActiveUvUp; uniform vec2 uActiveUvSize;
uniform float uActiveUvMode; uniform float uActiveHandleRadius;
uniform vec3 uGarmentAmbilightColor; uniform float uGarmentAmbilightStrength; uniform float uGarmentAmbilightReach;
varying vec3 vPrintPosition;
varying vec2 vGarmentUv;
vec3 applyGarmentPrint(vec3 baseColor, sampler2D printMap, vec3 printCenter, vec3 printRight, vec3 printUp, vec3 printNormal, vec2 printSize, float printDepth, float printOpacity, float printEnabled, vec2 uvCenter, vec2 uvRight, vec2 uvUp, vec2 uvSize, float uvMode, vec2 uvZoneCenter, vec2 uvZoneRight, vec2 uvZoneUp, vec2 uvZoneSize, vec3 localPosition, vec2 garmentUv, inout vec3 accumulatedPrintColor, inout float accumulatedPrintCoverage) {
  vec3 printDelta = localPosition - printCenter;
  vec2 projectedUv = vec2(dot(printDelta, printRight), dot(printDelta, printUp)) / printSize + 0.5;
  vec2 uvDelta = garmentUv - uvCenter;
  vec2 surfaceUv = vec2(dot(uvDelta, uvRight), dot(uvDelta, uvUp)) / uvSize + 0.5;
  vec2 printUv = mix(projectedUv, surfaceUv, step(0.5, uvMode));
  float printBounds = step(0.0, printUv.x) * step(printUv.x, 1.0) * step(0.0, printUv.y) * step(printUv.y, 1.0);
  vec2 zoneDelta = garmentUv - uvZoneCenter;
  vec2 zoneUv = vec2(dot(zoneDelta, uvZoneRight), dot(zoneDelta, uvZoneUp)) / uvZoneSize + 0.5;
  float zoneBounds = step(0.0, zoneUv.x) * step(zoneUv.x, 1.0) * step(0.0, zoneUv.y) * step(zoneUv.y, 1.0);
  printBounds *= mix(1.0, zoneBounds, step(0.5, uvMode));
  float printDepthMask = mix(step(abs(dot(printDelta, printNormal)), printDepth * 0.5), 1.0, step(0.5, uvMode));
  vec4 printSample = texture2D(printMap, printUv);
  // Maps arrive premultiplied so their transparent RGB cannot contaminate
  // minified edges. Restore straight color before applying alpha exactly once.
  vec3 printColor = printSample.a > 0.0001 ? clamp(printSample.rgb / printSample.a, 0.0, 1.0) : vec3(0.0);
  float printAlpha = printSample.a * printBounds * printDepthMask * printEnabled * printOpacity;
  float combinedCoverage = printAlpha + accumulatedPrintCoverage * (1.0 - printAlpha);
  if (combinedCoverage > 0.0001) {
    accumulatedPrintColor = (printColor * printAlpha + accumulatedPrintColor * accumulatedPrintCoverage * (1.0 - printAlpha)) / combinedCoverage;
  }
  accumulatedPrintCoverage = combinedCoverage;
  return mix(baseColor, printColor, printAlpha);
}
void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 garmentPrintColor = vec3(0.0);
float garmentPrintCoverage = 0.0;
${applications}
vec3 activeZoneDelta = vPrintPosition - uActiveZoneCenter;
vec2 activeProjectedUv = vec2(dot(activeZoneDelta, uActiveZoneRight), dot(activeZoneDelta, uActiveZoneUp)) / uActiveZoneSize + 0.5;
vec2 activeUvDelta = vGarmentUv - uActiveUvCenter;
vec2 activeSurfaceLocal = vec2(dot(activeUvDelta, uActiveUvRight), dot(activeUvDelta, uActiveUvUp));
vec2 activeSurfaceUv = activeSurfaceLocal / uActiveUvSize + 0.5;
vec2 activeZoneUv = mix(activeProjectedUv, activeSurfaceUv, step(0.5, uActiveUvMode));
float activeZoneBounds = step(0.0, activeZoneUv.x) * step(activeZoneUv.x, 1.0) * step(0.0, activeZoneUv.y) * step(activeZoneUv.y, 1.0);
float activeZoneDepthMask = mix(step(abs(dot(activeZoneDelta, uActiveZoneNormal)), uActiveZoneDepth * 0.5), 1.0, step(0.5, uActiveUvMode));
float activeZoneMask = activeZoneBounds * activeZoneDepthMask * uActiveZoneEnabled;
float activeZoneEdgeDistance = min(min(activeZoneUv.x, 1.0 - activeZoneUv.x), min(activeZoneUv.y, 1.0 - activeZoneUv.y));
float activeZoneBorder = (1.0 - smoothstep(0.0, 0.035, activeZoneEdgeDistance)) * activeZoneMask;
vec2 activeHalfSize = uActiveUvSize * 0.5;
float activeHandleDistance = min(min(
  distance(activeSurfaceLocal, vec2(-activeHalfSize.x, -activeHalfSize.y)),
  distance(activeSurfaceLocal, vec2(activeHalfSize.x, -activeHalfSize.y))), min(
  distance(activeSurfaceLocal, vec2(activeHalfSize.x, activeHalfSize.y)),
  distance(activeSurfaceLocal, vec2(-activeHalfSize.x, activeHalfSize.y))));
float activeHandles = (1.0 - smoothstep(uActiveHandleRadius * 0.72, uActiveHandleRadius, activeHandleDistance)) * uActiveZoneEnabled * step(0.5, uActiveUvMode);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.48, 0.95), activeZoneMask * 0.16 * uActiveZoneFill);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.72, 1.0), activeZoneBorder * 0.82);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.60, 1.0), activeHandles * 0.96);
`)
      .replace('#include <opaque_fragment>', `
// Cloth lighting may darken the ink, but it must never brighten the uploaded artwork.
// This keeps neutral gray brushwork from turning into a white halo under studio lights.
outgoingLight = mix(outgoingLight, min(outgoingLight, garmentPrintColor), garmentPrintCoverage);
// Alternative Ambilight path: tint the complete shaded material, independent of UVs.
float garmentAmbilightEdge = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
float garmentAmbilightThreshold = mix(0.78, 0.02, uGarmentAmbilightReach);
float garmentAmbilightMask = smoothstep(garmentAmbilightThreshold, min(1.0, garmentAmbilightThreshold + 0.20), garmentAmbilightEdge);
garmentAmbilightMask = mix(garmentAmbilightMask, 1.0, smoothstep(0.82, 1.0, uGarmentAmbilightReach));
float garmentAmbilightRim = pow(garmentAmbilightEdge, 2.0);
vec3 garmentAmbilightResult = outgoingLight * (vec3(0.58) + uGarmentAmbilightColor * 1.25)
  + uGarmentAmbilightColor * (0.055 + garmentAmbilightRim * 0.14);
outgoingLight = mix(outgoingLight, garmentAmbilightResult, uGarmentAmbilightStrength * garmentAmbilightMask);
#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'garment-multi-print-v7-ambilight-reach'
  material.needsUpdate = true
}

export function createCottonMaterial(source: THREE.Material) {
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
