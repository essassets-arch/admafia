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

const rootElement = document.getElementById('root');

const app = (
  <StrictMode>
    <App initialCountry={window.__ADMAFIA_COUNTRY__ || null} />
  </StrictMode>
);

// Determine whether server-rendered homepage DOM should be hydrated.
// Hydration is ONLY valid if the client is on the plain public landing page with no sub-route,
// no hash (#login, #register, #sales, #app), and no active user session.
const hasRouteHash = typeof window !== 'undefined' && Boolean(window.location.hash);
const isHomepagePath = typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '/index.html');
const hasActiveSession = typeof window !== 'undefined' && Boolean(
  localStorage.getItem('growthline_active_user') || localStorage.getItem('growthline_admin_session')
);

const shouldHydrate = Boolean(
  window.__ADMAFIA_SSR__ &&
  isHomepagePath &&
  !hasRouteHash &&
  !hasActiveSession &&
  rootElement &&
  rootElement.hasChildNodes()
);

if (shouldHydrate) {
  try {
    hydrateRoot(rootElement, app, {
      onRecoverableError(err) {
        // Silently recover if browser extensions or minor attribute mismatches occur
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Hydration Recoverable]:', err?.message || err);
        }
      },
    });
  } catch (err) {
    // If hydration fails, seamlessly recover via client-side mount
    createRoot(rootElement).render(app);
  }
} else {
  createRoot(rootElement).render(app);
}
