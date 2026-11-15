import './index.css';

import { createRoot } from 'react-dom/client';

import { App } from './app';
import { registerServiceWorker } from './service-worker';

createRoot(document.getElementById('root')!).render(<App />);

// The service worker (public/sw.js, centrally managed) only runs in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void registerServiceWorker());
}
