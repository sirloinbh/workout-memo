import { lazyPage } from './lazy-page';

// #375: each page is its own chunk. The app preloads the rest when the browser is idle.
export const Analysis = lazyPage(() => import('./analysis').then((m) => m.Analysis));
export const Backup = lazyPage(() => import('./backup').then((m) => m.Backup));
export const BodyMeasurements = lazyPage(() => import('./body').then((m) => m.BodyMeasurements));
export const Settings = lazyPage(() => import('./settings').then((m) => m.Settings));
export const Routines = lazyPage(() => import('./routines').then((m) => m.Routines));
export const DashboardPage = lazyPage(() =>
  import('./workspace/dashboard-page').then((m) => m.DashboardPage),
);
export const GoalsPage = lazyPage(() => import('./workspace/goals-page').then((m) => m.GoalsPage));
export const JournalPage = lazyPage(() =>
  import('./workspace/journal-page').then((m) => m.JournalPage),
);
export const MachinesPage = lazyPage(() =>
  import('./workspace/machines-page').then((m) => m.MachinesPage),
);

const all = [
  Analysis,
  Backup,
  BodyMeasurements,
  Routines,
  DashboardPage,
  GoalsPage,
  JournalPage,
  MachinesPage,
];
/** Loads every page chunk; failures are ignored here because the page itself reports them when opened. */
export const preloadPages = () => Promise.allSettled(all.map((page) => page.preload()));
