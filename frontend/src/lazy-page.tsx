import { type ComponentType, lazy } from 'react';

/**
 * A page loaded on first use (#375). Until its chunk arrives the nearest Suspense shows its fallback; once
 * `preload()` has resolved (the app calls it when the browser is idle, tests call it up front) the page renders
 * at once, with no extra suspended render.
 */
export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  const preload = () =>
    load().then((component) => {
      loaded = component;
      return { default: component };
    });
  const Lazy = lazy(preload) as unknown as ComponentType<P>;
  const Page = (props: P) => {
    const Loaded = loaded;
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  };
  return Object.assign(Page, { preload });
}
