# AGENTS.md

## GAS3D repository working rules

### Video Studio redesign

The canonical implementation plan for the advertising/video studio redesign is:

`agents/video-studio-roadmap.md`

Before modifying any of these areas, read that roadmap:

- `src/components/studio/**`
- `src/components/stage/**`
- `src/config/advancedDirectors.ts`
- `src/config/directorShots.ts`
- `src/config/garmentMotions.ts`
- `src/store/studioStore.ts`
- `src/types/studio.ts`
- `src/utils/beatSync.ts`
- `src/utils/stageTimeline.ts`
- `src/utils/presentationPlanner.ts`
- `src/hooks/useRecording.ts`

For work belonging to roadmap phases 1–8:

1. Include `video-phase-N` in the commit message.
2. Update `agents/video-studio-roadmap.md` in the SAME commit.
3. Keep the phase status and implementation notes accurate.
4. Never mark a phase `DONE` until its acceptance checks are actually satisfied.
5. Preserve manual timeline edits and backwards compatibility unless the roadmap explicitly records a migration.
6. Preview/export parity is a required invariant; do not implement separate cinematographic behavior only in preview or only in recording.
7. Do not simplify Quick Video by creating a second incompatible project format. Quick Video must generate the same DirectorProject consumed by Advanced mode.

The GitHub workflow `.github/workflows/video-studio-roadmap.yml` enforces item 2 for phase-marked commits.

### General safety for repository edits

- Fetch the current file before updating it.
- Do not assume the branch head is unchanged between separate editing sessions.
- Prefer small phase-scoped commits.
- Do not overwrite unrelated changes.
- Keep existing persisted project data readable when adding fields by supplying safe defaults or migrations.
