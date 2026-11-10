import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import {
  cardioKinds,
  cardioSessionSchema,
  cardioSessionSchemaFor,
  cardioSources,
  fieldErrors,
} from '../src/contract.js';

// #114: cardio input rules and route behavior without PostgreSQL. The DB side (constraints,
// FK, partial unique index) is covered by cardio.integration.test.ts.
const today = '2026-11-08';
const valid = { date: '2026-11-08', kind: 'running', duration_sec: 1800 };
const errorsOf = (input: unknown, schema = cardioSessionSchemaFor(today)) => {
  const parsed = schema.safeParse(input);
  assert.equal(parsed.success, false, JSON.stringify(input));
  return fieldErrors(parsed.error!);
};

test('a minimal cardio session gets nulls, not zeros, for every missing value', () => {
  assert.deepEqual(cardioSessionSchemaFor(today).parse(valid), {
    ...valid,
    start_time: null,
    distance_km: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    calories_kcal: null,
    elevation_gain_m: null,
    avg_cadence: null,
    effort: null,
    workout_id: null,
    source: 'manual',
    external_id: null,
    memo: '',
  });
});

test('all nine kinds and four sources are accepted; anything else is a Korean 400 message', () => {
  assert.deepEqual(cardioKinds, [
    'running',
    'walking',
    'outdoor_cycling',
    'indoor_cycling',
    'rowing',
    'stairs',
    'elliptical',
    'swimming',
    'other',
  ]);
  for (const kind of cardioKinds)
    assert.equal(cardioSessionSchema.safeParse({ ...valid, kind }).success, true, kind);
  for (const source of cardioSources)
    assert.equal(
      cardioSessionSchema.safeParse({
        ...valid,
        source,
        external_id: source === 'manual' ? null : 'a1',
      }).success,
      true,
      source,
    );
  assert.match(errorsOf({ ...valid, kind: 'skiing' }).kind, /러닝·걷기.*수영·기타 중에서 선택/);
  assert.match(errorsOf({ ...valid, kind: undefined }).kind, /선택하세요/);
  assert.match(errorsOf({ ...valid, source: 'strava', external_id: 'x' }).source, /출처/);
});

test('duration is a positive whole number of seconds up to 24 hours', () => {
  for (const duration_sec of [0, -1, 1.5, 86401, '1800', null, Infinity])
    assert.match(
      errorsOf({ ...valid, duration_sec }).duration_sec,
      /운동 시간/,
      String(duration_sec),
    );
  assert.match(errorsOf({ ...valid, duration_sec: undefined }).duration_sec, /운동 시간/);
  for (const duration_sec of [1, 86400])
    assert.equal(cardioSessionSchema.safeParse({ ...valid, duration_sec }).success, true);
});

test('distance is km with at most three decimals (1 m)', () => {
  for (const distance_km of [0, -0.5, 1000.001])
    assert.match(errorsOf({ ...valid, distance_km }).distance_km, /거리는 0 km보다 크고/);
  assert.match(errorsOf({ ...valid, distance_km: 5.0005 }).distance_km, /셋째 자리/);
  assert.equal(cardioSessionSchema.parse({ ...valid, distance_km: 0.025 }).distance_km, 0.025);
  assert.equal(cardioSessionSchema.parse({ ...valid, distance_km: 1000 }).distance_km, 1000);
});

test('the date must be a real date and not after today (injected), unlike strength workouts', () => {
  assert.match(errorsOf({ ...valid, date: '2026-11-09' }).date, /오늘 이후로 입력할 수 없습니다/);
  assert.match(errorsOf({ ...valid, date: '2026-02-30' }).date, /올바른 날짜/);
  assert.match(errorsOf({ ...valid, date: '2026-11-8' }).date, /YYYY-MM-DD/);
  // Today itself and earlier days are fine; another injected today moves the limit.
  assert.equal(cardioSessionSchemaFor(today).safeParse(valid).success, true);
  assert.equal(
    cardioSessionSchemaFor('2026-11-09').safeParse({ ...valid, date: '2026-11-09' }).success,
    true,
  );
});

