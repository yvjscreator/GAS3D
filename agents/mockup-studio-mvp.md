# GAS3D Mockup Studio — product-first workflow

Route: `#/mockups`; integrated into the shared AppLauncher. The October 2026 release uses a reusable catalogue instead of loading garment photos for every mockup.

## Workflow

1. **Productos**: create a named product and select a garment type. Product cards offer **Nuevo mockup**, **Editar**, **duplicar** (copies original garment photos and zone configuration) and **eliminar**. Photos, artworks and product settings are saved only in this browser.
2. **Configurar producto**: enable relevant front, back, left/right and sleeve views; upload a base photo for each view, then add and name one or more independently editable print zones. Drag zones and scale them from handles; adjust relative width and zone aspect ratio. Product photography and zone definitions remain reusable.
3. **Nuevo mockup**: select a configured print zone, upload a transparent PNG for it and move, proportionally resize, rotate or tune fabric lighting. Each zone can hold its own print; existing prints in other zones are retained. Print placements are saved per product as an editable browser-local draft.
4. **Exportar**: an individual view exports at the photo's native resolution up to the safety limits (20 MP, 8192 px/edge). All views can be composed into a two-column PNG where total canvas size permits (24 MP total). A meaningful error is shown instead of silently shrinking oversized photographs.

## Editing behavior

- Drag the artwork interior: move.
- Drag a corner without modifiers: proportional scaling, with opposite corner anchored.
- Hold Ctrl (or Command) while dragging a corner: deform that corner independently.
- On mobile: choose the explicit **Escalar / Deformar** switch instead of needing a keyboard.
- Product setup displays zone geometry independent of an artwork PNG.
- The preview and export share the same deterministic compositing engine and can render multiple transparent PNGs on the same photo, with tunable garment-relative luminance.

## Preservation and storage

- Original photos and original transparent PNG Blobs live in IndexedDB; product manifest and placement drafts live in localStorage. Compositing uses at most a 4096 px working bitmap for very large artwork (up to its existing validated limit). The stored source artwork is never overwritten or AI-regenerated.
- The first opening with an empty product library attempts a non-destructive import of legacy front/back media keys. The original v1 data is left intact.
- All media is **local to the browser/device**: this is not yet a cloud-synced team product catalogue. Browser data clearing removes the local collection.
- Print zones are *photo-relative*, not certified real-world centimeters. Do not present dimensions as accurate physical measurements until a reference calibration system is implemented.
- Photos bearing preexisting artwork cannot be cleaned by this compositor. Use blank garment photographs.

## Outstanding improvements

- Photo reference calibration for exact physical print dimensions and multiple zones with per-zone centimeter bounds.
- Garment silhouette masks, seam-aware boundaries and fabric displacement maps.
- More accurate 3D fabric shape, bulk artwork sets, ZIP exports, undo/redo and cloud-backed product synchronization.

## Validation

Run `npm run qa:mockups` and `npm run build`. Responsive browser review on a real phone/desktop is still required before claiming visual parity; static QA cannot establish screenshot fidelity.
