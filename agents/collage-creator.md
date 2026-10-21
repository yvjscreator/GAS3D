# Collage Creator — mobile-first GAS3D application

**Route:** `#/collage` in `src/app/App.tsx`.

**Goal:** produce one horizontal prompt-reference image containing an arbitrary number of panels. Typical use: an empty display reference, background artwork, isolated print artwork, and a companion/logo reference, all side by side with white separators as in the example supplied by the user.

## Functional scope (v1)

- Add one or many image files from the native phone gallery/file picker (`image/*`, multiple).
- Preview as a horizontally scrollable **single strip**, not a vertical/grid collage, regardless of the responsive editor layout.
- Add/remove images, reorder by touch/mouse drag grips on preview and cards, and retain keyboard-accessible left/right buttons; independently choose each image's **black** or **white** background.
- Preserve artwork without cropping, stretching or applying filters. All panels have one shared image height, with each panel width determined by the original source aspect ratio (portrait images narrower; landscape images wider). **Never** use fixed-width tiles, letterboxing, or `contain` inside an artificially wide tile.
- Transparent source pixels reveal that image's independently selected black/white fill. The fill does **not** create sidebars. White exterior margins and white inter-image gaps remain distinct.
- The horizontal preview and PNG export use the **same aspect-ratio geometry** and proportional margins/gutters. Preview scrolls; export includes all images.
- Export dynamically for N panels. **Máxima** is the default and uses the tallest original pixel height without automatic downscaling, up to 16384px per axis or 80 million pixels. **Compatible** explicitly scales output to 8192px per axis and 16 million pixels. The UI previews resulting dimensions and warns of any reduction. Canvas cannot guarantee pixel-identical color or detail when differing image heights require resampling.
- Store original Blobs in IndexedDB via the existing `src/utils/mediaStorage.ts` helpers. Never serialize binaries/base64 to localStorage.
- Store the ordered manifest and selected backgrounds in localStorage under `gas3d.collage.manifest.v1`.
- Keep a separate `collage:last` original Blob in IndexedDB and saved last filename in the manifest. “Repetir última” works even after removing the last panel.
- No server upload, automatic background removal, additional composition modes, or cloud sync.

## Files

- `src/components/collage/CollageCreator.tsx` — page, touch controls, import, persistence restore, export action
- `src/components/collage/collageCreator.css` — responsive layout and horizontal preview
- `src/components/collage/collageStorage.ts` — IndexedDB/localStorage contract
- `src/components/collage/collageRenderer.ts` — geometry and PNG canvas composition
- `scripts/collage-qa.ts` — count-based geometry, route, persistence and mobile layout structural regression checks

## Responsive contract

- Phone: touch-friendly gallery picker and sticky bottom actions; cards edit in one readable column; preview always scrolls horizontally.
- Medium: two or more control cards per row when practical.
- Desktop: multi-column management controls, horizontal image-strip preview.
- Respect `agents/ui-layout-guidelines.md`, without confusing a one-row **export format** with a one-column **editor layout**.

## Storage and privacy limitations

The browser controls local data lifetime. Clearing website data, uninstalling browser/PWA, using private mode or evicting the site's storage can erase saved files. Data is local to the *same browser and origin* and does not sync between devices.

Browsers do not guarantee support for every `image/*` encoding. The source must be decodable to compose PNG. Maximum resolution can exceed phone memory; users must explicitly choose Compatible rather than silently reducing output. PNG compression is lossless, but rendering into one Canvas can resample pixels or alter color profiles. Original source Blobs are preserved in IndexedDB.

## Acceptance checklist

- [x] Added independent GAS3D route and tool selector.
- [x] Multi-image mobile gallery picker, remove and pointer-based mouse/touch drag ordering (plus arrow fallback).
- [x] Black/white fill only beneath transparent pixels; uncropped art with dynamic panel widths at a common height.
- [x] One horizontal PNG, native high-resolution/compatible modes, explicit canvas caps and matching preview proportions.
- [x] IndexedDB source + last image, localStorage ordered manifest.
- [x] Mobile responsive classes and thumb-reachable actions.
- [x] Static QA assertions included in project build.
- [ ] Actual phone Safari/Chrome visual and persistent-storage smoke test.
- [ ] Full deployed build and PNG output verified by browser.
