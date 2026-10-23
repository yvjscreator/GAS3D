# Mockup Studio — personal Cloudinary catalogue

## Scope and isolation

The existing GAS3D Python API also serves `/api/mockups`. Cloudinary stores authenticated original photographs and authenticated raw JSON product snapshots (names/types, six views, zones/polygons, silhouette, margins and calibration). PNG artwork and mockup placement drafts remain browser-local. No new database, disk or Render service is needed. Uploads do not resize/transcode originals; downloads verify their SHA-256.

**The shared Cloudinary account does not share SolutionSuite assets.** The fixed public-ID namespace is `gas3d/mockup-studio/v1/`. Media Library folders are `GAS3D/Mockup Studio/Photos` and `GAS3D/Mockup Studio/Products` (placement depends on legacy/dynamic folder mode). Safety relies on exact public IDs, authenticated delivery type, product ownership and SHA-256, not folder labels. Clients cannot submit a Cloudinary public ID to delete. There is no arbitrary-prefix or account-wide deletion. Unknown files, other products, public-delivery assets and SolutionSuite resources are excluded.

## Configuration

In **gas3d-subtitle-api → Environment**, set `CLOUDINARY_URL`, or all three existing account variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Also set `MOCKUP_LIBRARY_TOKEN` to a random private catalogue access key of at least 24 characters. Preserve the existing Gemini variables and ensure `SUBTITLE_CORS_ORIGINS` includes `https://gas3d.onrender.com`. Deploy the API after updating its environment.

Keep secrets server-side, outside Git, never in `VITE_` variables. No unsigned upload preset is needed. `/api/mockups/health` reports configuration presence without exposing credentials; this alone does not verify external authentication. `/api/subtitles/health` is unchanged.

The frontend accepts `VITE_MOCKUP_API_URL=https://gas3d-subtitle-api.onrender.com`, falling back to `VITE_SUBTITLE_API_URL` or the development same-origin proxy. Alternatively enter the HTTPS server origin in the connection form. The catalogue key is entered as a password and kept in `sessionStorage`, never query strings, manifests or source. This is a shared personal access key, not individual user accounts/roles: holders can manage the catalogue.

## Workflow and recovery

1. Connect in **Productos → Catálogo en Cloudinary** with the GAS3D API URL and access key. Remote products appear and existing local products are retained.
2. **Subir pendientes** migrates local products and their photographs. **Guardar en nube** saves one product. A badge identifies unsaved changes. Source images are preserved during migration.
3. On another device connect with the same URL/key. **Actualizar catálogo** gets later edits; original photos download into IndexedDB as needed, including for full-size export.
4. After removing/replacing a photo, save the product to delete its obsolete cloud photo. The new snapshot commits before any old photo is removed.
5. Product deletion confirms the all-devices scope, commits a tiny tombstone and deletes its owned cloud photos. Tombstones prevent stale devices from recreating deleted products. Partial photo deletion stays visible/retryable.
6. Refresh preserves offline edits; stale saves/deletes return 409. Duplicate local work to keep another version, or explicitly **Recuperar de nube** to discard local product edits. Recovery preserves local artwork PNGs.

Cloud failures retain local work. Undownloaded photos need a connection for their first use. Disconnecting ends session access without deleting cached products. Clearing browser data removes unsynced products, artwork and drafts; cloud-saved templates can be downloaded again.

## Storage, limits and validation

Photo IDs are immutable and content-addressed per product/view. Snapshots carry a revision, application marker and schema version. A read failure is never interpreted as an empty catalogue or permission to overwrite. Interrupted uploads are retained after ambiguous failures; a later save/delete discovers unused files only within the same product's exact namespace and retries cleanup.

Run **one API instance and one Uvicorn worker**, as in the existing Render service. A process lock serializes writes and revision checks. This is not a distributed transaction: use transactional revision storage before adding processes/instances. Avoid concurrent edits during deployments, when old/new instances may briefly overlap. Cloudinary account rate/asset limits apply; failures must remain visible and retryable.

- `npm run qa:mockups` also tests remote restoration, offline edits, tombstones, account isolation and authenticated requests.
- `PYTHONPATH=services python -m unittest subtitle_engine.test_mockup_library -v` (API requirements plus `httpx`) mocks Cloudinary; covers originals/settings, pagination, replacement/removal, failed writes, retryable deletion, revision conflicts, authentication, error redaction and foreign/SolutionSuite references. No real secrets needed.
- `.github/workflows/mockup-library.yml` runs backend tests for API changes.
- A real Cloudinary smoke test verified save, fresh manifest/original read, identical SHA-256 and deletion of a temporary GAS3D photo. Browser and deployment validation are separate.

Provider reference: [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference).
