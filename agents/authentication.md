# GAS3D single-owner access

GAS3D has a username/password login in `src/components/auth/AuthGate.tsx`, wrapped around all modules in `src/main.tsx`. The existing API enforces access independently with `AuthenticationGuard` in `services/subtitle_engine/auth.py`. Hiding the UI is never the server's security boundary.

## Configuration and deployment

The existing Render Dashboard/MCP environment is the source of truth for live credentials. Merge only these keys; do not replace other variables or touch SolutionSuite:

- GAS3D frontend: `VITE_GAS3D_AUTH_REQUIRED=true`. `VITE_GAS3D_API_URL` optionally selects the API; otherwise the existing `VITE_SUBTITLE_API_URL` / `VITE_MOCKUP_API_URL` is used. These are public settings, never credentials.
- `gas3d-subtitle-api`: `GAS3D_AUTH_ENABLED=true`, `GAS3D_AUTH_USERNAME`, `GAS3D_AUTH_PASSWORD_HASH`, `GAS3D_AUTH_SECRET` (at least 32 random characters).
- Password hashes use salted PBKDF2-HMAC-SHA256 with 600,000 iterations; `password_hash()` creates the supported format. Never configure a cleartext password or put a password/hash/signing secret in frontend variables, Git, logs or screenshots.
- The existing Cloudinary server credentials and `MOCKUP_LIBRARY_TOKEN` remain unchanged.

The initial owner credentials are delivered in a private local file outside the repository with owner-only permissions. No new database, user-registration service or Cloudinary account is created. This is one owner account, not a multi-user/roles system.

Enable the API settings and the frontend flag together with the new deployment. The frontend fails closed if the authentication service is unavailable or unconfigured. Explicitly disabled authentication remains available for existing local-development configurations; it must not be disabled in production.

## Session and API contract

- `GET /api/auth/session` returns only configuration presence and the currently authenticated username/expiry; it never returns the signing secret, password hash or catalogue key.
- `POST /api/auth/login` checks the username/password, rate-limits attempts (8 per client in 5 minutes, with bounded in-process bookkeeping) and issues an ItsDangerous signed, expiring application token. Responses are not cacheable.
- Tokens last up to 7 days. **Recordar sesión** stores only application access in localStorage; without it, sessionStorage is used. The password is never stored by GAS3D in the browser. Tokens are sent in Authorization headers, never query parameters.
- Bearer access is used because the static frontend and API use different Render origins. This does not depend on cross-site cookies. Script access to browser storage remains part of the frontend trust boundary; do not add untrusted scripts or inject unescaped HTML.
- All `/api/` operations require a valid session when enabled, except login, session status and the two health endpoints. CORS preflights remain supported. The old private catalogue key retains its original scope only for `/api/mockups/` compatibility; it cannot authenticate subtitle or other APIs.
- Changing the username, password hash or signing secret revokes existing application tokens. Logout in the shared launcher removes access from the current browser and preserves all original local media and saved projects. Copied bearer tokens remain valid until expiry or credential rotation; this basic implementation has no per-token revocation database.
- A 401 from a protected request returns the app to login. Access is only attached to the configured GAS3D API, never arbitrary asset/service origins. Existing subtitle session headers remain intact.

## Automatic catalogue

After GAS3D login, `useMockupCloud` derives a managed catalogue connection from application access and loads the existing products automatically. The production library has no Cloudinary URL/key form or disconnect action. Refresh/save/recovery still use the existing revision-aware catalogue, original photo downloads and exact ownership rules. PNG artwork and mockup drafts remain local, as before. Existing local/remote products are not reset or rebound during login/logout.

The old manual connection UI and private key contract remain available only when application authentication is explicitly disabled for development/backwards compatibility.

## Checks

- `npm run qa:auth`: session persistence/expiry/logout, managed catalogue loading, current token refresh, credential destination restrictions, subtitle header compatibility and the all-module gate.
- `npm run qa:mockups`: existing geometry, storage, cloud merge and source preservation regressions.
- `PYTHONPATH=services python -m unittest subtitle_engine.test_auth subtitle_engine.test_mockup_library -v`: anonymous rejection, valid/invalid/expired/tampered sessions, credential rotation, rate limits, exact original photo delivery, product save/reload/delete, legacy scope, cloud failure and SolutionSuite isolation.
- `npm run build` includes the frontend checks; the existing backend workflow includes authentication tests.

24 October 2026 validation: 18 backend tests pass, and an actual local Uvicorn instance was exercised through login, session validation, automatic catalogue retrieval and anonymous rejection. Browser tools reported no available browser, so desktop/mobile visual checks could not be run for this change. Do not describe the new login screen as visually/device validated until that review occurs.

Provider/algorithm references: [ItsDangerous timed signatures](https://itsdangerous.palletsprojects.com/en/stable/timed/), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
