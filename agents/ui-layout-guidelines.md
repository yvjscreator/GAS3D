# GAS3D UI Layout & Visual Consistency Guide

Scope: all current and future GAS3D interface work, including Image Studio, Subtitle Studio, Video Studio, and tools added later. Read alongside root `AGENTS.md`.

## Column-first, not endless rows

Use the horizontal space available. Desktop is not a mobile form enlarged to 1,200px. A long sequence of full-width dropdowns and single narrow cards wastes space, forces scrolling and breaks visual hierarchy. Related controls should be arranged in grids when each remains readable.

Recommended composition for a wide studio work area:

- A compact introductory header followed by grouped sections.
- A grid of 3 meaningful style/preset cards side by side on wide screens.
- A grid of 4 short independent controls (or 2 × 2 as width decreases).
- A row of asset/source shortcuts where those shortcuts are relevant.
- An action bar with readiness summary on the left and primary/secondary buttons side by side on the right.

Adapt the number of columns to actual container width, not only viewport width: for example 3 → 2 → 1 for cards and 4 → 2 → 1 for settings. Do not force a third column if it leaves tiny cards. Use `grid-template-columns:repeat(N,minmax(0,1fr))`, `min-width:0` on children and container queries or breakpoints that reflect the layout's real available width.

## Compact field/action groups inside every container

The same rule applies to narrow sidebars, dialogs and cards, across every GAS3D module. A sidebar's width does not justify an endless stack of full-width controls. Distinguish independent groups (which may need separate rows) from the field and actions belonging to ONE operation (which should share a row).

For a calibration reference, use this structure even in a ~285px inspector:

```text
Ancho de referencia (cm)
[54           ][Marcar][✓][×]
Alto de referencia (cm)
[70           ][Marcar][✓][×]
```

Reuse `InlineField` from `src/components/ui/primitives.tsx`: its label sits above an input/action grid, with a flexible field and intrinsic action columns. `src/components/mockups/PhotoCalibrationControls.tsx` is the working example. ✓ applies only that reference; × restores its last saved state. Keep button names available through accessible labels and tooltips, and preserve keyboard input. On touch screens keep 44px actions while retaining the row where it fits.

Apply the pattern to name+edit tools, number+unit/actions, sliders+labels, layer selection+mode switches and related presets. Do not shrink text into unreadability or move primary controls into closed accordions. Long explanations can be optional help; active validation stays beside its field. Saved-state text should not require its own full-width row when an icon or inline state suffices.

Before finishing, inspect a populated inspector at desktop, medium and narrow widths, including an active edit. Check actual field/button bounding boxes, container scroll height and reachability of save/cancel/export. A static assertion that a grid exists does not prove the controls fit, and a large empty canvas does not justify unnecessary scrolling in the sidebar.

## Universal app switcher in every studio header

Use `AppLauncher` from `src/components/navigation/AppLauncher.tsx` in each tool's compact header, rather than adding a second toolbar on top of one. Preserve module-specific controls: generated voice/script in subtitles, image export/Zen, and recording/preview in video. On narrow screens, keep touch targets usable and allow the menu to overlay fixed editors without clipping. The five tools must all be reachable directly.

## Preserve the existing GAS3D design language

Inspect `src/styles.css`, `src/advanced.css`, `src/components/ui/primitives.tsx` and a neighboring screen before choosing markup and classes. Prefer existing `SelectableCard`, `WorkspaceTabs`, `SegmentedControl`, `ResponsiveOptionGrid`, `MasterDetailLayout`, or a dedicated style class that visually matches those primitives.

Maintain the dark surfaces, restrained blue active states, typographic hierarchy, consistent padding, borders and radii. Avoid unstyled native buttons alongside fully styled controls and avoid reusing a CSS class intended for a different DOM structure (e.g., a checkbox+icon grid card applied directly to a text-only button).

## Layout architecture must be consistent

When a mode hides an advanced timeline, its parent grid must change row definitions; otherwise the hidden timeline still leaves a large empty area. When adding/removing sidebars, inspect width constraints and scrolling boundaries. Keep preview canvases visible and avoid forcing the workspace wider than its available container.

## Review checklist before marking finished

1. Wide desktop (~1280–1800 px): several meaningful columns, no skinny word-wrapped cards, no unexplained blank grid track.
2. Medium (~700–1100 px): two columns when readable, clear controls and action hierarchy.
3. Narrow (~360–600 px): only then collapse into one column where necessary, without clipped buttons.
4. Selected/hover/focus/disabled states work and match surrounding tools.
5. All actions remain usable. The layout is a real component of the functional workflow, not a static mock.
6. Add or extend an automated layout-structure regression check and, where possible, inspect rendered screenshots at relevant widths. Static CSS tests cannot replace real visual review.

## Video Studio example

`QuickVideoPanel` must keep `quick-resource-grid`, `quick-style-grid` and `quick-controls-grid` as explicit multi-column layouts at wide widths. The parent `editor-column.quick-experience` must allocate only header, mode tabs, content and status rows; never reserve a blank hidden-timeline row.
