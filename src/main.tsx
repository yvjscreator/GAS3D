import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { NotificationHost } from './components/ui/NotificationHost'
import './styles.css'
import './advanced.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /><NotificationHost /></StrictMode>)
