import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LockKeyhole, LogIn, RefreshCw } from 'lucide-react'
import { AUTH_CHANGED, AUTH_STORAGE_KEY, appApiRoot, appAuthRequired, readAppSession, rememberAppSession, type AppSession } from './session'
import './auth.css'

export function AuthGate({ children }: { children: ReactNode }) {
  const required = appAuthRequired()
  const [session, setSession] = useState<AppSession | null>(readAppSession)
  const [verified, setVerified] = useState(!required)
  const [checking, setChecking] = useState(required)
  const [issue, setIssue] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!required) return
    const changed = () => {
      const next = readAppSession()
      setSession(next)
      if (!next) setVerified(false)
    }
    const storageChanged = (event: StorageEvent) => { if (event.key === AUTH_STORAGE_KEY) { changed(); setAttempt(old => old + 1) } }
    window.addEventListener(AUTH_CHANGED, changed)
    window.addEventListener('storage', storageChanged)
    return () => { window.removeEventListener(AUTH_CHANGED, changed); window.removeEventListener('storage', storageChanged) }
  }, [required])

  useEffect(() => {
    if (!required) return
    const controller = new AbortController(), saved = readAppSession()
    void (async () => {
      setChecking(true); setVerified(false); setIssue('')
      try {
        const response = await fetch(appApiRoot() + '/api/auth/session', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
          headers: saved ? { Authorization: 'Bearer ' + saved.token } : {},
        })
        if (!response.ok) throw new Error('No se pudo verificar el acceso. Reintentá en unos momentos.')
        const result = await response.json() as { enabled?: boolean; configured?: boolean; user?: string; expiresAt?: number }
        if (!result.enabled || !result.configured) throw new Error('El acceso a GAS3D todavía no está configurado en el servidor.')
        if (controller.signal.aborted) return
        if (saved && result.user === saved.user && result.expiresAt === saved.expiresAt) {
          setSession(saved); setVerified(true)
        } else { rememberAppSession(null); setSession(null); setVerified(false) }
      } catch (error) {
        if (!controller.signal.aborted) { setVerified(false); setIssue(error instanceof Error ? error.message : 'No se pudo conectar con GAS3D.') }
      } finally { if (!controller.signal.aborted) setChecking(false) }
    })()
    return () => controller.abort()
  }, [required, attempt])

  useEffect(() => {
    if (!required || !session) return
    const timer = window.setTimeout(() => rememberAppSession(null), Math.max(0, session.expiresAt * 1000 - Date.now()))
    return () => window.clearTimeout(timer)
  }, [required, session])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setIssue('')
    try {
      const response = await fetch(appApiRoot() + '/api/auth/login', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(90_000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { detail?: unknown } | null
        throw new Error(typeof error?.detail === 'string' ? error.detail : 'No se pudo iniciar sesión. Reintentá.')
      }
      const next = await response.json() as AppSession
      if (!next.token?.startsWith('gas3d.') || !next.user || !(next.expiresAt * 1000 > Date.now())) throw new Error('El servidor devolvió una sesión inválida.')
      rememberAppSession(next, remember); setSession(next); setVerified(true); setPassword('')
    } catch (error) { setIssue(error instanceof Error ? error.message : 'No se pudo conectar con GAS3D.') }
    finally { setBusy(false) }
  }

  if (!required || (verified && session)) return children
  return <main className="gas-auth-page">
    <section className="gas-auth-card" aria-labelledby="gas-auth-title">
      <div className="gas-auth-heading"><LockKeyhole size={25} aria-hidden="true"/><div><strong>GAS3D</strong><h1 id="gas-auth-title">Iniciar sesión</h1></div></div>
      <p>Entrá a tus herramientas y a tu catálogo de prendas.</p>
      {checking ? <div role="status" className="gas-auth-checking">Verificando acceso…</div> : <form onSubmit={event => void login(event)}>
        <label>Usuario<input autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={128} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={issue ? 'gas-auth-issue' : undefined} /></label>
        <label className="gas-auth-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)} />Recordar sesión en este dispositivo</label>
        {issue && <p id="gas-auth-issue" className="gas-auth-issue" role="alert">{issue}</p>}
        <div className="gas-auth-actions"><button type="submit" disabled={busy}><LogIn size={17}/>{busy ? 'Ingresando…' : 'Entrar'}</button>
          {issue && <button type="button" className="gas-auth-retry" disabled={busy} onClick={() => setAttempt(old => old + 1)}><RefreshCw size={16}/>Reintentar conexión</button>}</div>
        <small>La sesión dura hasta 7 días. El catálogo se carga automáticamente al entrar.</small>
      </form>}
    </section>
  </main>
}
