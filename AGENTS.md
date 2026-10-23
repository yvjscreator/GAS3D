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

## Images Studio: preserve native-resolution artwork

- The standard bitmap pipeline uses 18 MP mobile / 30 MP desktop memory protection. Large PNG sources use `src/components/images/largeImageExport.ts`: small resized preview, original source retained, native-resolution strip processing, streamed RGBA8 PNG with transparent margin trim, ICC/pHYs metadata preserved.
- Do not simply remove memory protection or silently downscale exported print artwork. The large-image mode must explicitly fail if the browser refuses a source, and preserve original pixel dimensions except alpha-transparent trimming.
- Keep batch export and individual export in parity; validate the PNG dimension-header path and source-over-limit thresholds in `scripts/images-print-qa.ts`.
- Do not claim that mobile browsers can universally decode 100 MP: support depends on decoder and available memory.

## Shared GAS3D application navigation

- All modules use the compact four-squares launcher from `src/components/navigation/AppLauncher.tsx` in their own existing header. Never place a second floating tab bar over native module controls.
- Preserve each module's primary actions in its header, especially the Subtitle Studio generate/script/voice/export action, Images Studio export/Zen actions, and Video Studio preview/record/edit controls.
- The launcher must be usable on mobile and desktop, including in full-screen/Zen modes, with overlay above app-specific chrome, Escape/outside close, keyboard navigation, and accurate current-module highlighting.
- Navigate by hash without going through Video Studio or replacing module-local workflow buttons. All modules, including Halftone Lab, must appear in the launcher.

## Notifications and confirmations (all GAS3D screens)

- Never use native JavaScript `alert`, `confirm`, or `prompt` dialogs, including `window`/`globalThis` variants. Use accessible in-app DOM dialogs for confirmations and forms for input.
- Transient success, error and operation-progress notices must be floating popups, never full-width banners that consume workspace height. Reuse the shared Sileo host and `notify` / `useTaskNotice` from `src/components/ui/notifications.ts`.
- Use `requestConfirmation` for destructive decisions; cancellation, Escape and navigation must leave data untouched. Keep persistent actionable validation beside the field it concerns.

## Responsive, column-first interface design (all GAS3D screens)

Mandatory guidance: `agents/ui-layout-guidelines.md`.

- Do not build wide desktop workspaces as a monotonous vertical list of full-width controls. When there is usable horizontal space, distribute independent options and settings into intentional columns.
- Before implementing UI, inspect the existing page layout, CSS grid rows/columns, container queries and the project's shared components. Reuse the existing visual system instead of inventing isolated, mismatched controls.
- Use CSS Grid with `repeat(..., minmax(0, 1fr))`, `min-width: 0`, and container-query breakpoints for responsive layouts. Do not let option cards collapse to narrow slivers or make copy wrap one word per line.
- Group related options into coherent visual sections: preset cards side by side; multiple settings on the same row; related actions grouped horizontally. Reserve single-column stacking for narrow layouts or genuinely sequential content.
- This applies INSIDE sidebars, dialogs, cards and inspectors too. A 260–340px sidebar is not an excuse to stack a field, its action, its confirmation and its status as separate full-width rows. Prefer one label above `[value][action][✓][×]`; reuse `InlineField` from `src/components/ui/primitives.tsx` and the calibration example in `PhotoCalibrationControls.tsx`.
- Audit vertical density whenever editing controls: put short related inputs/actions on the same line, use accessible icon buttons for short secondary actions, and keep explanatory paragraphs in optional help. Keep primary editing controls visible; do not compensate with tiny text, undersized touch targets or hiding required actions in accordions.
- Check actual container width and populated/editing states. Field actions must remain on the same row wherever they fit, including in the mobile inspector; use 44px touch targets and only wrap when the combined controls genuinely cannot fit. Verify scroll height and row alignment in the browser, not just that CSS contains a grid declaration.
- When conditionally hiding a panel (for example a timeline), update the parent grid tracks as well so the hidden region does not leave an empty row.
- Use shared tokens, typography, buttons, tabs and surfaces. Ensure selected, hover, disabled and keyboard-focus states are visible.
- For layout work, verify at desktop, medium-width and narrow widths. If visual/browser verification cannot be performed, say so and do not claim the layout was visually validated.
- Add an appropriate regression check when introducing a new major screen; documentation by itself is not a guarantee.

