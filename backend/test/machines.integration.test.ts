import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { volume } from '../src/domain.js';

test(
  'machine API persists brand and NULL/zero/positive base weight without changing historical totals',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    const machineIds: number[] = [];
    let workoutId: number | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('server');
      const call = async (path: string, method = 'GET', body?: unknown) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      };
      const brands = await call('/brands');
      assert.equal(brands.status, 200);
      const arsenal = brands.data.find(
        (brand: { name: string }) => brand.name === 'Arsenal Strength',
      );
      assert.ok(arsenal, 'Arsenal Strength must be available for selection');
      const otherBrand = brands.data.find((brand: { id: number }) => brand.id !== arsenal.id);
      assert.ok(otherBrand, 'A second brand must be available for selection');
      const name = `Issue19-${randomUUID()}`;
      const body = { brand_id: arsenal.id, name, notes: 'Test fixture, not manufacturer data' };

      await t.test('create and re-query unknown, zero and positive base weights', async () => {
        for (const [index, base_weight] of [null, 0, 20.25].entries()) {
          const created = await call('/machines', 'POST', {
            ...body,
            name: `${name}-${index}`,
            base_weight,
          });
          assert.equal(created.status, 201);
          machineIds.push(created.data.id);
          const list = await call('/machines');
          assert.equal(list.status, 200);
          const stored = list.data.find(
            (machine: { id: number }) => machine.id === created.data.id,
          );
          assert.ok(stored);
          assert.equal(stored.brand_id, arsenal.id);
          assert.equal(stored.brand, 'Arsenal Strength');
          assert.equal(
            stored.base_weight === null ? null : Number(stored.base_weight),
            base_weight,
          );
          const row = await pool.query('SELECT base_weight FROM machines WHERE id=$1', [
            created.data.id,
          ]);
          assert.equal(
            row.rows[0].base_weight === null ? null : Number(row.rows[0].base_weight),
            base_weight,
          );
        }
      });
      assert.equal(machineIds.length, 3);

      const machineId = machineIds[2];
      const workout = await call('/workouts', 'POST', {
        date: '2026-10-14',
        title: name,
        sets: [{ exercise: name, machine_id: machineId, weight: 100, reps: 10 }],
      });
      assert.equal(workout.status, 201);
      workoutId = workout.data.id;
      const readSets = async () => {
        const list = await call('/workouts?from=2026-10-14&to=2026-10-14');
        assert.equal(list.status, 200);
        const stored = list.data.find((entry: { id: number }) => entry.id === workoutId);
        assert.ok(stored);
        return stored.sets.map(
          (set: { machine_id: number; weight: string | number; reps: number }) => ({
            machine_id: set.machine_id,
            weight: Number(set.weight),
            reps: set.reps,
          }),
        );
      };
      const originalSets = await readSets();
      assert.deepEqual(originalSets, [{ machine_id: machineId, weight: 100, reps: 10 }]);
      assert.equal(volume(originalSets), 1000, 'Base weight must not be added again during save');

      await t.test(
        'switching between unknown, zero and positive machines preserves total load',
        async () => {
          for (const selectedMachineId of machineIds) {
            const updated = await call(`/workouts/${workoutId}`, 'PUT', {
              date: '2026-10-14',
              title: name,
              sets: [{ exercise: name, machine_id: selectedMachineId, weight: 100, reps: 10 }],
            });
            assert.equal(updated.status, 200);
            const storedSets = await readSets();
            assert.deepEqual(storedSets, [
              { machine_id: selectedMachineId, weight: 100, reps: 10 },
            ]);
            assert.equal(volume(storedSets), 1000, 'Changing machine must not add its base weight');
          }
          assert.deepEqual(await readSets(), originalSets);
        },
      );

      await t.test(
        'edit brand and base weight, then clear to NULL without changing saved totals',
        async () => {
          for (const base_weight of [40.5, 0, null]) {
            const updated = await call(`/machines/${machineId}`, 'PUT', {
              ...body,
              brand_id: otherBrand.id,
              base_weight,
            });
            assert.equal(updated.status, 200);
            const list = await call('/machines');
            assert.equal(list.status, 200);
            const stored = list.data.find((machine: { id: number }) => machine.id === machineId);
            assert.equal(stored.brand_id, otherBrand.id);
            assert.equal(stored.brand, otherBrand.name);
            assert.equal(
              stored.base_weight === null ? null : Number(stored.base_weight),
              base_weight,
            );
            const row = await pool.query('SELECT base_weight FROM machines WHERE id=$1', [
              machineId,
            ]);
            assert.equal(
              row.rows[0].base_weight === null ? null : Number(row.rows[0].base_weight),
              base_weight,
              'Edited unknown and confirmed zero values must remain distinct in storage',
            );
            assert.deepEqual(await readSets(), originalSets);
            assert.equal(volume(await readSets()), 1000);
            const history = await pool.query(
              'SELECT machine_id, weight, reps FROM sets WHERE workout_id=$1 ORDER BY position',
              [workoutId],
            );
            assert.deepEqual(
              history.rows.map((set) => ({ ...set, weight: Number(set.weight) })),
              originalSets,
              'Editing machine metadata must preserve the stored historical total weight',
            );
          }
        },
      );

      await t.test('invalid edits leave both machine and workout unchanged', async () => {
        const before = (await call('/machines')).data.find(
          (machine: { id: number }) => machine.id === machineId,
        );
        for (const base_weight of [-1, 100000, '', '20', false, {}, [], undefined]) {
          assert.equal(
            (await call(`/machines/${machineId}`, 'PUT', { ...body, base_weight })).status,
            400,
          );
        }
        for (const [path, method] of [
          ['/machines', 'POST'],
          [`/machines/${machineId}`, 'PUT'],
        ]) {
          assert.equal(
            (await call(path, method, { ...body, brand_id: 2147483647, base_weight: null })).status,
            400,
          );
        }
        const list = await call('/machines');
        const stored = list.data.find((machine: { id: number }) => machine.id === machineId);
        assert.equal(stored.base_weight, null);
        assert.equal(stored.brand_id, otherBrand.id);
        assert.deepEqual(stored, before, 'Rejected edits must preserve all machine fields');
        assert.deepEqual(await readSets(), originalSets);
      });
    } finally {
      try {
        if (workoutId !== undefined)
          await pool.query('DELETE FROM workouts WHERE id=$1', [workoutId]);
        for (const machineId of machineIds)
          await pool.query('DELETE FROM machines WHERE id=$1', [machineId]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await pool.end();
      }
    }
  },
);