test('heart rate is 30~250 bpm and the maximum is not below the average', () => {
  for (const avg_heart_rate of [29, 251, 120.5])
    assert.match(errorsOf({ ...valid, avg_heart_rate }).avg_heart_rate, /30~250 bpm/);
  assert.match(errorsOf({ ...valid, max_heart_rate: 300 }).max_heart_rate, /30~250 bpm/);
  assert.match(
    errorsOf({ ...valid, avg_heart_rate: 160, max_heart_rate: 150 }).max_heart_rate,
    /최대 심박은 평균 심박보다 낮을 수 없습니다/,
  );
  for (const hr of [
    { avg_heart_rate: 150, max_heart_rate: 150 },
    { avg_heart_rate: 150 },
    { max_heart_rate: 150 },
  ])
    assert.equal(cardioSessionSchema.safeParse({ ...valid, ...hr }).success, true);
});

test('other optional values have bounds and the memo a length limit', () => {
  assert.match(errorsOf({ ...valid, calories_kcal: -1 }).calories_kcal, /0~20000 kcal/);
  assert.match(errorsOf({ ...valid, elevation_gain_m: 10001 }).elevation_gain_m, /0~10000 m/);
  assert.match(errorsOf({ ...valid, avg_cadence: 0 }).avg_cadence, /1~300/);
  assert.match(errorsOf({ ...valid, effort: 'tired' }).effort, /힘듦·중간·쉬움/);
  assert.match(errorsOf({ ...valid, start_time: '24:00' }).start_time, /HH:MM/);
  assert.match(errorsOf({ ...valid, start_time: '7:30' }).start_time, /HH:MM/);
  assert.match(errorsOf({ ...valid, memo: 'x'.repeat(2001) }).memo, /2000자/);
  assert.match(errorsOf({ ...valid, workout_id: 0 }).workout_id, /근력 일지/);
  const full = cardioSessionSchema.parse({
    ...valid,
    start_time: '23:59',
    calories_kcal: 0,
    elevation_gain_m: 0,
    effort: 'hard',
    workout_id: 3,
  });
  assert.equal(full.calories_kcal, 0, 'A real 0 is kept');
  assert.equal(full.start_time, '23:59');
});

test('only imported sessions carry an external id, trimmed and 1~200 characters', () => {
  assert.match(
    errorsOf({ ...valid, external_id: 'abc' }).external_id,
    /직접 입력한 기록\(manual\)에는 외부 ID를 넣지 않습니다/,
  );
  assert.match(errorsOf({ ...valid, source: 'garmin', external_id: '   ' }).external_id, /외부 ID/);
  assert.match(
    errorsOf({ ...valid, source: 'garmin', external_id: 'x'.repeat(201) }).external_id,
    /200자/,
  );
  assert.equal(
    cardioSessionSchema.parse({ ...valid, source: 'nike', external_id: ' n-1 ' }).external_id,
    'n-1',
  );
  // A file import may have no id of its own.
  assert.equal(cardioSessionSchema.safeParse({ ...valid, source: 'file' }).success, true);
});

