import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { workoutSchema } from '../src/domain.js';

// #83: one feedback level per workout (hard · medium · easy); missing stays NULL.
const workout = {
  date: '2026-10-15',
  title: '하체',
  sets: [{ exercise: '스쿼트', weight: 100, reps: 10 }],
};
const invalid = ['tired', '', 0, 1, true, 'HARD'];

test('a missing feedback stays null and only the three levels are accepted', () => {
  assert.equal(workoutSchema.parse(workout).feedback, null);
  for (const feedback of [null, 'hard', 'medium', 'easy'])
    assert.equal(workoutSchema.parse({ ...workout, feedback }).feedback, feedback);
  for (const feedback of invalid) {
    const parsed = workoutSchema.safeParse({ ...workout, feedback });
    assert.equal(parsed.success, false, `feedback ${String(feedback)}`);
    assert.match(parsed.error!.issues[0].message, /힘듦·중간·쉬움/);
  }
});

async function listen(pool: Pool) {
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    call: async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

test('invalid feedback is rejected by the API before any write', async () => {
  let writes = 0;
  const pool = {
    query: async () => {
      writes++;
      throw Error('Invalid feedback must not reach persistence');
    },
    connect: async () => {
      writes++;
      throw Error('Invalid feedback must not reach persistence');
    },
  } as unknown as Pool;
  const api = await listen(pool);
  try {
    for (const feedback of invalid)
      for (const [method, path] of [
        ['POST', '/workouts'],
        ['PUT', '/workouts/1'],
      ]) {
        const response = await api.call(path, method, { ...workout, version: 1, feedback });
        assert.equal(response.status, 400, `${method} feedback ${String(feedback)}`);
      }
    assert.equal(writes, 0);
  } finally {
    await api.close();
  }
});

test(
  'feedback is saved, changed and cleared with the workout',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const api = await listen(pool);
    const title = `Feedback83-${randomUUID()}`;
    const date = '2001-04-02';
    type Saved = { title: string; feedback: string | null };
    const read = async () =>
      ((await api.call(`/workouts?from=${date}&to=${date}`)).data as Saved[]).find(
        (w) => w.title === title,
      )!;
    try {
      const created = await api.call('/workouts', 'POST', {
        ...workout,
        date,
        title,
        feedback: 'hard',
      });
      assert.equal(created.status, 201);
      assert.equal((await read()).feedback, 'hard');
      const changed = await api.call(`/workouts/${created.data.id}`, 'PUT', {
        ...workout,
        date,
        title,
        version: 1,
        feedback: 'easy',
      });
      assert.equal(changed.status, 200);
      assert.equal((await read()).feedback, 'easy');
      // An older client that does not send feedback clears it to not recorded, not a level.
      const cleared = await api.call(`/workouts/${created.data.id}`, 'PUT', {
        ...workout,
        date,
        title,
        version: 2,
      });
      assert.equal(cleared.status, 200);
      assert.equal((await read()).feedback, null);
    } finally {
      try {
        await pool.query('DELETE FROM workouts WHERE title=$1', [title]);
      } finally {
        await api.close();
        await pool.end();
      }
    }
  },
);
