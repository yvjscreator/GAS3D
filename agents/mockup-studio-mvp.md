# GAS3D Mockup Studio — product-first workflow

Route: `#/mockups`; integrated into the shared AppLauncher. The October 2026 release uses a reusable catalogue instead of loading garment photos for every mockup.

## Workflow

1. **Productos**: create a named product and select a garment type. Product cards offer **Nuevo mockup**, **Editar**, **duplicar** (copies original garment photos and zone configuration) and **eliminar**. Products/photos/settings are cached locally and can be explicitly saved to the personal Cloudinary catalogue; artwork PNGs and mockup drafts remain local.
2. **Configurar producto**: enable relevant front, back, left/right and sleeve views; upload a base photo for each view. Contrasting photos automatically open a reviewable silhouette and central-zone suggestion. Save the silhouette and optionally add the suggested zone without replacing other zones. **Editar en grande** opens one photo with zoom, panning and rulers; the **Panel** button hides controls for more canvas space. Use **Pluma** for fabric contours or **Editar zona con Pluma** for custom print boundaries. Product photography and zone definitions remain reusable.
3. **Nuevo mockup**: select a configured print zone, upload a transparent PNG for it and move, proportionally resize, rotate or tune fabric lighting. Optional silhouette clipping and explicit zone-safe clipping limit rendered artwork without changing its PNG. Each zone can hold its own print; existing prints in other zones are retained. Print placements are saved per product as an editable browser-local draft.
4. **Exportar**: an individual view exports at the photo's native resolution up to the safety limits (20 MP, 8192 px/edge). All views can be composed into a two-column PNG where total canvas size permits (24 MP total). A meaningful error is shown instead of silently shrinking oversized photographs.

## Editing behavior

- Drag the artwork interior: move.
- Drag a corner without modifiers: proportional scaling, with opposite corner anchored.
- Hold Ctrl (or Command) while dragging a corner: deform that corner independently.
- On mobile: choose the explicit **Escalar / Deformar** switch instead of needing a keyboard.
- Product setup displays zone geometry independent of an artwork PNG.
- The same amber product-zone guide remains visible in setup and mockup modes, including before uploading a PNG. Blue handles control the zone in setup and the artwork in mockup mode; artwork proportion or a restored local draft cannot change the fixed zone guide. **Encajar en zona del producto** reapplies the configured reference without resizing source pixels. The purple automatic proposal is separate and unsaved until added. Safe-margin guides are also shared between both modes; clipping remains the product's explicit option.
- Choosing/adding a zone in setup persists that view's `defaultZoneId`; entering a mockup from the library uses that configured zone, rather than always choosing the first/default-created zone. Explicit mockup selections do not modify the reusable preference. Older products or removed IDs safely fall back to their first remaining zone. This preference also synchronizes through Cloudinary.
- In **Configurar producto → Zona**, square handles at the middle of each side resize only the height or width while fixing the opposite side. They work with mouse/touch, zoom/panning, and arrow keys (Shift = larger steps); they do not stretch artwork PNGs. Pen zones stretch within their enclosing box. Limits prevent flipped zones or extending past the photograph.
- The pen uses up to 32 straight-segment nodes: click to add, click the first node to close, drag to move a node, click an edge of a closed contour to insert, delete the selected node, or undo. It does not implement Bézier handles. Invalid/self-crossing contours are not saved. Custom zones move and uniformly scale as a whole; saved polygon clipping is shared by preview and export.
- In the large editor, **Mano** or Space + drag pans the photo, zoom buttons magnify up to 500%, **Encajar** resets framing and Escape exits. Rulers track the same photo transform. Desktop controls sit beside the photo; narrow layouts initially give the photo the full workspace, with the inspector available through **Panel**. **Calibrar** opens its controls when needed.
- **Calibrar**: mark two photo points, then enter the known or estimated centimeters and save the reference (entering the value first also works). One horizontal OR vertical reference estimates an equal pixel-per-cm scale in both directions; two references refine axes independently. Rules show pixels until calibration exists and then estimated cm. Measure the garment segment, not blank photo margins. Estimates supplied by ChatGPT remain estimates.
- The preview and export share the same deterministic compositing engine and can render multiple transparent PNGs on the same photo, with tunable garment-relative luminance.

## Preservation and storage

- Original photos and original transparent PNG Blobs live in IndexedDB; product manifest and placement drafts live in localStorage. Compositing uses at most a 4096 px working bitmap for very large artwork (up to its existing validated limit). The stored source artwork is never overwritten or AI-regenerated.
- The first opening with an empty product library attempts a non-destructive import of legacy front/back media keys. The original v1 data is left intact.
- **Cloudinary catalogue**: connect to the GAS3D API with the private catalogue key, then **Subir pendientes / Guardar en nube**. Original photos and settings become available on other devices. Save photo replacements/removals to clean obsolete cloud files; product deletion removes its Cloudinary photos for all devices. Offline edits and conflicting revisions require explicit recovery or duplication. Sharing credentials with SolutionSuite is isolated by a fixed GAS3D namespace and exact ownership checks. See `agents/mockup-cloud-library.md` for setup and limits. Browser data clearing removes unsynced products, artwork and drafts; cloud-saved templates can be downloaded again.
- Print zones and prints support optional two-axis photo calibration in centimeters. Physical sizes remain **estimated**, not certified, when the camera perspective or fabric curvature is unknown.
- Photos bearing preexisting artwork cannot be cleaned by this compositor. Use blank garment photographs.

## Outstanding improvements

- Higher-accuracy scale modeling for angled camera views and variable depth. Photo reference calibration and approximate centimeter display are now available.
- Color-based silhouette detection and conservative central-zone suggestions are implemented for reasonably uniform, contrasting backgrounds (including dark garments on light backgrounds). It runs locally on a <=384 px analysis copy, never modifies originals, and falls back to the pen on poor contrast or unreliable contours. It does not recognize seams, garment types or physical dimensions. AI-assisted segmentation and photographed-fold displacement remain outstanding. Sleeve curvature has strength, axis and direction controls.
- Positive cm seam insets support convex custom polygons. A concave custom zone can clip with zero margin; a positive inset is explicitly flagged as invalid rather than pretending to detect a safe seam.
- True 3D fabric geometry, bulk artwork sets, ZIP exports, undo/redo, cloud-backed artwork drafts and individual accounts/roles.

## Validation

Run `npm run qa:mockups` and `npm run build`. Responsive browser review on a real phone/desktop is still required before claiming visual parity; static QA cannot establish screenshot fidelity.
