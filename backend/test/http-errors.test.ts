import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

// #172: the API answers with the central standard/http.ts shapes. A fake pool stands in for
// PostgreSQL, so these run without a test database.
type Query = (sql: string) => unknown;

async function withApi(query: Query, run: (base: string, queries: string[]) => Promise<void>) {
  const queries: string[] = [];
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      return query(sql);
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/api`, queries);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  return { status: response.status, body: (await response.json()) as unknown };
}

test('an unknown /api path is a JSON 404, not an HTML page', async () => {
  await withApi(
    () => ({ rows: [] }),
    async (base) => {
      for (const path of ['/nope', '/goals/1/extra']) {
        assert.deepEqual(await call(base + path), {
          status: 404,
          body: { error: '요청한 API를 찾을 수 없습니다' },
        });
      }
      // Paths that do exist keep working.
      assert.equal((await call(base + '/goals')).status, 200);
    },
  );
});

test('a path id must be plain digits; others are a 400 that names the record, before any query', async () => {
  await withApi(
    () => ({ rows: [], rowCount: 1 }),
    async (base, queries) => {
      for (const [path, label] of [
        ['/goals/1e3', '목표'],
        ['/goals/%207%20', '목표'],
        ['/goals/0', '목표'],
        ['/goals/-1', '목표'],
        ['/body-measurements/1.5', '신체 기록'],
        ['/workouts/abc', '일지'],
      ]) {
        assert.deepEqual(await call(base + path, { method: 'DELETE' }), {
          status: 400,
          body: { error: `${label} ID가 올바르지 않습니다` },
        });
      }
      assert.deepEqual(await call(base + '/routines/07'), {
        status: 400,
        body: { error: '루틴 ID가 올바르지 않습니다' },
      });
      assert.equal(queries.length, 0);
    },
  );
});

test('deleting a goal that is not there answers 404 with an error message', async () => {
  let rowCount = 0;
  await withApi(
    () => ({ rows: [], rowCount }),
    async (base) => {
      assert.deepEqual(await call(base + '/goals/5', { method: 'DELETE' }), {
        status: 404,
        body: { error: '목표를 찾을 수 없습니다' },
      });
      rowCount = 1;
      assert.deepEqual(await call(base + '/goals/5', { method: 'DELETE' }), {
        status: 200,
        body: { ok: true },
      });
    },
  );
});

test('app messages for missing references and storage failures keep the { error } shape', async () => {
  let failure: unknown;
  await withApi(
    () => {
      throw failure;
    },
    async (base) => {
      failure = Object.assign(new Error('fk'), {
        code: '23503',
        constraint: 'machines_official_weight_id_fkey',
      });
      assert.deepEqual(await call(base + '/goals'), {
        status: 400,
        body: { error: '선택한 공식 참고값이 존재하지 않습니다' },
      });
      failure = Object.assign(new Error('fk'), {
        code: '23503',
        constraint: 'sets_machine_id_fkey',
      });
      assert.deepEqual(await call(base + '/goals'), {
        status: 400,
        body: { error: '선택한 머신 또는 브랜드가 존재하지 않습니다' },
      });
      // The internal message stays in the log; the response is the central 500 text.
      failure = new Error('connect ECONNREFUSED 10.0.0.1:5432');
      const original = console.error;
      console.error = () => {};
      try {
        assert.deepEqual(await call(base + '/goals'), {
          status: 500,
          body: { error: '서버 오류가 발생했습니다' },
        });
      } finally {
        console.error = original;
      }
    },
  );
});

test('a malformed JSON body is a 400 from the central handler', async () => {
  await withApi(
    () => ({ rows: [] }),
    async (base) => {
      assert.deepEqual(
        await call(base + '/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        }),
        { status: 400, body: { error: '요청 본문의 JSON 형식이 올바르지 않습니다' } },
      );
    },
  );
});
