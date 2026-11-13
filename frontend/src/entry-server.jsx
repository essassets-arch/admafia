import React from 'react';
import { renderToString } from 'react-dom/server';

// App.jsx expects browser location during render. The homepage SSR always renders
// the public landing route; browser-only effects do not run on the server.
if (!globalThis.window) {
  globalThis.window = {
    __ADMAFIA_IS_SERVER_RENDER__: true,
    location: { pathname: '/', hash: '', search: '' },
    history: { replaceState() {}, pushState() {} },
  };
}

export async function renderHomepage(country) {
  const { default: App } = await import('./App.jsx');
  return renderToString(React.createElement(App, { initialCountry: country }));
}
