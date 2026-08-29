import type { GarmentMotionId, LayerTransition, PrintPlacement } from '../types/studio'

export type GarmentMotionDefinition = {
  id: GarmentMotionId
  name: string
  description: string
}

export const garmentMotionDefinitions: GarmentMotionDefinition[] = [
  { id: 'turntableRight', name: 'Turntable derecha', description: 'Rotación completa, limpia y constante.' },
  { id: 'turntableLeft', name: 'Turntable izquierda', description: 'Contrarrotación para evitar una secuencia repetitiva.' },
  { id: 'whipCompanion', name: 'Whip al companion', description: 'Sostiene el estampado principal y gira velozmente al icono.' },
  { id: 'heroArc', name: 'Arco hero', description: 'Recorre dos ángulos tres cuartos con una pausa frontal.' },
  { id: 'detailPush', name: 'Acercamiento de detalle', description: 'Movimiento corto con entrada de cámara hacia el estampado.' },
  { id: 'companionReveal', name: 'Revelado del companion', description: 'Media vuelta con sobreimpulso y asentamiento sobre el icono.' },
]

export const defaultCollectionMotionIds: GarmentMotionId[] = garmentMotionDefinitions.map((motion) => motion.id)

export const collectionTransitionDefinitions: { id: Exclude<LayerTransition, 'none'>; name: string; description: string }[] = [
  { id: 'fade', name: 'Fundido', description: 'Entrada y salida suave entre tomas.' },
  { id: 'slideLeft', name: 'Barrido izquierdo', description: 'La composición entra siguiendo el sentido del montaje.' },
  { id: 'slideRight', name: 'Barrido derecho', description: 'Contrabarrido para alternar el ritmo visual.' },
  { id: 'slideUp', name: 'Elevación', description: 'La prenda aparece desde la base del encuadre.' },
  { id: 'zoom', name: 'Zoom suave', description: 'Escala cinematográfica para unir planos generales y detalles.' },
]
export const defaultCollectionTransitionIds: LayerTransition[] = ['none', ...collectionTransitionDefinitions.map((transition) => transition.id)]

export const placementFacing: Record<PrintPlacement, number> = {
  frontCenter: 0,
  frontChest: 0,
  backCenter: Math.PI,
  leftSleeve: Math.PI / 2,
  rightSleeve: -Math.PI / 2,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t) }
const smoother = (value: number) => { const t = clamp01(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const shortestAngle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

export function evaluateGarmentMotion(id: GarmentMotionId, progress: number, primary: PrintPlacement, companion: PrintPlacement) {
  const t = clamp01(progress)
  const primaryFacing = placementFacing[primary]
  const companionFacing = placementFacing[companion]
  if (id === 'turntableLeft') return { rotation: primaryFacing + .24 - smoother(t) * Math.PI * 2, cameraScale: 1 }
  if (id === 'whipCompanion') {
    const turn = smoother((t - .28) / .25)
    const delta = shortestAngle(primaryFacing, companionFacing) || Math.PI
    return { rotation: primaryFacing - .12 + delta * turn + Math.sin(turn * Math.PI) * .16, cameraScale: 1 - Math.sin(turn * Math.PI) * .06 }
  }
  if (id === 'heroArc') {
    const arc = -Math.cos(t * Math.PI) * .58
    return { rotation: primaryFacing + arc, cameraScale: .98 - Math.sin(t * Math.PI) * .08 }
  }
  if (id === 'detailPush') {
    const push = smooth(Math.min(1, t / .7))
    const settle = t > .82 ? smooth((t - .82) / .18) : 0
    return { rotation: primaryFacing - .22 + Math.sin(t * Math.PI) * .18, cameraScale: .98 - push * .34 + settle * .08 }
  }
  if (id === 'companionReveal') {
    const turn = smoother((t - .18) / .48)
    const delta = shortestAngle(primaryFacing, companionFacing) || Math.PI
    const overshoot = Math.sin(Math.min(1, turn) * Math.PI) * .24
    return { rotation: primaryFacing - .28 + delta * turn + Math.sign(delta) * overshoot, cameraScale: 1 - Math.sin(turn * Math.PI) * .09 }
  }
  return { rotation: primaryFacing - .28 + smoother(t) * Math.PI * 2, cameraScale: 1 }
}
