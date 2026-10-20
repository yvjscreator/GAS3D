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

## Responsive, column-first interface design (all GAS3D screens)

Mandatory guidance: `agents/ui-layout-guidelines.md`.

- Do not build wide desktop workspaces as a monotonous vertical list of full-width controls. When there is usable horizontal space, distribute independent options and settings into intentional columns.
- Before implementing UI, inspect the existing page layout, CSS grid rows/columns, container queries and the project's shared components. Reuse the existing visual system instead of inventing isolated, mismatched controls.
- Use CSS Grid with `repeat(..., minmax(0, 1fr))`, `min-width: 0`, and container-query breakpoints for responsive layouts. Do not let option cards collapse to narrow slivers or make copy wrap one word per line.
- Group related options into coherent visual sections: preset cards side by side; multiple settings on the same row; related actions grouped horizontally. Reserve single-column stacking for narrow layouts or genuinely sequential content.
- When conditionally hiding a panel (for example a timeline), update the parent grid tracks as well so the hidden region does not leave an empty row.
- Use shared tokens, typography, buttons, tabs and surfaces. Ensure selected, hover, disabled and keyboard-focus states are visible.
- For layout work, verify at desktop, medium-width and narrow widths. If visual/browser verification cannot be performed, say so and do not claim the layout was visually validated.
- Add an appropriate regression check when introducing a new major screen; documentation by itself is not a guarantee.

### General safety for repository edits

- Fetch the current file before updating it.
- Do not assume the branch head is unchanged between separate editing sessions.
- Prefer small phase-scoped commits.
- Do not overwrite unrelated changes.
- Keep existing persisted project data readable when adding fields by supplying safe defaults or migrations.
