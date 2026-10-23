export type Confirmation = { title: string; description: string; accept: string; destructive?: boolean }
let pending: Confirmation | null = null
let resolvePending: ((value: boolean) => void) | undefined
const listeners = new Set<() => void>()
export const confirmationSnapshot = () => pending
export const subscribeConfirmation = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function settleConfirmation(accepted: boolean) {
  const resolve = resolvePending
  pending = null; resolvePending = undefined
  listeners.forEach(listener => listener())
  resolve?.(accepted)
}
/** Destructive actions are explicit DOM dialogs, never browser-blocking APIs. */
export function requestConfirmation(options: Confirmation): Promise<boolean> {
  if (pending) return Promise.resolve(false)
  return new Promise(resolve => {
    pending = options; resolvePending = resolve
    listeners.forEach(listener => listener())
  })
}
