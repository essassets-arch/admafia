import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'tabulator-tables/dist/css/tabulator_simple.min.css'
import './styles/master-tokens.css'
import './index.css'
import App from './App.jsx'
import './components/smart-tabulator.css'
import './admin/admin-theme.css'
import './responsive-fixes.css'

// Unregister only stale legacy service workers while preserving Firebase FCM Push SW
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      const scriptUrl =
        reg.active?.scriptURL ||
        reg.waiting?.scriptURL ||
        reg.installing?.scriptURL ||
        '';
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        reg.unregister();
      }
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