## Mockup Studio (product-first catalogue)

Canonical requirements: `agents/mockup-studio-plan.md` and `agents/mockup-studio-mvp.md`.

- Keep the product library as the primary workflow: named reusable products with independent photo views and print zones. Editing a mockup must not overwrite its reusable product photo or default zone geometry.
- Unmodified corner dragging scales the print proportionally; Ctrl/Command + drag or the mobile Deformar switch explicitly adjusts an individual corner.
- Keep legacy front/back photos and placements recoverable through non-destructive migration. Store source Blobs in IndexedDB and only serializable settings in localStorage.

- Preserve the user's existing photographs and artwork PNGs; reuse front/back locally via IndexedDB. High-resolution art can have more pixels than the photo: keep the full original Blob and make a capped working bitmap only for photocompositing. Do not upscale, generate, alter or delete source artwork stored in IndexedDB.
- Compositing uses photo-relative fabric illumination rather than multiplying colors by black fabric. Keep preview/export renderer shared; support mouse and touch editing, manual quad geometry and full-sized photo export within safe canvas caps.
- Physical print measurements need explicit template calibration; never label photo-relative percentages as centimeter-accurate.
- Use the shared AppLauncher compact header; keep mobile/desktop editing reachable without controls covering exports.
- Test with `npm run qa:mockups`; do not claim actual device validation until browser testing.

## Collage Creator (mobile-first)

Canonical implementation notes: `agents/collage-creator.md`.

Before changing `src/components/collage/**`, `src/app/App.tsx`, or shared media persistence for collage:

- Optimize the phone workflow first. Images must be addable via the mobile gallery picker, with touch controls sized for fingers (at least 44px actions where feasible), while desktop uses meaningful columns instead of endless single-column rows.
- The ONLY composition layout currently supported is a single horizontal row of N images in upload/reordered sequence. Fit the entire preview in the available width without scrolling or interactive drag on the preview; the exported image must contain every panel.
- Always preserve original source files and full artwork: use **one common image height and individual dynamic widths from each source aspect ratio** in both preview and PNG. Never crop, stretch, or use fixed-width contain/letterbox tiles. Transparent pixels reveal the selected black or white fill; it must never form artificial sidebars. White margins between panels are independent.
- Image Blob bytes belong in IndexedDB; localStorage holds only serializable metadata/order/background selection. Do not write duplicate last-image blobs or show a “Repetir última” action. Previously saved images must remain recoverable by their normal IDs.
- Removing, replacing or reordering one panel must not erase unrelated uploaded images. Replacement by double tap on a management thumbnail (with a refresh-icon fallback) must keep the item ID, order and black/white background. Use a compact up/drag/down/delete vertical mobile rail and only enable drag handles in the management area. Color choices are icon-only, but require accessible color names and active states. Favor larger thumbnails and lower mobile card heights. Clean revoked object URLs and obsolete IndexedDB records. Avoid network requests for personal artwork.
- Preserve PNG export and test aspect-ratio-based output geometry (portrait/square/landscape), count limits, maximum quality without silent downscaling, explicit compatible canvas caps, management-only touch/mouse drag, vertical mobile arrows, native gallery substitution, preview/export parity, mobile layout and restoration behavior whenever modifying renderer or persistence.
- Do not claim iOS/Android visual validation unless it actually ran on a device/browser.

### General safety for repository edits

- Fetch the current file before updating it.
- Do not assume the branch head is unchanged between separate editing sessions.
- Prefer small phase-scoped commits.
- Do not overwrite unrelated changes.
- Keep existing persisted project data readable when adding fields by supplying safe defaults or migrations.