// Fake pool: a query handler and a client for the PUT transaction. No database needed.
type Call = { sql: string; params?: unknown[] };
async function withApi(
  handle: (sql: string, params?: unknown[]) => unknown,
  run: (base: string, calls: Call[], released: () => number) => Promise<void>,
) {
  const calls: Call[] = [];
  let releases = 0;
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return handle(sql, params);
  };
  const pool = {
    query,
    connect: async () => ({ query, release: () => releases++ }),
  } as unknown as Pool;
  const server = createApp(pool, { today: () => today }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/api/cardio-sessions`, calls, () => releases);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
async function call(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as { error?: string } };
}

test('invalid input, a future date and bad ids are a 400 before any query', async () => {
  await withApi(
    () => ({ rows: [], rowCount: 0 }),
    async (base, calls) => {
      const future = await call(base, 'POST', { ...valid, date: '2026-11-09' });
      assert.deepEqual(future, {
        status: 400,
        body: { error: '유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다' },
      });
      assert.equal((await call(base, 'POST', { ...valid, duration_sec: 0 })).status, 400);
      assert.equal(
        (await call(base + '/1', 'PUT', { ...valid, duration_sec: -5 })).status,
        400,
        'PUT validates before opening a transaction',
      );
      for (const [path, method] of [
        ['/1e3', 'GET'],
        ['/0', 'DELETE'],
        ['/07', 'PUT'],
      ])
        assert.deepEqual(await call(base + path, method, valid), {
          status: 400,
          body: { error: '유산소 기록 ID가 올바르지 않습니다' },
        });
      for (const query of [
        '?from=2026-11-01',
        '?from=2026-11-08&to=2026-11-01',
        '?from=2026-11-01&to=2026-11-08&kind=skiing',
      ])
        assert.equal((await call(base + query)).status, 400, query);
      assert.equal(calls.length, 0);
    },
  );
});

test('create, list with a kind filter, get, delete and 404s', async () => {
  const row = { id: 7, ...valid, pace_sec_per_km: null, speed_kmh: null };
  await withApi(
    (sql, params) => {
      if (sql.startsWith('INSERT')) return { rows: [row], rowCount: 1 };
      if (sql.startsWith('SELECT'))
        return params?.[0] === 7 ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      if (sql.startsWith('DELETE')) return { rows: [], rowCount: params?.[0] === 7 ? 1 : 0 };
      throw new Error('unexpected ' + sql);
    },
    async (base, calls) => {
      const created = await call(base, 'POST', { ...valid, distance_km: 5, effort: 'easy' });
      assert.deepEqual(created, { status: 201, body: row });
      assert.deepEqual(calls[0].params, [
        '2026-11-08',
        null,
        'running',
        1800,
        5,
        null,
        null,
        null,
        null,
        null,
        'easy',
        null,
        'manual',
        null,
        '',
      ]);
      // Pace and speed are computed in SQL from the stored values, never stored.
      assert.match(calls[0].sql, /RETURNING[\s\S]*pace_sec_per_km[\s\S]*speed_kmh/);

      await call(base + '?from=2026-11-01&to=2026-11-08&kind=rowing');
      assert.deepEqual(calls[1].params, ['2026-11-01', '2026-11-08', 'rowing']);
      await call(base + '?from=2026-11-01&to=2026-11-08');
      assert.deepEqual(calls[2].params, ['2026-11-01', '2026-11-08', null]);

      assert.deepEqual(await call(base + '/7'), { status: 200, body: row });
      assert.deepEqual(await call(base + '/8'), {
        status: 404,
        body: { error: '유산소 기록을 찾을 수 없습니다' },
      });
      assert.deepEqual(await call(base + '/7', 'DELETE'), { status: 200, body: { ok: true } });
      assert.deepEqual(await call(base + '/8', 'DELETE'), {
        status: 404,
        body: { error: '유산소 기록을 찾을 수 없습니다' },
      });
    },
  );
});

test('a duplicate external id is a 409 and an unknown workout link a 400', async () => {
  for (const [error, status, message] of [
    [
      { code: '23505', constraint: 'cardio_sessions_source_external_id_key' },
      409,
      '같은 출처와 외부 ID의 유산소 기록이 이미 있습니다',
    ],
    [
      { code: '23503', constraint: 'cardio_sessions_workout_id_fkey' },
      400,
      '연결할 근력 일지가 존재하지 않습니다',
    ],
  ] as const)
    await withApi(
      () => Promise.reject(Object.assign(new Error('db'), error)),
      async (base) => {
        const body = { ...valid, source: 'garmin', external_id: 'g-1', workout_id: 3 };
        assert.deepEqual(await call(base, 'POST', body), { status, body: { error: message } });
      },
    );
});

test('update is a full replacement inside a transaction that rolls back on 404 and errors', async () => {
  const replaced = { id: 7, ...valid, kind: 'walking' };
  await withApi(
    (sql, params) => {
      if (sql.startsWith('SELECT id FROM cardio_sessions'))
        return {
          rows: params?.[0] === 7 || params?.[0] === 9 ? [{ id: params[0] }] : [],
          rowCount: params?.[0] === 7 || params?.[0] === 9 ? 1 : 0,
        };
      if (sql.startsWith('UPDATE') && params?.[15] === 9)
        return Promise.reject(
          Object.assign(new Error('dup'), {
            code: '23505',
            constraint: 'cardio_sessions_source_external_id_key',
          }),
        );
      if (sql.startsWith('UPDATE')) return { rows: [replaced], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async (base, calls, released) => {
      const body = { ...valid, kind: 'walking' };
      assert.deepEqual(await call(base + '/7', 'PUT', body), { status: 200, body: replaced });
      const steps = calls.map((c) => c.sql.split(/\s/)[0]);
      assert.deepEqual(steps, ['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
      assert.match(calls[1].sql, /FOR UPDATE/);
      // Omitted optional values are sent as null: the stored ones are replaced, not kept.
      assert.deepEqual(calls[2].params?.slice(4, 15), [
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'manual',
        null,
        '',
      ]);

      calls.length = 0;
      assert.deepEqual(await call(base + '/8', 'PUT', body), {
        status: 404,
        body: { error: '유산소 기록을 찾을 수 없습니다' },
      });
      assert.deepEqual(
        calls.map((c) => c.sql.split(/\s/)[0]),
        ['BEGIN', 'SELECT', 'ROLLBACK'],
      );

      calls.length = 0;
      const duplicate = await call(base + '/9', 'PUT', {
        ...body,
        source: 'garmin',
        external_id: 'g-1',
      });
      assert.equal(duplicate.status, 409);
      assert.deepEqual(
        calls.map((c) => c.sql.split(/\s/)[0]),
        ['BEGIN', 'SELECT', 'UPDATE', 'ROLLBACK'],
      );
      assert.equal(released(), 3, 'Every transaction releases its client');
    },
  );
});

test('records: registered before /:id, three queries, ±2% window in NUMERIC, longest in kind order', async () => {
  await withApi(
    (sql, params) => {
      if (sql.includes('DISTINCT ON (kind)'))
        return {
          rows: [
            { kind: 'swimming', id: 3, date: '2026-10-01', distance_km: 1.5, duration_sec: 2400 },
            { kind: 'running', id: 1, date: '2026-11-02', distance_km: 21.1, duration_sec: 7380 },
          ],
        };
      if (params?.[0] === 5)
        return { rows: [{ id: 2, date: '2026-11-03', distance_km: 5.1, duration_sec: 1500 }] };
      return { rows: [] };
    },
    async (base, calls) => {
      assert.deepEqual(await call(base + '/records'), {
        status: 200,
        body: {
          longest: [
            { kind: 'running', id: 1, date: '2026-11-02', distance_km: 21.1, duration_sec: 7380 },
            { kind: 'swimming', id: 3, date: '2026-10-01', distance_km: 1.5, duration_sec: 2400 },
          ],
          best5k: { id: 2, date: '2026-11-03', distance_km: 5.1, duration_sec: 1500 },
          best10k: null,
        },
      });
      assert.equal(calls.length, 3, '"records" is not parsed as an id');
      const best = calls.filter((c) => c.params);
      assert.deepEqual(
        best.map((c) => c.params),
        [[5], [10]],
      );
      for (const c of best) {
        assert.match(c.sql, /kind='running'/);
        assert.match(c.sql, /BETWEEN \$1::numeric \* 0\.98 AND \$1::numeric \* 1\.02/);
        assert.match(c.sql, /ORDER BY duration_sec, date, id LIMIT 1/);
      }
      assert.match(calls[0].sql, /WHERE distance_km IS NOT NULL ORDER BY kind, distance_km DESC/);
    },
  );
});

// #119: POST /api/cardio-sessions/import saves every row or none.
const imported = (external_id: string, extra = {}) => ({
  ...valid,
  source: 'file',
  external_id,
  ...extra,
});
type ImportAnswer = { error?: string; rows?: { index: number; message: string }[] };

test('an import refuses invalid rows by index before any query', async () => {
  await withApi(
    () => ({ rows: [], rowCount: 0 }),
    async (base, calls) => {
      const answer = await call(`${base}/import`, 'POST', {
        sessions: [
          imported('a'),
          imported('b', { duration_sec: 0 }),
          { ...valid },
          imported('a'),
          imported('c', { date: '2026-11-09' }),
        ],
      });
      assert.deepEqual(answer, {
        status: 400,
        body: {
          error: '4건에 문제가 있어 아무것도 저장하지 않았습니다',
          rows: [
            { index: 1, message: '운동 시간은 1~86400초(24시간) 사이의 정수 초로 입력하세요' },
            { index: 2, message: '가져온 기록에는 출처(file·garmin·nike)와 외부 ID가 필요합니다' },
            { index: 3, message: '1번째 행과 같은 활동입니다' },
            { index: 4, message: '유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다' },
          ],
        } satisfies ImportAnswer,
      });
      for (const [body, error] of [
        [{}, '가져올 유산소 기록 목록(sessions)을 배열로 보내세요'],
        [{ sessions: [] }, '가져올 유산소 기록을 1건 이상 선택하세요'],
        [
          { sessions: Array.from({ length: 201 }, (_, i) => imported(`x${i}`)) },
          '유산소 기록은 한 번에 200건까지 가져올 수 있습니다',
        ],
      ] as const)
        assert.deepEqual(await call(`${base}/import`, 'POST', body), {
          status: 400,
          body: { error },
        });
      assert.equal(calls.length, 0);
    },
  );
});

test('an import of an activity already saved rolls back and names the row', async () => {
  await withApi(
    (sql) =>
      sql.includes('unnest')
        ? { rows: [{ source: 'file', external_id: 'b' }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    async (base, calls, released) => {
      const answer = await call(`${base}/import`, 'POST', {
        sessions: [imported('a'), imported('b')],
      });
      assert.deepEqual(answer, {
        status: 409,
        body: {
          error: '1건에 문제가 있어 아무것도 저장하지 않았습니다',
          rows: [{ index: 1, message: '이미 가져온 활동입니다' }],
        },
      });
      assert.deepEqual(
        calls.map((c) => c.sql.trim().split(/\s/)[0]),
        ['BEGIN', 'SELECT', 'ROLLBACK'],
      );
      assert.deepEqual(calls[1].params, [
        ['file', 'file'],
        ['a', 'b'],
      ]);
      assert.equal(released(), 1);
    },
  );
});

test('an import saves every row in one transaction and answers them in order', async () => {
  let id = 0;
  await withApi(
    (sql, params) =>
      sql.startsWith('INSERT')
        ? { rows: [{ id: ++id, external_id: params![13] }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    async (base, calls, released) => {
      const answer = await call(`${base}/import`, 'POST', {
        sessions: [imported('a'), imported('b', { distance_km: 4.006, start_time: '07:10' })],
      });
      assert.deepEqual(answer, {
        status: 201,
        body: {
          sessions: [
            { id: 1, external_id: 'a' },
            { id: 2, external_id: 'b' },
          ],
        },
      } as never);
      assert.deepEqual(
        calls.map((c) => c.sql.trim().split(/\s/)[0]),
        ['BEGIN', 'SELECT', 'INSERT', 'INSERT', 'COMMIT'],
      );
      assert.equal(released(), 1);
    },
  );
});

test('an import of 200 rows with full memos fits its own body limit, beyond the app-wide 256kb', async () => {
  let id = 0;
  await withApi(
    (sql) =>
      sql.startsWith('INSERT') ? { rows: [{ id: ++id }], rowCount: 1 } : { rows: [], rowCount: 0 },
    async (base) => {
      const memo = '가'.repeat(2000);
      const sessions = Array.from({ length: 200 }, (_, i) => imported(`m${i}`, { memo }));
      // About 1.2 MB of UTF-8, over the app-wide 256kb limit.
      assert.ok(Buffer.byteLength(JSON.stringify({ sessions })) > 1024 * 1024);
      const answer = await call(`${base}/import`, 'POST', { sessions });
      assert.equal(answer.status, 201);
      assert.equal((answer.body as { sessions: unknown[] }).sessions.length, 200);
    },
  );
});

test('an import over its 2MB body limit names that limit', async () => {
  await withApi(
    () => ({ rows: [], rowCount: 0 }),
    async (base, calls) => {
      const sessions = [imported('big', { memo: 'x'.repeat(3 * 1024 * 1024) })];
      assert.deepEqual(await call(`${base}/import`, 'POST', { sessions }), {
        status: 413,
        body: { error: '요청 크기 제한을 초과했습니다 (가져오기는 한 번에 최대 2MB).' },
      });
      assert.equal(calls.length, 0);
    },
  );
});
