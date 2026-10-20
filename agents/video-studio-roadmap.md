# Video Studio — Implementation Roadmap

This is the living implementation plan for the GAS3D advertising/video studio redesign.

## Status contract

Every implementation commit for one of the eight phases MUST update this file in the same commit.

Allowed phase states:
- `PLANNED`
- `IN_PROGRESS`
- `DONE`
- `BLOCKED`

A phase may be marked `DONE` only when its acceptance checks have been completed. If implementation is partial, keep it `IN_PROGRESS` and describe what remains.

Commit messages for phase work must include `video-phase-N`, where `N` is 1 through 8. Example:

`feat(video-phase-2): quantize scene exits to musical downbeats`

The repository workflow `.github/workflows/video-studio-roadmap.yml` verifies that commits using this marker also modify this roadmap.

## Overall objective

Make GAS3D substantially easier to use for clothing-ad creation while improving the automatic director so garments are presented with premium pacing.

Core creative rule:

> Beats determine when a scene changes. Cinematography determines what happens between those beats.

The design must prioritize time to see and understand the garment before transition energy is introduced.

## Current verified architecture

The implementation is based on the current code paths:

- `src/components/studio/GarmentAdStudio.tsx`
- `src/components/studio/AdvancedDirectorPanel.tsx`
- `src/components/studio/AdvancedTimeline.tsx`
- `src/components/studio/BackgroundPanel.tsx`
- `src/components/stage/AdStage.tsx`
- `src/config/advancedDirectors.ts`
- `src/config/directorShots.ts`
- `src/config/garmentMotions.ts`
- `src/store/studioStore.ts`
- `src/types/studio.ts`
- `src/utils/beatSync.ts`
- `src/utils/stageTimeline.ts`
- `src/utils/presentationPlanner.ts`
- `src/hooks/useRecording.ts`

Verified current behavior:

- Collection scene duration is calculated in `createCollectionProject()` using `cueDuration(beatSync) * rhythmicUnits` when beat sync is enabled.
- Most individual shot definitions currently use `rhythmicUnits: 1`.
- `getCollectionDirectorFrame()` and `getAdvancedDirectorFrame()` calculate a normalized local progress over the full clip.
- That progress is passed into `evaluateGarmentMotion()`, causing major garment/camera motion to consume most or all of the shot instead of being reserved for the exit.
- Preview and recording already share director-frame functions, which should be preserved and strengthened rather than replaced.
- Existing manual timeline edits are protected by `manualTiming` and `preserveManualTimelineEdits()`; new generation logic must preserve this behavior.

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Semantic shot timing | DONE |
| 2 | Musical phrase/downbeat synchronization | DONE |
| 3 | Exhibition motion vs transition motion | DONE |
| 4 | Narrative shot hierarchy | DONE |
| 5 | Premium director transitions | PLANNED |
| 6 | Preview/export parity and scene preroll | PLANNED |
| 7 | Quick Video mode | PLANNED |
| 8 | Default UX, migration and QA | PLANNED |

---

## Phase 1 — Semantic shot timing

Status: **DONE**

Goal: stop treating a clip's normalized `0 → 1` progress as one continuous movement.

Implement a semantic timing profile for director shots with four internal phases:

- HOLD — garment/design presentation.
- PREPARE — subtle anticipation.
- TRANSITION — principal movement into the next composition.
- SETTLE — controlled landing.

Primary files:
- `src/types/studio.ts`
- `src/config/advancedDirectors.ts`
- optionally a new pure helper under `src/utils/`

Required work:
- Add a serializable shot timing profile/type.
- Add a pure evaluator that converts clip-local time into phase progress.
- Keep backward-compatible defaults for old projects.
- Do not create four separate timeline clips unless later evidence shows that is necessary.
- Preserve `manualTiming`.

Acceptance:
- A newly generated individual shot visibly holds its starting composition before any strong turn/zoom.
- Scrubbing at the beginning, middle and end returns deterministic phase values.
- Existing projects without timing-profile fields still render.

Implementation notes:
- Added serializable `ShotTimingProfile` to director clips without splitting the timeline into sub-clips.
- Added pure `evaluateShotTiming()` in `src/utils/shotTiming.ts` with deterministic HOLD / PREPARE / TRANSITION / SETTLE evaluation.
- Default profile is 62% hold, 13% prepare, 20% transition and 5% settle.
- Newly generated director shots store the default profile explicitly; old clips without the field use the same safe default at runtime.
- Both `getAdvancedDirectorFrame()` and `getCollectionDirectorFrame()` now use semantic motion progress, so strong motion remains at zero during HOLD.
- Existing `manualTiming` preservation remains unchanged because shot timing is orthogonal to clip start/duration.
- Phase 3 will refine motion inside each phase; Phase 1 intentionally gates the existing motion curve.

---

## Phase 2 — Musical phrase/downbeat synchronization

