import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
// Side-effect import: starts listening for `beforeinstallprompt` immediately.
// Chrome fires it before React mounts, so this has to run at boot.
import '@/lib/install'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Register the service worker — makes the app installable to the home screen
// and lets it receive push notifications. Non-fatal if it fails.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
