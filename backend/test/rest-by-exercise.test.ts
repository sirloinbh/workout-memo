import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { machineSchema } from '../src/domain.js';
import {
  defaultRestDurations,
  defaultTimer,
  parseRestDurations,
  remainingMs,
  restKind,
  startTimer,
} from '../../frontend/src/rest-timer.js';

// #84: rest by exercise kind. Lower 2:30, upper 2:00, single-joint 1:30.
test('default per-kind rests match the issue table', () => {
  assert.deepEqual(defaultRestDurations(), { lower: 150, upper: 120, single: 90 });
});

test('kind comes from the single-joint flag first, then lower, then upper body parts', () => {
  assert.equal(restKind(true, ['하체-앞']), 'single', 'leg extension: single-joint wins');
  assert.equal(restKind(true, []), 'single');
  assert.equal(restKind(false, ['하체-뒤', '등']), 'lower');
  assert.equal(restKind(false, ['가슴', '팔']), 'upper');
  assert.equal(restKind(false, ['어깨']), 'upper');
  assert.equal(restKind(false, ['복근']), null, 'abs only has no kind');
  assert.equal(restKind(false, []), null, 'unmapped exercises keep the configured rest');
});

test('stored per-kind rests are validated one by one', () => {
  assert.deepEqual(parseRestDurations(null), defaultRestDurations());
  assert.deepEqual(parseRestDurations('{broken'), defaultRestDurations());
  assert.deepEqual(parseRestDurations('{"lower":180,"upper":3,"single":"60"}'), {
    lower: 180,
    upper: 120,
    single: 90,
  });
});

test('a rest can start with a duration other than the configured one', () => {
  const now = Date.parse('2026-10-14T15:30:00Z');
  const running = startTimer(defaultTimer(), now, 150);
  assert.equal(remainingMs(running, now), 150000);
  assert.equal(running.duration, 90, 'the configured rest is unchanged');
  assert.equal(remainingMs(startTimer(defaultTimer(), now), now), 90000);
});

test('the machine contract accepts only a boolean single-joint flag', () => {
  const machine = { brand_id: 1, name: '레그 익스텐션', base_weight: null };
  assert.equal(machineSchema.parse(machine).single_joint, undefined);
  assert.equal(machineSchema.parse({ ...machine, single_joint: true }).single_joint, true);
  for (const single_joint of ['true', 1, null])
    assert.equal(machineSchema.safeParse({ ...machine, single_joint }).success, false);
});

test(
  'a machine stores its single-joint flag; an update without it keeps the stored value',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
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
    const name = `Rest84-${randomUUID()}`;
    try {
      const brand = (await call('/brands')).data[0] as { id: number };
      const body = { brand_id: brand.id, name, base_weight: 20, notes: '' };
      const plain = await call('/machines', 'POST', { ...body, name: name + '-plain' });
      assert.equal(plain.data.single_joint, false, 'not single-joint unless the user sets it');
      const created = await call('/machines', 'POST', { ...body, single_joint: true });
      assert.equal(created.status, 201);
      assert.equal(created.data.single_joint, true);
      const kept = await call(`/machines/${created.data.id}`, 'PUT', { ...body, notes: '수정' });
      assert.equal(kept.data.single_joint, true, 'older clients do not clear the flag');
      const cleared = await call(`/machines/${created.data.id}`, 'PUT', {
        ...body,
        single_joint: false,
      });
      assert.equal(cleared.data.single_joint, false);
      const listed = (await call('/machines')).data as { id: number; single_joint: boolean }[];
      assert.equal(listed.find((m) => m.id === created.data.id)?.single_joint, false);
    } finally {
      try {
        await pool.query('DELETE FROM machines WHERE name LIKE $1', [name + '%']);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await pool.end();
      }
    }
  },
);
