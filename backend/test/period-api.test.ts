import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';

test('workout range rejects malformed and reversed dates before querying storage', async () => {
  let queries = 0;
  const pool = {
    query: async () => {
      queries++;
      return { rows: [] };
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const query of [
      'from=2024-02-30&to=2024-03-01',
      'from=2024-2-01&to=2024-03-01',
      'from=2024-02-29',
      'from=2025-01-05&to=2024-12-30',
    ]) {
      const response: Response = await fetch(
        `http://127.0.0.1:${address.port}/api/workouts?${query}`,
      );
      assert.equal(response.status, 400, query);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    assert.equal(queries, 0);
    const response: Response = await fetch(
      `http://127.0.0.1:${address.port}/api/workouts?from=2024-02-29&to=2024-02-29`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
