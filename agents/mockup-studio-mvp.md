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
- Print zones and prints support optional two-axis photo calibration in centimeters. Physical sizes remain **estimated**, not certified, when the camera perspective or fabric curvature is unknown.
- Photos bearing preexisting artwork cannot be cleaned by this compositor. Use blank garment photographs.

## Outstanding improvements

- Higher-accuracy scale modeling for angled camera views and variable depth. Photo reference calibration and approximate centimeter display are now available.
- Garment silhouette masks, seam-aware boundaries and photographed-fold displacement maps. The per-print cylindrical sleeve deformation now has a strength slider, axis/direction controls and automatic soft presets for newly loaded sleeve artwork.
- True 3D fabric geometry, bulk artwork sets, ZIP exports, undo/redo and cloud-backed product synchronization.

## Validation

Run `npm run qa:mockups` and `npm run build`. Responsive browser review on a real phone/desktop is still required before claiming visual parity; static QA cannot establish screenshot fidelity.
