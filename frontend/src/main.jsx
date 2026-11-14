import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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

const rootElement = document.getElementById('root');
if (rootElement) {
  const app = (
    <StrictMode>
      <App initialCountry={window.__ADMAFIA_COUNTRY__ || null} />
    </StrictMode>
  );

  // Mount cleanly with createRoot. This guarantees zero React hydration mismatches (Error #418),
  // protects against browser extensions (Autopik, adblockers, translators) mutating the initial DOM,
  // while retaining full instant-paint and search-engine indexability from server-side rendered HTML.
  createRoot(rootElement).render(app);
}
