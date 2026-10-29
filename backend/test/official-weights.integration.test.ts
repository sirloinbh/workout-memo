import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

const migration = readFileSync(
  new URL('../../database/migrations/009_official_machine_weights.sql', import.meta.url),
  'utf8',
);
// #87: 013 updates rows 009 left unverified, so a re-run applies both in order.
const followup = readFileSync(
  new URL('../../database/migrations/013_official_weights_followup.sql', import.meta.url),
  'utf8',
);

test(
  'official references are read with sources and never overwrite user weights or past totals',
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

      const all = await call('/official-machine-weights');
      assert.equal(all.status, 200);
      const hammer = await call('/official-machine-weights?brand=Hammer%20Strength');
      assert.equal(hammer.status, 200);
      assert.ok(hammer.data.length > 0);
      assert.ok(hammer.data.every((r: { brand: string }) => r.brand === 'Hammer Strength'));
      const bench = hammer.data.find((r: { model_number: string }) => r.model_number === 'IL-BP');
      await t.test('verified reference keeps raw value, kg, basis and official source', () => {
        assert.ok(bench);
        assert.equal(bench.status, 'verified');
        assert.equal(Number(bench.raw_value), 7);
        assert.equal(bench.raw_unit, 'lb');
        assert.equal(Number(bench.weight_kg), 3.18);
        assert.equal(bench.basis, 'per_arm');
        assert.match(bench.source_url, /^https:\/\/www\.lifefitness\.com\//);
        assert.equal(bench.checked_date, '2026-10-19');
      });
      const unverified = all.data.find((r: { status: string }) => r.status === 'unverified');
      await t.test('unverified reference is NULL with a reason, distinct from 0 kg', () => {
        assert.ok(unverified);
        assert.equal(unverified.raw_value, null);
        assert.equal(unverified.weight_kg, null);
        assert.ok(unverified.notes.length > 0);
      });
      await t.test('database constraints reject unsourced or reasonless rows', async () => {
        const insert = (status: string, raw: number | null, url: string | null, notes: string) =>
          pool.query(
            `INSERT INTO official_machine_weights(brand,lineup,model_name,official_item_name,status,raw_value,raw_unit,weight_kg,basis,source_url,checked_date,notes)
             VALUES('Test','Test',$1,'Starting Resistance',$2,$3,$4,$3,$5,$6,'2026-10-19',$7)`,
            [
              randomUUID(),
              status,
              raw,
              raw === null ? null : 'kg',
              raw === null ? null : 'per_arm',
              url,
              notes,
            ],
          );
        await assert.rejects(insert('verified', 5, null, ''), 'verified needs a source');
        await assert.rejects(insert('verified', 5, 'http://example.com', ''), 'https only');
        await assert.rejects(insert('unverified', null, null, ''), 'unverified needs a reason');
        await assert.rejects(insert('unverified', 0, null, 'reason'), 'unverified is NULL, not 0');
      });

      const name = `Issue29-${randomUUID()}`;
      const brands = await call('/brands');
      const hammerBrand = brands.data.find((b: { name: string }) => b.name === 'Hammer Strength');
      assert.ok(hammerBrand);
      for (const base_weight of [null, 0, 20.25]) {
        const created = await call('/machines', 'POST', {
          brand_id: hammerBrand.id,
          name: `${name}-${String(base_weight)}`,
          base_weight,
          notes: 'Test fixture',
          official_weight_id: bench.id,
        });
        assert.equal(created.status, 201);
        assert.equal(created.data.official_weight_id, bench.id);
        machineIds.push(created.data.id);
      }
      const workout = await call('/workouts', 'POST', {
        date: '2026-10-19',
        title: name,
        sets: [{ exercise: name, machine_id: machineIds[2], weight: 100, reps: 10 }],
      });
      assert.equal(workout.status, 201);
      workoutId = workout.data.id;
      const snapshot = async () => ({
        machines: (
          await pool.query('SELECT id, base_weight FROM machines WHERE id = ANY($1) ORDER BY id', [
            machineIds,
          ])
        ).rows.map((r) => ({
          id: r.id,
          base_weight: r.base_weight === null ? null : Number(r.base_weight),
        })),
        sets: (
          await pool.query('SELECT machine_id, weight, reps FROM sets WHERE workout_id=$1', [
            workoutId,
          ])
        ).rows.map((r) => ({ ...r, weight: Number(r.weight) })),
      });
      const before = await snapshot();
      assert.deepEqual(
        before.machines.map((m) => m.base_weight),
        [null, 0, 20.25],
        'Linking a reference must keep the user-entered NULL/0/positive base weight',
      );
      assert.deepEqual(before.sets, [{ machine_id: machineIds[2], weight: 100, reps: 10 }]);

      await t.test(
        'machine list shows the linked reference beside the user base weight',
        async () => {
          const list = await call('/machines');
          const stored = list.data.filter((m: { id: number }) => machineIds.includes(m.id));
          assert.equal(stored.length, 3);
          for (const m of stored) {
            assert.equal(m.official_status, 'verified');
            assert.equal(Number(m.official_weight_kg), 3.18);
            assert.equal(m.official_basis, 'per_arm');
            assert.equal(m.official_source_url, bench.source_url);
          }
          assert.deepEqual(
            stored
              .map((m: { base_weight: string | null }) =>
                m.base_weight === null ? null : Number(m.base_weight),
              )
              .sort(),
            [0, 20.25, null].sort(),
          );
        },
      );

      await t.test(
        're-running migrations 009 and 013 changes no user data or past totals',
        async () => {
          for (let i = 0; i < 2; i++) {
            await pool.query(migration);
            await pool.query(followup);
          }
          assert.deepEqual(await snapshot(), before);
          const again = await call('/official-machine-weights?brand=Hammer%20Strength');
          assert.equal(again.data.length, hammer.data.length, 'Seeding is idempotent');
        },
      );

      await t.test(
        'Newtech brand exists once after re-runs and lists its unverified rows',
        async () => {
          const count = await pool.query("SELECT count(*)::int n FROM brands WHERE name='Newtech'");
          assert.equal(count.rows[0].n, 1);
          const listed = await call('/brands');
          assert.equal(listed.data.filter((b: { name: string }) => b.name === 'Newtech').length, 1);
          const refs = await call('/official-machine-weights?brand=Newtech');
          assert.equal(refs.status, 200);
          assert.ok(refs.data.length > 0);
          for (const ref of refs.data) {
            assert.equal(ref.status, 'unverified');
            assert.equal(ref.lineup, '온힘');
            assert.equal(ref.weight_kg, null);
          }
        },
      );
      const linkOf = async (machineId: number) =>
        (await pool.query('SELECT official_weight_id FROM machines WHERE id=$1', [machineId]))
          .rows[0].official_weight_id;
      const editBody = {
        brand_id: hammerBrand.id,
        name: `${name}-20.25`,
        base_weight: 20.25,
        notes: 'Test fixture',
      };
      await t.test('omitting official_weight_id on update keeps the stored link', async () => {
        const updated = await call(`/machines/${machineIds[2]}`, 'PUT', editBody);
        assert.equal(updated.status, 200);
        assert.equal(await linkOf(machineIds[2]), bench.id);
        assert.deepEqual(await snapshot(), before);
      });
      await t.test('switching and explicit null unlink keep base weight and totals', async () => {
        for (const official_weight_id of [unverified.id, null]) {
          const updated = await call(`/machines/${machineIds[2]}`, 'PUT', {
            ...editBody,
            official_weight_id,
          });
          assert.equal(updated.status, 200);
          assert.equal(await linkOf(machineIds[2]), official_weight_id);
          assert.deepEqual(await snapshot(), before);
        }
      });
      await t.test(
        'an unknown reference id is a 400 with a Korean message, not a 500',
        async () => {
          const unknownId = 2147483647;
          const posted = await call('/machines', 'POST', {
            ...editBody,
            name: `${name}-unknown`,
            official_weight_id: unknownId,
          });
          const put = await call(`/machines/${machineIds[1]}`, 'PUT', {
            ...editBody,
            name: `${name}-0`,
            base_weight: 0,
            official_weight_id: unknownId,
          });
          for (const response of [posted, put]) {
            assert.equal(response.status, 400);
            assert.equal(response.data.error, '선택한 공식 참고값이 존재하지 않습니다');
          }
          assert.equal(
            (await pool.query('SELECT 1 FROM machines WHERE name=$1', [`${name}-unknown`]))
              .rowCount,
            0,
          );
          assert.equal(await linkOf(machineIds[1]), bench.id, 'Rejected update keeps the link');
          assert.deepEqual(await snapshot(), before);
        },
      );
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
