import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { listenApp } from './listen.js';
import { routineInput } from './routine-fixture.js';

// #117 part 3: /api/routine-progress judges a routine's cardio against the saved cardio
// records. A far-future Monday (later than the other integration tests' routines) keeps this
// routine the active one; the records are inserted directly because the API refuses dates
// after the real today.
const start = '2099-03-02';

test(
  'routine progress marks cardio items from saved cardio records and sums them up',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const memo = `Routine117-${randomUUID()}`;
    let routineId: number | undefined;
    const server = await listenApp(createApp(pool, { today: () => '2099-03-04' }));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    try {
      const input = routineInput(1);
      input.name = memo;
      input.start_date = start;
      const created = await call('/routines', 'POST', {
        ...input,
        splits: [
          {
            ...input.splits[0],
            cardio: [
              { kind: 'running', intensity: 'zone2', minutes: 30 },
              { kind: 'rowing', intensity: 'recovery', distance_km: 5 },
            ],
          },
        ],
      });
      assert.equal(created.status, 201);
      routineId = created.data.id;
      // Session 1 (03-02, window to 03-03): the run meets 30 min, a 4.999 km row falls short.
      // Session 2 (today 03-04): a 5 km row; the window is still open for the run.
      for (const [date, kind, seconds, km] of [
        ['2099-03-02', 'running', 1800, null],
        ['2099-03-03', 'rowing', 2400, 4.999],
        ['2099-03-04', 'rowing', 1500, 5],
      ] as const)
        await pool.query(
          'INSERT INTO cardio_sessions(date, kind, duration_sec, distance_km, memo) VALUES($1,$2,$3,$4,$5)',
          [date, kind, seconds, km, memo],
        );

      const { status, data } = await call('/routine-progress');
      assert.equal(status, 200);
      assert.equal(data.routine.id, routineId);
      const results = (data.days as { target: { cardio: { result: string | null }[] } | null }[])
        .filter((d) => d.target)
        .slice(0, 2)
        .map((d) => d.target!.cardio.map((c) => c.result));
      assert.deepEqual(results, [
        ['achieved', 'missed'],
        [null, 'achieved'],
      ]);
      assert.deepEqual(data.cardio_summary, { done: 2, planned: 4 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        await pool.query('DELETE FROM cardio_sessions WHERE memo=$1', [memo]);
        if (routineId) await pool.query('DELETE FROM routines WHERE id=$1', [routineId]);
      } finally {
        await pool.end();
      }
    }
  },
);
