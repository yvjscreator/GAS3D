# Collage Creator — mobile-first GAS3D application

**Route:** `#/collage` in `src/app/App.tsx`.

**Goal:** produce one horizontal prompt-reference image containing an arbitrary number of panels. Typical use: an empty display reference, background artwork, isolated print artwork, and a companion/logo reference, all side by side with white separators as in the example supplied by the user.

## Functional scope (v1)

- Add one or many image files from the native phone gallery/file picker (`image/*`, multiple).
- Preview as a horizontally scrollable **single strip**, not a vertical/grid collage, regardless of the responsive editor layout.
- Add, remove, reorder with left/right buttons; choose each tile's underlying **black** or **white** background.
- Preserve artwork without cropping or applying filters. The source image is `object-fit: contain` in preview and drawn with equivalent contain math on PNG export.
- Produce a single PNG with white outer margin and consistent white gutters, solid independent panel backgrounds, and count-derived output dimensions.
- Export dynamically for N panels; `getCollageGeometry()` caps export at 8192 pixels wide and 16 million pixels total to reduce out-of-memory failures on phones.
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

Browsers do not guarantee support for every `image/*` encoding. The source must be decodable to compose PNG. High counts are downscaled automatically to stay within a bounded canvas size.

## Acceptance checklist

- [x] Added independent GAS3D route and tool selector.
- [x] Multi-image mobile gallery picker, remove and reordering.
- [x] Black/white fill per panel and noncropped art.
- [x] One horizontal PNG, count-derived geometry with mobile memory caps.
- [x] IndexedDB source + last image, localStorage ordered manifest.
- [x] Mobile responsive classes and thumb-reachable actions.
- [x] Static QA assertions included in project build.
- [ ] Actual phone Safari/Chrome visual and persistent-storage smoke test.
- [ ] Full deployed build and PNG output verified by browser.
