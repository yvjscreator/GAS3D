import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { NotificationHost } from './components/ui/NotificationHost'
import { AuthGate } from './components/auth/AuthGate'
import './styles.css'
import './advanced.css'
createRoot(document.getElementById('root')!).render(<StrictMode><AuthGate><App /></AuthGate><NotificationHost /></StrictMode>)
