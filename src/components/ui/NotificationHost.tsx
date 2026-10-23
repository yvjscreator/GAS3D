import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Toaster } from 'sileo'
import { confirmationSnapshot, settleConfirmation, subscribeConfirmation } from './confirmation'
import 'sileo/styles.css'
import './notifications.css'

export function NotificationHost() {
  const request = useSyncExternalStore(subscribeConfirmation, confirmationSnapshot)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), descriptionId = useId()
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
    <Toaster position="bottom-left" offset={{ left: 68, bottom: 12 }} theme="light" options={{ fill: '#1c2c3b', roundness: 14, autopilot: { expand: 0, collapse: 10000 } }} />
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
