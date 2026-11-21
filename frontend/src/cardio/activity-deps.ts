// #387: where activity-file.ts gets the ZIP and FIT libraries. The page loads them on demand
// (activity-deps-lazy.ts); the Web Worker imports them statically (activity-worker.ts), because a
// worker bundle cannot code-split. Each entry point registers its loaders before reading.
export type ActivityDeps = {
  fflate: () => Promise<typeof import('fflate')>;
  fit: () => Promise<typeof import('@garmin/fitsdk')>;
};
const unset = () => Promise.reject(new Error('The activity file readers are not loaded'));
export const deps: ActivityDeps = { fflate: unset, fit: unset };
