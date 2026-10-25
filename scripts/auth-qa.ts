import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AUTH_STORAGE_KEY, appAuthRequired, appFetch, isAppRequest, readAppSession, rememberAppSession, signOut } from '../src/components/auth/session'
import { fetchCloudCatalogue, readCloudConnection, rememberCloudConnection } from '../src/components/mockups/mockupCloud'

class MemoryStorage {
  entries = new Map<string, string>()
  getItem(key: string) { return this.entries.get(key) ?? null }
  setItem(key: string, value: string) { this.entries.set(key, value) }
  removeItem(key: string) { this.entries.delete(key) }
}
const local = new MemoryStorage(), session = new MemoryStorage()
Object.assign(globalThis, { localStorage: local, sessionStorage: session, window: new EventTarget() })
assert.equal(appAuthRequired(), true)
const access = { user: 'owner', token: 'gas3d.unit-test-signed-session', expiresAt: Math.floor(Date.now() / 1000) + 3600 }
rememberAppSession(access, true)
assert.deepEqual(readAppSession(), access)
assert.ok(local.getItem(AUTH_STORAGE_KEY), 'Remembered access must survive reopening the browser')
assert.equal(session.getItem(AUTH_STORAGE_KEY), null)
rememberAppSession(access, false)
assert.equal(local.getItem(AUTH_STORAGE_KEY), null, 'Switching to temporary access must remove persistent access')
assert.ok(session.getItem(AUTH_STORAGE_KEY))
const managed = readCloudConnection()!
assert.equal(managed.managed, true, 'A GAS3D session must supply the catalogue connection without a provider-key form')
assert.equal(managed.url, 'https://api.gas3d.example')
session.setItem('gas3d.mockup-cloud.session.v1', JSON.stringify({ url: 'https://old.example', token: 'legacy-private-key-fixture' }))
session.setItem('unrelated-project-data', 'keep')
rememberCloudConnection(managed)
assert.equal(session.getItem('gas3d.mockup-cloud.session.v1'), null, 'Do not duplicate managed credentials in legacy connection storage')
assert.equal(session.getItem('unrelated-project-data'), 'keep', 'Removing obsolete connector access must preserve other saved data')
assert.ok(isAppRequest('https://api.gas3d.example/api/mockups/products'))
for (const url of ['https://evil.example/api/mockups/products', 'https://api.gas3d.example.evil.test/api/mockups', 'https://api.gas3d.example/public']) {
  assert.equal(isAppRequest(url), false, 'App access must never be attached to unrelated destinations')
}
const nativeFetch = globalThis.fetch
const requests: { url: string; headers: Headers }[] = []
try {
  globalThis.fetch = async (input, options = {}) => {
    requests.push({ url: String(input), headers: new Headers(options.headers) })
    return new Response(JSON.stringify({ cloudName: 'test-cloud', records: [] }), { status: 200 })
  }
  await fetchCloudCatalogue(managed)
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer ' + access.token)
  assert.ok(!requests[0].url.includes(access.token))
  await appFetch('https://api.gas3d.example/api/subtitles/jobs', { headers: { 'X-AI-Session-ID': 'existing-job-id' } })
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer ' + access.token)
  assert.equal(requests[1].headers.get('X-AI-Session-ID'), 'existing-job-id', 'Keep existing subtitle request context')
  await appFetch('https://evil.example/api/mockups/products', { headers: { Authorization: 'Bearer ' + access.token } })
  assert.equal(requests[2].headers.get('Authorization'), null)
  await assert.rejects(() => fetchCloudCatalogue({ ...managed, url: 'https://evil.example' }), /servidor de GAS3D/, 'Managed catalogue access cannot be redirected to a different server')
  const renewed = { ...access, token: 'gas3d.renewed-unit-test-session' }
  rememberAppSession(renewed, true)
  await fetchCloudCatalogue(managed)
  assert.equal(requests[3].headers.get('Authorization'), 'Bearer ' + renewed.token, 'Catalogue requests must use current session access, not an obsolete connection token')
  globalThis.fetch = async () => new Response('{}', { status: 401 })
  await appFetch('https://api.gas3d.example/api/mockups/products')
  assert.equal(readAppSession(), null, 'An invalid API session must return the app to login')
  assert.equal(readCloudConnection(), null)
} finally { globalThis.fetch = nativeFetch }
rememberAppSession({ ...access, expiresAt: Math.floor(Date.now() / 1000) - 1 }, true)
assert.equal(readAppSession(), null)
rememberAppSession(access, true)
signOut()
assert.equal(local.getItem(AUTH_STORAGE_KEY), null)
assert.equal(session.getItem(AUTH_STORAGE_KEY), null)
assert.equal(readAppSession(), null)
const source = (path: string) => readFileSync(path, 'utf8')
assert.ok(source('src/main.tsx').includes('<AuthGate><App /></AuthGate>'), 'All modules must be gated before mounting their local data')
assert.ok(source('src/components/navigation/AppLauncher.tsx').includes('Cerrar sesión'), 'Logout must stay in the shared compact launcher')
assert.ok(source('src/components/auth/AuthGate.tsx').includes('autoComplete="current-password"'), 'Use a real accessible password field')
assert.ok(!source('src/components/subtitles/api.ts').includes('await fetch('), 'Every subtitle API operation must carry app session access')
console.log('GAS3D access QA passed: session persistence, automatic private catalogue, request scope, expiry, logout and module gate.')
