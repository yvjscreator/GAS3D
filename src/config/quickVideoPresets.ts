import type {
  BeatSyncStyle,
  DirectorProject,
  DirectorShotKind,
  DirectorTransitionId,
  GarmentMotionId,
  PresentationMode,
  QuickVideoSettings,
  ShotTimingProfile,
} from '../types/studio'

export type QuickVideoDirectorPreset = {
  presentationMode: PresentationMode
  enabledShotTypes: DirectorShotKind[]
  motionIds: GarmentMotionId[]
  transitionIds: DirectorTransitionId[]
  beatStyle: BeatSyncStyle
  barsPerChange: 1 | 2 | 4 | 8
  shotTiming: ShotTimingProfile
}

export const defaultQuickVideoSettings = (): QuickVideoSettings => ({
  style: 'premium',
  rhythm: 'balanced',
  cameraMotion: 'medium',
  designExposure: 'longer',
  targetDuration: 12,
})

const timingByExposure: Record<QuickVideoSettings['designExposure'], ShotTimingProfile> = {
  longer: { hold: .72, prepare: .1, transition: .14, settle: .04 },
  normal: { hold: .62, prepare: .13, transition: .2, settle: .05 },
  faster: { hold: .52, prepare: .14, transition: .27, settle: .07 },
}

export function resolveQuickVideoPreset(settings: QuickVideoSettings): QuickVideoDirectorPreset {
  const barsPerChange: 1 | 2 = settings.rhythm === 'relaxed' ? 2 : 1
  const style = settings.style
  const cameraMotion = settings.cameraMotion

  const base = style === 'editorial'
    ? {
        presentationMode: 'sequential' as const,
        enabledShotTypes: ['itemShowcase', 'detailLarge', 'detailSmall'] as DirectorShotKind[],
        motionIds: ['heroArc', 'detailPush'] as GarmentMotionId[],
        transitionIds: ['cut', 'premiumOrbit', 'detailDive'] as DirectorTransitionId[],
        beatStyle: 'elegant' as const,
      }
    : style === 'dynamic'
      ? {
          presentationMode: 'sequential' as const,
          enabledShotTypes: ['itemShowcase', 'hero', 'detailSmall'] as DirectorShotKind[],
          motionIds: ['whipCompanion', 'turntableRight', 'companionReveal'] as GarmentMotionId[],
          transitionIds: ['whipReveal', 'matchRotation', 'occlusionCut', 'cut'] as DirectorTransitionId[],
          beatStyle: 'impact' as const,
        }
      : {
          presentationMode: 'mixed' as const,
          enabledShotTypes: ['groupShowcase', 'itemShowcase', 'hero', 'detailLarge', 'detailSmall'] as DirectorShotKind[],
          motionIds: ['heroArc', 'detailPush', 'companionReveal'] as GarmentMotionId[],
          transitionIds: ['premiumOrbit', 'matchRotation', 'detailDive', 'cut'] as DirectorTransitionId[],
          beatStyle: 'elegant' as const,
        }

  const motionIds = cameraMotion === 'subtle'
    ? base.motionIds.filter((id) => id === 'heroArc' || id === 'detailPush')
    : cameraMotion === 'strong'
      ? [...new Set<GarmentMotionId>([...base.motionIds, 'whipCompanion', 'companionReveal', 'turntableRight'])]
      : base.motionIds

  const enabledShotTypes = settings.targetDuration <= 8
    ? base.enabledShotTypes.filter((kind) => kind === 'itemShowcase' || kind === 'hero' || kind === 'detailSmall')
    : settings.targetDuration <= 12
      ? base.enabledShotTypes.filter((kind) => kind !== 'groupShowcase' || style === 'premium')
      : base.enabledShotTypes

  return {
    ...base,
    enabledShotTypes,
    motionIds: motionIds.length ? motionIds : ['heroArc'],
    barsPerChange,
    shotTiming: timingByExposure[settings.designExposure],
  }
}

export function applyQuickTimingProfile(project: DirectorProject, timing: ShotTimingProfile): DirectorProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => track.type !== 'director' ? track : {
      ...track,
      clips: track.clips.map((clip) => clip.type !== 'directorShot' || clip.manualTiming ? clip : { ...clip, shotTiming: { ...timing } }),
    }),
  }
}
