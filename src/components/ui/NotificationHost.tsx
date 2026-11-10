import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Toaster } from 'sileo'
import { confirmationSnapshot, settleConfirmation, subscribeConfirmation } from './confirmation'
import 'sileo/styles.css'
import './notifications.css'

export function NotificationHost() {
  const request = useSyncExternalStore(subscribeConfirmation, confirmationSnapshot)
  const notices = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), descriptionId = useId()
  useEffect(() => {
    const root = notices.current
    if (!root) return
    // Sileo renders notices as buttons. Keep the live announcements without tab stops.
    const skipNotices = () => {
      for (const toast of root.querySelectorAll<HTMLElement>('[data-sileo-toast]:not([tabindex="-1"])')) {
        toast.tabIndex = -1
      }
    }
    const observer = new MutationObserver(skipNotices)
    observer.observe(root, { childList: true, subtree: true })
    skipNotices()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!request || !dialog.current) return
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    element.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
    const cancel = () => settleConfirmation(false)
    window.addEventListener('hashchange', cancel)
    return () => {
      element.close(); previous?.focus()
      window.removeEventListener('hashchange', cancel)
    }
  }, [request])
  return createPortal(<>
    <div ref={notices}>
      <Toaster position="top-center" offset={{ top: 'env(safe-area-inset-top, 0px)' }} theme="light"
        options={{ fill: '#152331', roundness: 22, autopilot: { expand: 180, collapse: 10000 } }} />
    </div>
    {request && <dialog ref={dialog} className="gas-confirmation" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); settleConfirmation(false) }}>
      <form onSubmit={event => { event.preventDefault(); settleConfirmation(true) }}>
        <h2 id={titleId}>{request.title}</h2>
        <p id={descriptionId}>{request.description}</p>
        <div><button type="button" data-cancel onClick={() => settleConfirmation(false)}>Cancelar</button>
          <button type="submit" className={request.destructive ? 'is-destructive' : 'is-primary'}>{request.accept}</button></div>
      </form>
    </dialog>}
  </>, document.body)
}