Status: **DONE**

Goal: use music to place scene exits/landings, not to force constant motion on every beat.

Primary files:
- `src/utils/beatSync.ts`
- `src/config/advancedDirectors.ts`
- `src/types/studio.ts`
- `src/store/studioStore.ts` only if settings need extension

Required work:
- Reuse existing BPM, offset, beat map and `barsPerChange`.
- Add helpers for bars, downbeats and next valid rhythmic boundary.
- Quantize scene changes to musically meaningful boundaries.
- Add minimum readable duration by shot type so high BPM cannot collapse important shots.
- Keep beat sync disabled behavior intact.
- Preserve manual timing overrides.

Acceptance:
- At 120 BPM a one-bar shot holds the garment for most of the bar and exits toward the next downbeat.
- High BPM does not produce unreadably short hero shots.
- Beat sync off reproduces non-synced timing behavior.

Implementation notes:
- Added explicit `barDuration()`, `nextDownbeat()` and `quantizedCueDuration()` helpers while preserving the existing BPM/offset analysis.
- Beat-synced scene lengths are now quantized to complete cue windows and therefore land on musical bar boundaries.
- Added readability floors: group 4.0s, hero/item showcase 3.2s, main detail 2.4s and companion detail 2.0s; high BPM expands to the next complete cue instead of shortening the shot below the floor.
- Collection generation uses the same quantized cue rule and still respects the detected initial offset.
- Variant beat-sync now preserves `manualTiming` clips and resumes automatic timing on the next downbeat after them.
- Beat-sync-disabled restoration remains unchanged.

---

## Phase 3 — Exhibition motion vs transition motion

Status: **DONE**

Goal: separate subtle motion used while showcasing the garment from the energetic motion used to leave the shot.

Primary files:
- `src/config/garmentMotions.ts`
- `src/config/advancedDirectors.ts`
- `src/types/studio.ts`

Required work:
- Adapt motion evaluation to semantic timing.
- During HOLD use only restrained camera/garment drift.
- During PREPARE introduce anticipation.
- During TRANSITION perform whip/orbit/push/reveal.
- During SETTLE damp the movement.
- Preserve current motion IDs where practical for project compatibility.

Acceptance:
- `whipCompanion` no longer turns away from the main print immediately.
- `detailPush` shows a readable composition before the push becomes dominant.
- Motion remains continuous across frame rates.

Implementation notes:
- `evaluateGarmentMotion()` now consumes the semantic `ShotTimingFrame` instead of one undifferentiated progress value.
- HOLD uses restrained drift only; PREPARE introduces anticipation; TRANSITION performs the strong move; SETTLE damps into the destination.
- `whipCompanion` and `companionReveal` hold the primary placement first and only rotate to the companion during TRANSITION.
- `detailPush` keeps a readable framing during HOLD and reserves the strong camera push for TRANSITION.
- Turntable motions no longer spin continuously for the entire scene; the full rotation is concentrated in the transition window.
- Existing motion IDs remain unchanged for persisted-project compatibility.

---

## Phase 4 — Narrative shot hierarchy

Status: **DONE**

Goal: give hero/main-print shots more visual time and importance than secondary details.

Primary files:
- `src/config/directorShots.ts`
- `src/utils/presentationPlanner.ts`
- `src/config/advancedDirectors.ts`
- `src/types/studio.ts`

Required work:
- Extend shot definitions with readable minimum duration / timing role / priority.
- Remove hard-coded timing knowledge duplicated inside `variantTracks()` and `createCollectionProject()`.
- Make hero, item showcase, large detail and companion detail intentionally different.
- Review the current filtering in `variantTracks()` that limits some hero/detail scenes to the first item; turn that into explicit narrative policy.
- Ensure collection and variants mode use the same shot-definition source of truth.

Acceptance:
- Auto-generated films have an obvious main-product emphasis.
- Main artwork receives more readable exposure than companion detail by default.
- Changing enabled shot types still produces a valid ordered plan.

Implementation notes:
- `DirectorShotDefinition` is now the single source of truth for rhythmic units, default duration, minimum readable duration, narrative priority and variants-mode scope.
- Main presentation shots are intentionally heavier: `itemShowcase` and `hero` use two rhythmic units; large/small details remain one unit.
- Non-synced durations are differentiated: group 8.0s, item 4.8s, hero 5.2s, main detail 3.4s, companion detail 2.8s.
- The readability floors previously hard-coded in `advancedDirectors.ts` now come from the shot definitions.
- The old hidden rule that hero/details only applied to the first variants-mode item is now explicit as `variantScope: 'lead'`; item showcase remains `all`.
- Collection and variants generation both consume the same shot-definition timing data.

---

## Phase 5 — Premium director transitions

Status: **PLANNED**

Goal: stop relying on generic 2D layer transitions as the primary transition language for the garment.

