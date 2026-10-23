# GAS3D — Mockup Studio plan

**Status (October 2026):** the product-first catalogue and multi-view compositor are implemented at `#/mockups`. The centimeter-calibration release adds per-view two-axis photo reference lines, estimated centimeter dimensions for zones and prints, proportion-preserving numeric print sizing and visual zone-overflow warnings. Physical accuracy remains approximate for angled photographs. Non-destructive adjustable sleeve-cylinder projection is now implemented for individual prints (including prints assigned to side-view photos); garment silhouette masks, photographed-fold displacement maps and cloud sync are still planned.

## Goal
Reuse the same original garment photo templates with many interchangeable transparent artwork PNGs; export realistic catalog imagery without image-generation drift. First use case: side-by-side black oversized T-shirt front/back, small chest logo and large back print, preserving original PNGs and photo geometry.

## First release (2D browser compositor)
- A new GAS3D module route \`#/mockups\` using AppLauncher and a compact native header, like other tools.
- Import a photo of a garment (flat-lay, hanger or mannequin) plus one or more transparent artwork PNGs. Create named reusable templates: color/cut/view, dimensions, one or more print zones.
- In template setup, outline the permitted print polygon (four editable corners plus perspective transform) and optional mask limiting edits to the fabric. Keep source photos untouched.
- For each print zone, place an original PNG; move, scale, rotate and adjust its perspective with finger-friendly drag/handles and numeric physical size where a calibration reference exists.
- Derive a **lighting map** from the garment source inside the printing zone (luminance normalized against locally varying fabric color), preserve highlights and folds through an adjustable lighting contribution. Use blend/composite operations that conserve the design's color and transparency. Avoid plain Multiply on dark shirts (it would erase bright designs).
- Support optional **displacement map** for fabric folds; it must be authored/calibrated per template. Combine with a low-opacity fabric grain layer for print texture. Manual brightness/contrast/mask sliders and original-art view make integration tunable.
- Deterministic Canvas/WebGL output with no generative redrawing of text, logos or characters, original image transparency intact. Export high-resolution PNG/JPEG and a combined two-column front/back catalog image.
- Save template configuration and artwork placement locally (IndexedDB/manifest). No upload to server by default.

## Visual quality safeguards
- Treat mockups as visual representations, not guaranteed centimeters. Exact 8x8 cm or 35x40 cm placement requires calibrating photo scale from garment measurements/reference; otherwise label placement as approximate.
- Photographic templates should ideally use source photos **without existing prints**. Removing printed art convincingly requires a different cleanup step.
- A diffuse lighting map alone creates shading but not the actual curved cloth deformation; use mesh warping/displacement to handle folds, curved surfaces and off-axis perspectives.
- Support compositing both a black tee and a white tee; shade artwork in a way that does not lose vivid colors on black fabric.
- Prefer native resolution processing by tiles for export when images are very large, with memory limits and explicit errors.

## Iterations
1. MVP: flat front/back photographs, rectangle/perspective zone editor, PNG art transform, garment mask, adjustable grayscale light-map, manual shadows, native PNG export and two-panel composition.
2. Template authoring: reusable product templates, named angles and multiple zones are implemented locally; calibration in cm, seam-aware boundaries, reusable displacement maps and garment masks remain planned.
3. Advanced: contour mesh/warp controls, optional AI-assisted zone/mask detection with manual overrides, bulk apply N designs to one template, ZIP/export presets.

## Acceptance
- An unchanged artwork PNG can be overlaid on a blank black shirt and remain legible while appearing lit and creased.
- Reuse one template for different artworks without requiring generative rerendering.
- A two-view example supports 8x8 cm centered chest and 35x40 cm back placement after calibration, while preserving true original PNG artwork.
- Both desktop mouse and mobile touch editing, undo/redo, preview/export consistency and template restoration.
- No promise of photorealism from arbitrary poorly lit garment photos without suitable maps.

## Photo calibration release — implementation notes

- Each product photo view stores optional independent horizontal and vertical references (two normalized image points plus measured centimeters for each axis). Legacy data is read without destructive migration, and the source photo and original art Blobs remain unchanged.
- Set up calibration in **Configurar producto** by entering a known garment width and height and marking each pair of endpoints directly on that view's photo. The blue/orange guide lines never appear in exports.
- With both axes available, setup displays estimated zone dimensions in centimeters; **Nuevo mockup** exposes numeric artwork width/height. Editing either dimension updates only the uniform bitmap scale. The other dimension recalculates, preserving original PNG proportions.
- Moving or enlarging a print beyond its zone produces a warning, not clipping or modification of source artwork. Replacing a view's garment photo invalidates that view's calibration so outdated pixels-per-centimeter cannot silently carry over.
- The two photo scales are local approximations, **not certified textile dimensions**, especially for camera perspective, sleeve curvature, lens distortion or non-planar fabric. Sleeve curvature/displacement belongs to a later phase.
- Regression checks: `npm run qa:mockups`, `npm run build`, plus browser testing on phone and desktop before production rollout.

## Sleeve curvature release — October 2026

- Each artwork placement now accepts optional `sleeveCurve: { strength, axis, direction }`. Missing values from preexisting drafts produce the exact original flat projection.
- Newly uploaded prints in dedicated `leftSleeve` or `rightSleeve` views receive a gentle **28%** curve by default; other views remain flat unless enabled manually, including lateral photographs with a sleeve print.
- The per-print **Adaptación a mangas** panel exposes Plano/Manga curva, intensity 0–100, presets, wrapping axis (vertical/horizontal) and direction. The printable PNG source in IndexedDB and product template geometry remain unmodified.
- The common `renderGarmentLayers` engine interpolates a cylindrical nonlinear mesh (16×16 only when enabled, existing 5×6 for flat prints). The same renderer performs responsive preview and full-size export. The curved contour is used for guides, pointer hit tests and zone-overflow warnings; lighting bounds include the bowed silhouette.
- This approximates sleeve volume from a 2D photo, **not** a garment 3D simulation or fold-specific physical displacement. Manual corner dragging/perspective remains available. Print sizes in cm are estimates of the flat artwork before photographic curvature.
- Regression cases in `npm run qa:mockups` cover corner anchors, axis/direction, boundary hit testing, overflow, persisted settings, flat legacy defaults and preview/export wiring.
- After merging to `main`, verify `npm run build` on Render; GitHub Actions jobs have previously failed before starting any runner, so those failures alone do not verify or disprove code quality. Device-based visual validation remains outstanding.
