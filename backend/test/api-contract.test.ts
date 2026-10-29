import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

// Routes are only registered here, never called, so no database is needed.
function registeredRoutes() {
  const app = createApp({} as Pool) as unknown as { router: { stack: Layer[] } };
  return app.router.stack
    .flatMap((layer) =>
      layer.route
        ? Object.keys(layer.route.methods).map(
            (method) => `${method.toUpperCase()} ${layer.route!.path}`,
          )
        : [],
    )
    .sort();
}

async function documentedRoutes() {
  const doc = await readFile(new URL('../../docs/api.md', import.meta.url), 'utf8');
  return [...doc.matchAll(/^\| (GET|POST|PUT|DELETE)\s+\| `(\/api\/[^`]+)`/gm)]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort();
}

test('docs/api.md lists exactly the registered API routes', async () => {
  const routes = registeredRoutes();
  assert.ok(routes.includes('POST /api/workouts'), 'route discovery must find workout routes');
  const documented = await documentedRoutes();
  assert.equal(new Set(documented).size, documented.length, 'each route is documented once');
  assert.deepEqual(
    routes.filter((route) => !documented.includes(route)),
    [],
    'registered but missing from docs/api.md',
  );
  assert.deepEqual(
    documented.filter((route) => !routes.includes(route)),
    [],
    'documented but not registered',
  );
});

test('route modules keep every API path under /api', () => {
  for (const route of registeredRoutes()) assert.match(route, /^(GET|POST|PUT|DELETE) \/api\//);
});