Primary files:
- `src/types/studio.ts`
- `src/config/garmentMotions.ts` or a new `src/config/directorTransitions.ts`
- `src/config/advancedDirectors.ts`
- `src/components/studio/AdvancedDirectorPanel.tsx`

Required work:
- Introduce a director-specific transition type separate from `LayerTransition`.
- Keep current layer transitions for text/overlay compatibility.
- Initial transition set:
  - Premium Orbit
  - Whip Reveal
  - Match Rotation
  - Detail Dive
  - Occlusion Cut
- Director transitions may inspect current and next shot orientation where required.
- Provide safe fallback for old projects.

Acceptance:
- Match Rotation can leave one shot and enter the next without a visible directional contradiction.
- Whip Reveal keeps the main design readable before the whip.
- Generic slide transitions are no longer required for premium garment flow.

Implementation notes:
- _Pending._

---

## Phase 6 — Preview/export parity and scene preroll

Status: **PLANNED**

Goal: make preview and exported video evaluate the same cinematographic state at the same timestamp.

Primary files:
- `src/components/studio/GarmentAdStudio.tsx`
- `src/components/stage/AdStage.tsx`
- `src/hooks/useRecording.ts`
- `src/config/advancedDirectors.ts`
- `src/utils/stageTimeline.ts`
- `src/render/RenderAssetManager.ts`

Required work:
- Keep timing/motion evaluation in pure shared functions.
- Verify preview and recording both consume those same functions.
- Add/strengthen scene preroll so the next garment asset is prepared before the transition lands.
- Reuse existing adaptive preload / `prepareSceneWindow()` infrastructure.
- Verify selection switching in `GarmentAdStudio.play()` does not introduce a one-frame wrong design.
- Ensure background video/audio remains synchronized.

Acceptance:
- Frames sampled around transitions match between preview and export.
- No flash of the previous/next print when a collection item changes.
- Background media remains synchronized after seeking and replay.

Implementation notes:
- _Pending._

---

## Phase 7 — Quick Video mode

Status: **PLANNED**

Goal: allow a useful ad to be created without interacting with the advanced timeline.

Primary files:
- new `src/components/studio/QuickVideoPanel.tsx`
- `src/components/studio/GarmentAdStudio.tsx`
- `src/store/studioStore.ts`
- `src/types/studio.ts`
- a new preset/config file under `src/config/`

Initial presets:
- Premium
- Editorial
- Dynamic

Quick-flow inputs:
- design / collection
- companion when applicable
- background image/video
- music
- style preset
- approximate duration / pacing

Optional simple controls:
- rhythm: relaxed / balanced / dynamic
- camera movement: subtle / medium / strong
- design exposure: longer / normal / faster

Required work:
- Quick mode must generate the same `DirectorProject` structure used by advanced mode.
- “Edit advanced” opens the generated project instead of converting to another representation.
- Quick presets resolve presentation mode, shot types, timing profiles, movements and director transitions.

Acceptance:
- A user can go from uploaded artwork/background to a usable preview without opening the advanced timeline.
- Switching to advanced mode preserves the generated edit exactly.

Implementation notes:
- _Pending._

---

## Phase 8 — Default UX, migration and QA

Status: **PLANNED**

Goal: make Quick Video the approachable entry point while preserving the complete advanced studio.

Primary files:
- `src/components/studio/GarmentAdStudio.tsx`
- studio CSS files
- `src/store/studioStore.ts`
- `src/config/advancedDirectors.ts`
- persistence/schema code

Required work:
- Make Quick Video the default workflow.
- Keep existing Designs / Scene / Direction / Audio workspaces available as Advanced mode.
- Increment `ADVANCED_SCHEMA_VERSION` when the persisted schema requires it.
- Add defaults/migration for all new timing/transition/preset fields.
- Preserve user-created manual timeline timing.
- Complete regression QA.

QA matrix:
- high BPM
- low BPM
- beat sync disabled
- background video audio
- separate music
- one design
- multi-design collection
- front artwork
- back artwork
- left/right sleeve companion
- modified manual timeline
- Quick → Advanced
- preview vs export
- old persisted project/schema
- 24 / 30 / 60 FPS
- reel / feed / square

Acceptance:
- Existing persisted projects open safely.
- Quick mode is the default path without deleting advanced features.
- The complete QA matrix has been exercised and failures documented/fixed.

Implementation notes:
- _Pending._

---

## Completion protocol

When working on a phase:

1. Change the phase from `PLANNED` to `IN_PROGRESS` in the first implementation commit.
2. Keep the implementation notes current in every phase commit.
3. Do not mark `DONE` just because code compiles.
4. Mark `DONE` only in the commit that satisfies the phase acceptance criteria.
5. Record important deviations from this plan under that phase rather than silently changing architecture.
6. If a later phase reveals a regression in an earlier one, reopen the earlier phase as `IN_PROGRESS` or `BLOCKED`.
