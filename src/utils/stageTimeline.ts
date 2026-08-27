import type { LayerTiming, LayerTransition } from '../types/studio'

export interface LayerFrame {
  visible: boolean
  opacity: number
  translateX: number
  translateY: number
  scale: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const ease = (value: number) => 1 - Math.pow(1 - clamp01(value), 3)

function transitionFrame(type: LayerTransition, progress: number) {
  const value = ease(progress)
  if (type === 'slideLeft') return { opacity: value, translateX: (1 - value) * -12, translateY: 0, scale: 1 }
  if (type === 'slideRight') return { opacity: value, translateX: (1 - value) * 12, translateY: 0, scale: 1 }
  if (type === 'slideUp') return { opacity: value, translateX: 0, translateY: (1 - value) * 12, scale: 1 }
  if (type === 'zoom') return { opacity: value, translateX: 0, translateY: 0, scale: .78 + value * .22 }
  if (type === 'fade') return { opacity: value, translateX: 0, translateY: 0, scale: 1 }
  return { opacity: 1, translateX: 0, translateY: 0, scale: 1 }
}

export function evaluateLayerFrame(timing: LayerTiming, time: number): LayerFrame {
  const start = Math.max(0, timing.start)
  const duration = Math.max(.05, timing.duration)
  const end = start + duration
  if (time < start || time > end) return { visible: false, opacity: 0, translateX: 0, translateY: 0, scale: 1 }
  const transitionDuration = Math.min(.7, duration * .3)
  const entering = transitionFrame(timing.enter, transitionDuration ? (time - start) / transitionDuration : 1)
  const exiting = transitionFrame(timing.exit, transitionDuration ? (end - time) / transitionDuration : 1)
  return {
    visible: true,
    opacity: Math.min(entering.opacity, exiting.opacity),
    translateX: Math.abs(entering.translateX) > Math.abs(exiting.translateX) ? entering.translateX : exiting.translateX,
    translateY: Math.abs(entering.translateY) > Math.abs(exiting.translateY) ? entering.translateY : exiting.translateY,
    scale: Math.min(entering.scale, exiting.scale),
  }
}
