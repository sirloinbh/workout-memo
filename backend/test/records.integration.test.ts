import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { listenApp } from './listen.js';

// #477: saving a log answers which of its sets beat the best earlier estimated 1RM of the exercise.
test(
  'saving a log reports new strength records',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = await listenApp(createApp(pool));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api/workouts';
    const exercise = 'Record-' + randomUUID();
    const ids: number[] = [];
    const save = async (date: string, weight: number, reps = 5) => {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date,
          title: 'Record check',
          notes: '',
          sets: [{ exercise, machine_id: null, weight, reps, notes: '' }],
        }),
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as { id: number; records: { position: number }[] };
      ids.push(body.id);
      return body.records;
    };
    try {
      assert.deepEqual(await save('2040-05-02', 100), []);
      const beaten = await save('2040-05-03', 105);
      assert.equal(beaten.length, 1);
      assert.equal(beaten[0].position, 0);
      assert.deepEqual(await save('2040-05-04', 105), []);
      assert.deepEqual(await save('2040-05-01', 90), []);
    } finally {
      for (const id of ids) await pool.query('DELETE FROM workouts WHERE id=$1', [id]);
      server.close();
      await pool.end();
    }
  },
);

// #484: the record board answers from saved sets.
test(
  'GET /api/records lists the best estimated 1RM and heaviest set',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = await listenApp(createApp(pool));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api';
    const exercise = 'Board-' + randomUUID();
    const ids: number[] = [];
    try {
      for (const [date, weight] of [
        ['2020-02-01', 80],
        ['2020-02-08', 90],
      ] as const) {
        const res = await fetch(base + '/workouts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            date,
            title: 'Board check',
            notes: '',
            sets: [{ exercise, machine_id: null, weight, reps: 5, notes: '' }],
          }),
        });
        ids.push(((await res.json()) as { id: number }).id);
      }
      const board = (await (await fetch(base + '/records')).json()) as {
        records: { exercise: string; max_weight: { value: number; date: string } }[];
      };
      const mine = board.records.find((r) => r.exercise === exercise);
      assert.equal(mine?.max_weight.value, 90);
      assert.equal(mine?.max_weight.date, '2020-02-08');
    } finally {
      for (const id of ids) await pool.query('DELETE FROM workouts WHERE id=$1', [id]);
      server.close();
      await pool.end();
    }
  },
);
