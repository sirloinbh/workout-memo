import { toast } from './components/ui/sonner';

// #109: registers public/sw.js (centrally managed) and tells the user when a new version takes over.
// The worker never answers /api/ requests, so sign-in responses (#303) always come from the server.
type Container = Pick<ServiceWorkerContainer, 'controller' | 'addEventListener' | 'register'>;

export function registerServiceWorker(
  onUpdate: () => void = showUpdateNotice,
  container: Container = navigator.serviceWorker,
) {
  // The first install also fires controllerchange (sw.js claims open pages), so only a page that
  // was already controlled is running an older version when the new worker takes over.
  if (container.controller)
    container.addEventListener('controllerchange', onUpdate, { once: true });
  return container.register('/sw.js');
}

// No automatic reload: the open page may hold unsaved input (user decision in #109).
export function showUpdateNotice() {
  toast('A new version is available', {
    id: 'app-update',
    description: 'Reload when you are ready. A workout you are logging is kept as a draft.',
    duration: Infinity,
    action: { label: 'Reload', onClick: () => location.reload() },
  });
}
