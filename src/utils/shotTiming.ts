import type { ShotTimingProfile } from '../types/studio'

export type ShotTimingPhase = 'hold' | 'prepare' | 'transition' | 'settle'

export interface ShotTimingFrame {
  phase: ShotTimingPhase
  local: number
  overall: number
  motionProgress: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function defaultShotTimingProfile(): ShotTimingProfile {
  return { hold: .62, prepare: .13, transition: .2, settle: .05 }
}

function normalizeProfile(profile?: ShotTimingProfile): ShotTimingProfile {
  const source = profile ?? defaultShotTimingProfile()
  const hold = Math.max(0, source.hold)
  const prepare = Math.max(0, source.prepare)
  const transition = Math.max(0, source.transition)
  const settle = Math.max(0, source.settle)
  const total = hold + prepare + transition + settle
  if (total <= .0001) return defaultShotTimingProfile()
  return { hold: hold / total, prepare: prepare / total, transition: transition / total, settle: settle / total }
}

function phaseLocal(value: number, start: number, length: number) {
  if (length <= .0001) return value >= start ? 1 : 0
  return clamp01((value - start) / length)
}

/**
 * Converts normalized clip progress into semantic cinematography phases.
 * Old clips without a stored profile intentionally receive the current default.
 * Strong motion is held at zero during HOLD and then released progressively,
 * leaving later phases free for more sophisticated motion in Phase 3.
 */
export function evaluateShotTiming(progress: number, profile?: ShotTimingProfile): ShotTimingFrame {
  const t = clamp01(progress)
  const normalized = normalizeProfile(profile)
  const holdEnd = normalized.hold
  const prepareEnd = holdEnd + normalized.prepare
  const transitionEnd = prepareEnd + normalized.transition

  if (t < holdEnd) return { phase: 'hold', local: phaseLocal(t, 0, normalized.hold), overall: t, motionProgress: 0 }
  if (t < prepareEnd) {
    const local = phaseLocal(t, holdEnd, normalized.prepare)
    return { phase: 'prepare', local, overall: t, motionProgress: local * .12 }
  }
  if (t < transitionEnd) {
    const local = phaseLocal(t, prepareEnd, normalized.transition)
    return { phase: 'transition', local, overall: t, motionProgress: .12 + local * .78 }
  }
  const local = phaseLocal(t, transitionEnd, normalized.settle)
  return { phase: 'settle', local, overall: t, motionProgress: .9 + local * .1 }
}
