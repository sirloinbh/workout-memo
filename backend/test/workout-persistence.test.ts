import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

test(
  'workout persistence and atomic edits',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    let pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    let server = createApp(pool).listen(0, '127.0.0.1');
    const listening = () => new Promise<void>((resolve) => server.once('listening', resolve));
    await listening();
    const close = () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const title = `Workout-${randomUUID()}`;
    const brand = await pool.query('INSERT INTO brands(name) VALUES($1) RETURNING id', [title]);
    const brandId = brand.rows[0].id;
    let machineId: number | undefined;
    let workoutId: number | undefined;
    try {
      const machine = await call('/machines', 'POST', {
        brand_id: brandId,
        name: title,
        base_weight: 20,
      });
      assert.equal(machine.status, 201);
      machineId = machine.data.id;
      const original = {
        date: '2024-02-29',
        title,
        notes: '일지 메모',
        sets: [
          {
            exercise: '레그 프레스',
            machine_id: machineId,
            weight: 120.25,
            reps: 10,
            notes: '첫 세트',
          },
          { exercise: '스쿼트', machine_id: null, weight: 0, reps: 12, notes: '맨몸 세트' },
          { exercise: '런지', machine_id: null, weight: 20, reps: 10, notes: '삭제할 세트' },
        ],
      };
      const created = await call('/workouts', 'POST', original);
      assert.equal(created.status, 201);
      workoutId = created.data.id;
      const read = async (date: string) => {
        const response = await call(`/workouts?from=${date}&to=${date}`);
        assert.equal(response.status, 200);
        return response.data.find((w: { id: number }) => w.id === workoutId);
      };
      const assertRecord = (actual: typeof original, expected: typeof original) => {
        assert.ok(actual);
        assert.equal(actual.date, expected.date);
        assert.equal(actual.title, expected.title);
        assert.equal(actual.notes, expected.notes);
        assert.deepEqual(
          actual.sets.map((s) => ({
            exercise: s.exercise,
            machine_id: s.machine_id,
            weight: Number(s.weight),
            reps: s.reps,
            notes: s.notes,
          })),
          expected.sets,
        );
      };
      await t.test(
        'creation round trips date, ordered sets, total kg, machine and both types of notes',
        async () => {
          assertRecord(await read(original.date), original);
        },
      );
      const edited = {
        ...original,
        date: '2024-03-01',
        title: title + '-edited',
        notes: '수정한 일지 메모',
        sets: [
          {
            ...original.sets[1],
            exercise: '핵 스쿼트',
            machine_id: machineId,
            weight: 40.5,
            reps: 8,
            notes: '순서 변경 및 세트 수정',
          },
          { ...original.sets[0], weight: 130, notes: '두 번째로 이동' },
        ],
      };
      await t.test(
        'editing moves the date and replaces sets without leaving stale rows',
        async () => {
          assert.equal((await call(`/workouts/${workoutId}`, 'PUT', edited)).status, 200);
          assert.equal(await read(original.date), undefined);
          assert.equal(
            (await pool.query('SELECT id FROM sets WHERE workout_id=$1', [workoutId])).rowCount,
            edited.sets.length,
          );
          assertRecord(await read(edited.date), edited);
        },
      );
      await t.test(
        'failure on a later set restores the entire previous journal and sets',
        async () => {
          const before = await read(edited.date);
          const absentMachine = 2147483647;
          assert.equal(
            (await pool.query('SELECT id FROM machines WHERE id=$1', [absentMachine])).rowCount,
            0,
          );
          const failed = {
            ...edited,
            date: '2024-03-02',
            title: title + '-must-rollback',
            notes: '저장되면 안 됨',
            sets: [edited.sets[0], { ...edited.sets[1], machine_id: absentMachine }],
          };
          assert.equal((await call(`/workouts/${workoutId}`, 'PUT', failed)).status, 400);
          assert.deepEqual(await read(edited.date), before);
          assert.equal(await read(failed.date), undefined);
          assert.equal((await call('/workouts', 'POST', failed)).status, 400);
          assert.equal(
            (await pool.query('SELECT id FROM workouts WHERE title=$1', [failed.title])).rowCount,
            0,
          );
        },
      );
      await t.test('fresh API and database connections retain saved records', async () => {
        const before = await read(edited.date);
        await close();
        await pool.end();
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        server = createApp(pool).listen(0, '127.0.0.1');
        await listening();
        assert.deepEqual(await read(edited.date), before);
        assertRecord(await read(edited.date), edited);
      });
      await t.test('deleting a journal removes its sets and subsequent reads', async () => {
        assert.equal((await call(`/workouts/${workoutId}`, 'DELETE')).status, 200);
        assert.equal(await read(edited.date), undefined);
        assert.equal(
          (await pool.query('SELECT id FROM sets WHERE workout_id=$1', [workoutId])).rowCount,
          0,
        );
        assert.equal((await call(`/workouts/${workoutId}`, 'DELETE')).status, 404);
        assert.equal((await call(`/workouts/${workoutId}`, 'PUT', edited)).status, 404);
      });
    } finally {
      try {
        if (workoutId) await pool.query('DELETE FROM workouts WHERE id=$1', [workoutId]);
        if (machineId) await pool.query('DELETE FROM machines WHERE id=$1', [machineId]);
        await pool.query('DELETE FROM brands WHERE id=$1', [brandId]);
      } finally {
        await close();
        await pool.end();
      }
    }
  },
);
