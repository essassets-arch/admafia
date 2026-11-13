import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Automatically unregister stale or broken service workers that reject FetchEvents
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
    }
  }).catch(() => {});
}

const rootElement = document.getElementById('root')
const app = (
  <StrictMode>
    <App initialCountry={window.__ADMAFIA_COUNTRY__ || null} />
  </StrictMode>
)

if (window.__ADMAFIA_SSR__) {
  hydrateRoot(rootElement, app)
} else {
  createRoot(rootElement).render(app)
}
