import type { GarmentMotionId, LayerTransition, PrintPlacement } from '../types/studio'
import type { ShotTimingFrame } from '../utils/shotTiming'

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

const lerp = (from: number, to: number, amount: number) => from + (to - from) * clamp01(amount)

function phaseValue(timing: ShotTimingFrame, phase: ShotTimingFrame['phase']) {
  const order = { hold: 0, prepare: 1, transition: 2, settle: 3 } as const
  if (order[timing.phase] > order[phase]) return 1
  if (timing.phase !== phase) return 0
  return smooth(timing.local)
}

export function evaluateGarmentMotion(id: GarmentMotionId, timing: ShotTimingFrame, primary: PrintPlacement, companion: PrintPlacement) {
  const hold = phaseValue(timing, 'hold')
  const prepare = phaseValue(timing, 'prepare')
  const transition = phaseValue(timing, 'transition')
  const settle = phaseValue(timing, 'settle')
  const primaryFacing = placementFacing[primary]
  const companionFacing = placementFacing[companion]
  const delta = shortestAngle(primaryFacing, companionFacing) || Math.PI

  if (id === 'whipCompanion') {
    if (timing.phase === 'hold') return { rotation: primaryFacing + lerp(-.035, .035, hold), cameraScale: lerp(1, .985, hold) }
    if (timing.phase === 'prepare') return { rotation: primaryFacing + lerp(.035, -.1, prepare), cameraScale: lerp(.985, 1.015, prepare) }
    if (timing.phase === 'transition') {
      const overshoot = Math.sin(transition * Math.PI) * .16
      return { rotation: primaryFacing - .1 + delta * transition + Math.sign(delta) * overshoot, cameraScale: 1.015 - Math.sin(transition * Math.PI) * .07 }
    }
    return { rotation: primaryFacing + delta + lerp(Math.sign(delta) * .05, 0, settle), cameraScale: lerp(.985, 1, settle) }
  }

  if (id === 'companionReveal') {
    if (timing.phase === 'hold') return { rotation: primaryFacing + lerp(-.06, .045, hold), cameraScale: lerp(1, .98, hold) }
    if (timing.phase === 'prepare') return { rotation: primaryFacing + lerp(.045, -.16, prepare), cameraScale: lerp(.98, 1.02, prepare) }
    if (timing.phase === 'transition') {
      const overshoot = Math.sin(transition * Math.PI) * .24
      return { rotation: primaryFacing - .16 + delta * transition + Math.sign(delta) * overshoot, cameraScale: 1.02 - Math.sin(transition * Math.PI) * .1 }
    }
    return { rotation: primaryFacing + delta + lerp(Math.sign(delta) * .08, 0, settle), cameraScale: lerp(.96, 1, settle) }
  }

  if (id === 'heroArc') {
    if (timing.phase === 'hold') return { rotation: primaryFacing + lerp(-.14, .1, hold), cameraScale: lerp(.99, .965, hold) }
    if (timing.phase === 'prepare') return { rotation: primaryFacing + lerp(.1, .16, prepare), cameraScale: lerp(.965, .95, prepare) }
    if (timing.phase === 'transition') return { rotation: primaryFacing + lerp(.16, .58, transition), cameraScale: lerp(.95, .9, Math.sin(transition * Math.PI)) }
    return { rotation: primaryFacing + lerp(.58, .5, settle), cameraScale: lerp(.95, .98, settle) }
  }

  if (id === 'detailPush') {
    if (timing.phase === 'hold') return { rotation: primaryFacing + lerp(-.08, .04, hold), cameraScale: lerp(.98, .94, hold) }
    if (timing.phase === 'prepare') return { rotation: primaryFacing + lerp(.04, -.06, prepare), cameraScale: lerp(.94, .9, prepare) }
    if (timing.phase === 'transition') return { rotation: primaryFacing + lerp(-.06, .12, transition), cameraScale: lerp(.9, .66, transition) }
    return { rotation: primaryFacing + lerp(.12, .08, settle), cameraScale: lerp(.66, .72, settle) }
  }

  const direction = id === 'turntableLeft' ? -1 : 1
  if (timing.phase === 'hold') return { rotation: primaryFacing + direction * lerp(-.07, .07, hold), cameraScale: lerp(1, .985, hold) }
  if (timing.phase === 'prepare') return { rotation: primaryFacing + direction * lerp(.07, .16, prepare), cameraScale: lerp(.985, .97, prepare) }
  if (timing.phase === 'transition') return { rotation: primaryFacing + direction * lerp(.16, Math.PI * 2 - .08, smoother(transition)), cameraScale: .97 - Math.sin(transition * Math.PI) * .05 }
  return { rotation: primaryFacing + direction * lerp(Math.PI * 2 - .08, Math.PI * 2, settle), cameraScale: lerp(.97, 1, settle) }
}
