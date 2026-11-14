import React from 'react';
import { renderToString } from 'react-dom/server';

// App.jsx expects browser location during render. The homepage SSR always renders
// the public landing route; browser-only effects do not run on the server.
if (!globalThis.window) {
  globalThis.window = { location: { pathname: '/', hash: '', search: '' }, history: { replaceState() {}, pushState() {} } };
}

export async function renderHomepage(country) {
  const { default: App } = await import('./App.jsx');
  const previous = {
    rendering: globalThis.window.__ADMAFIA_IS_SERVER_RENDER__,
    country: globalThis.window.__ADMAFIA_COUNTRY__,
  };
  globalThis.window.__ADMAFIA_IS_SERVER_RENDER__ = true;
  globalThis.window.__ADMAFIA_COUNTRY__ = country;
  try {
    return renderToString(React.createElement(App, { initialCountry: country }));
  } finally {
    globalThis.window.__ADMAFIA_IS_SERVER_RENDER__ = previous.rendering;
    globalThis.window.__ADMAFIA_COUNTRY__ = previous.country;
  }
}
