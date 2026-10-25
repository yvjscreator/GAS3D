export type AppSession = { token: string; user: string; expiresAt: number }
export const AUTH_STORAGE_KEY = 'gas3d.access.v1'
export const AUTH_CHANGED = 'gas3d:access-changed'
let memory: AppSession | null = null
export const appAuthRequired = () => import.meta.env?.VITE_GAS3D_AUTH_REQUIRED === 'true'
export const appApiRoot = () => String(import.meta.env?.VITE_GAS3D_API_URL ?? import.meta.env?.VITE_SUBTITLE_API_URL ?? import.meta.env?.VITE_MOCKUP_API_URL ?? '').replace(/\/$/, '')

export function readAppSession(): AppSession | null {
  let raw: unknown = memory
  try { raw = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? sessionStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') }
  catch { /* Restricted storage keeps the current in-memory session usable. */ }
  if (!raw || typeof raw !== 'object') return null
  const session = raw as Partial<AppSession>
  return typeof session.token === 'string' && session.token.startsWith('gas3d.') && typeof session.user === 'string'
    && typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt) && session.expiresAt * 1000 > Date.now() ? session as AppSession : null
}

export function rememberAppSession(session: AppSession | null, persistent = false) {
  memory = session ? { token: session.token, user: session.user, expiresAt: session.expiresAt } : null
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    if (memory) (persistent ? localStorage : sessionStorage).setItem(AUTH_STORAGE_KEY, JSON.stringify(memory))
  } catch { /* Storage permission is optional; never retain the password. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGED))
}

/** Attach app access only to the configured GAS3D API, never arbitrary destinations. */
export function isAppRequest(input: string) {
  const root = appApiRoot()
  if (!root) return input.startsWith('/api/') && !input.startsWith('//')
  try {
    const url = new URL(input, root)
    return url.origin === new URL(root).origin && url.pathname.startsWith('/api/')
  } catch { return false }
}

export async function appFetch(input: string, options: RequestInit = {}) {
  const session = readAppSession(), headers = new Headers(options.headers)
  const trusted = isAppRequest(input)
  if (!trusted && headers.get('Authorization')?.startsWith('Bearer gas3d.')) headers.delete('Authorization')
  const authenticated = appAuthRequired() && session && trusted
  if (authenticated) headers.set('Authorization', 'Bearer ' + session.token)
  const response = await fetch(input, { ...options, headers })
  if (response.status === 401 && authenticated && readAppSession()?.token === session.token) rememberAppSession(null)
  return response
}

export const signOut = () => rememberAppSession(null)
