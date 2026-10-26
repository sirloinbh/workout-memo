import { createRoot } from 'react-dom/client';
import { App } from './app';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// The service worker (public/sw.js, centrally managed) only runs in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
