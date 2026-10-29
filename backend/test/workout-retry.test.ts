import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

test(
  'retry migration preserves existing rows and retained keys when reapplied',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'CREATE TEMP TABLE workouts(id integer PRIMARY KEY, title text) ON COMMIT DROP',
      );
      await client.query("INSERT INTO workouts VALUES(1,'older journal')");
      const migration = readFileSync(
        new URL('../../database/migrations/003_workout_retries.sql', import.meta.url),
        'utf8',
      );
      await client.query(migration);
      assert.deepEqual((await client.query('SELECT * FROM workouts')).rows, [
        { id: 1, title: 'older journal', version: 1 },
      ]);
      const key = randomUUID();
      const inserted = await client.query(
        'INSERT INTO workout_requests(key,fingerprint,status,response) VALUES($1,\'fixture\',201,\'{"id":1,"version":1}\') RETURNING *',
        [key],
      );
      const remaining = await client.query(
        'SELECT EXTRACT(EPOCH FROM (expires_at-now())) seconds FROM workout_requests WHERE key=$1',
        [key],
      );
      assert.equal(
        Number(remaining.rows[0].seconds),
        7 * 86400,
        'keys default to seven days of database time',
      );
      await client.query('UPDATE workouts SET version=4 WHERE id=1');
      await client.query(migration);
      assert.equal(
        (await client.query('SELECT version FROM workouts WHERE id=1')).rows[0].version,
        4,
      );
      assert.deepEqual(
        (await client.query('SELECT * FROM workout_requests WHERE key=$1', [key])).rows,
        inserted.rows,
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);

// Wire contract: UUID Idempotency-Key; PUT carries the version returned by GET.
// API scenarios check persisted outcomes; migration/expiry setup uses dedicated DB fixtures.
test(
  'safe workout retries and concurrent edits',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api/workouts';
    const title = 'Retry-' + randomUUID();
    const keys = new Set<string>();
    const original = {
      date: '2040-02-29',
      title,
      notes: '재시도 검증',
      sets: [
        { exercise: 'Squat', machine_id: null, weight: 100.25, reps: 10, notes: '총중량' },
        { exercise: 'Row', machine_id: null, weight: 40, reps: 8, notes: '' },
      ],
    };
    const call = async (method: string, body?: unknown, key?: string, suffix = '') => {
      if (key && /^[0-9a-f-]{36}$/i.test(key)) keys.add(key);
      const response = await fetch(base + suffix, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(key === undefined ? {} : { 'Idempotency-Key': key }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const read = async () => {
      const result = await call('GET', undefined, undefined, '?from=2040-02-29&to=2040-02-29');
      assert.equal(result.status, 200);
      return result.data.filter((w: { title: string }) => w.title.startsWith(title)) as {
        id: number;
        title: string;
        version: number;
        sets: { weight: number | string }[];
      }[];
    };
    try {
      await t.test(
        'response loss followed by replay returns original ID and one copy of every set',
        async () => {
          const key = randomUUID();
          await call('POST', original, key); // Deliberately ignore response after server commit.
          const replay = await call('POST', original, key);
          assert.ok([200, 201].includes(replay.status));
          const records = await read();
          assert.equal(records.length, 1);
          assert.equal(replay.data.id, records[0].id);
          assert.equal(records[0].sets.length, 2);
          assert.equal(Number(records[0].sets[0].weight), 100.25);
        },
      );
      await t.test('simultaneous identical requests commit only one journal', async () => {
        const key = randomUUID();
        const body = { ...original, title: title + '-parallel' };
        const responses = await Promise.all([call('POST', body, key), call('POST', body, key)]);
        assert.ok(responses.every((r) => [200, 201].includes(r.status)));
        assert.equal(responses[0].data.id, responses[1].data.id);
        const own = (await read()).filter((w) => w.title === body.title);
        assert.equal(own.length, 1);
        assert.equal(own[0].sets.length, 2);
      });
      await t.test('same key cannot silently accept changed request content', async () => {
        const key = randomUUID();
        const body = { ...original, title: title + '-content' };
        const created = await call('POST', body, key);
        assert.equal(created.status, 201);
        const changed = await call('POST', { ...body, notes: 'changed content' }, key);
        assert.equal(changed.status, 409);
        assert.equal((await read()).filter((w) => w.title === body.title).length, 1);
      });
      await t.test('malformed retry key is rejected without creating records', async () => {
        const body = { ...original, title: title + '-invalid' };
        assert.equal((await call('POST', body, 'not-a-valid-key')).status, 400);
        assert.equal((await read()).filter((w) => w.title === body.title).length, 0);
      });
      await t.test('one key cannot create two different simultaneous requests', async () => {
        const key = randomUUID();
        const body = { ...original, title: title + '-competing-content' };
        const replies = await Promise.all([
          call('POST', body, key),
          call('POST', { ...body, notes: 'different' }, key),
        ]);
        assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
        assert.equal((await read()).filter((w) => w.title === body.title).length, 1);
      });
      await t.test('expired key is rejected even for an identical request', async () => {
        const key = randomUUID();
        const body = { ...original, title: title + '-expired' };
        assert.equal((await call('POST', body, key)).status, 201);
        await pool.query(
          "UPDATE workout_requests SET expires_at=now()-interval '1 second' WHERE key=$1",
          [key],
        );
        assert.equal((await call('POST', body, key)).status, 409);
        assert.equal((await read()).filter((w) => w.title === body.title).length, 1);
      });
      await t.test('updates require a positive integer revision', async () => {
        const body = { ...original, title: title + '-version' };
        const created = await call('POST', body, randomUUID());
        for (const version of [undefined, null, 0, -1, 1.5, '1']) {
          assert.equal(
            (await call('PUT', { ...body, version }, randomUUID(), '/' + created.data.id)).status,
            400,
          );
        }
        assert.equal((await read()).find((w) => w.id === created.data.id)!.version, 1);
      });
      await t.test(
        'stale draft cannot overwrite a newer device edit or replace its sets',
        async () => {
          const body = { ...original, title: title + '-conflict' };
          const created = await call('POST', body, randomUUID());
          assert.equal(created.status, 201);
          const before = (await read()).find((w) => w.id === created.data.id)!;
          assert.ok(Number.isInteger(before.version), 'reads expose a revision');
          const latest = {
            ...body,
            version: before.version,
            notes: 'new device edit',
            sets: [{ ...body.sets[0], weight: 150 }],
          };
          assert.equal((await call('PUT', latest, randomUUID(), '/' + before.id)).status, 200);
          const after = (await read()).find((w) => w.id === before.id)!;
          assert.ok(after.version > before.version);
          assert.equal(
            (await call('PUT', { ...body, version: before.version }, randomUUID(), '/' + before.id))
              .status,
            409,
          );
          assert.deepEqual(
            (await read()).find((w) => w.id === before.id),
            after,
          );
        },
      );
      await t.test(
        'successful update replay bypasses obsolete revision without duplicating sets',
        async () => {
          const body = { ...original, title: title + '-edit-replay' };
          const created = await call('POST', body, randomUUID());
          const before = (await read()).find((w) => w.id === created.data.id)!;
          assert.ok(Number.isInteger(before.version), 'update replay requires a readable revision');
          const key = randomUUID();
          const edited = {
            ...body,
            version: before.version,
            sets: [{ ...body.sets[0], weight: 130 }],
          };
          assert.equal((await call('PUT', edited, key, '/' + before.id)).status, 200);
          const after = (await read()).find((w) => w.id === before.id);
          assert.equal((await call('PUT', edited, key, '/' + before.id)).status, 200);
          assert.deepEqual(
            (await read()).find((w) => w.id === before.id),
            after,
          );
        },
      );
      await t.test('two devices editing the same revision commit exactly one edit', async () => {
        const body = { ...original, title: title + '-competing-edits' };
        const created = await call('POST', body, randomUUID());
        const edit = (weight: number) => ({
          ...body,
          version: 1,
          sets: [{ ...body.sets[0], weight }],
        });
        const replies = await Promise.all([
          call('PUT', edit(125), randomUUID(), '/' + created.data.id),
          call('PUT', edit(150), randomUUID(), '/' + created.data.id),
        ]);
        assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
        const saved = (await read()).find((w) => w.id === created.data.id)!;
        assert.equal(saved.version, 2);
        assert.equal(saved.sets.length, 1);
        assert.equal(Number(saved.sets[0].weight), replies[0].status === 200 ? 125 : 150);
      });
      await t.test('a retry key is bound to its HTTP method and workout target', async () => {
        const createKey = randomUUID();
        const body = { ...original, title: title + '-scope' };
        const first = await call('POST', body, createKey);
        const second = await call('POST', body, randomUUID());
        const edited = { ...body, version: 1, notes: 'edited' };
        assert.equal(
          (await call('PUT', edited, createKey, '/' + first.data.id)).status,
          409,
          'a successful create key cannot authorize an edit',
        );
        const editKey = randomUUID();
        assert.equal((await call('PUT', edited, editKey, '/' + first.data.id)).status, 200);
        assert.equal(
          (await call('PUT', edited, editKey, '/' + second.data.id)).status,
          409,
          'an edit key cannot be reused for another workout',
        );
        const records = await read();
        assert.equal(records.find((w) => w.id === first.data.id)!.version, 2);
        assert.equal(records.find((w) => w.id === second.data.id)!.version, 1);
      });
      await t.test('failed database transactions do not consume the retry key', async () => {
        const key = randomUUID();
        const body = { ...original, title: title + '-rollback' };
        const invalid = {
          ...body,
          sets: [{ ...body.sets[0], machine_id: 2147483647 }],
        };
        assert.ok((await call('POST', invalid, key)).status >= 400);
        assert.equal((await read()).filter((w) => w.title === body.title).length, 0);
        assert.equal((await call('POST', body, key)).status, 201);
        assert.equal((await call('POST', body, key)).status, 201);
        const records = (await read()).filter((w) => w.title === body.title);
        assert.equal(records.length, 1);
        assert.equal(records[0].sets.length, 2);
      });
    } finally {
      try {
        // Only this fixture's rows, including duplicates exposed by failed assertions.
        await pool.query('DELETE FROM workouts WHERE title LIKE $1', [title + '%']);
        await pool.query('DELETE FROM workout_requests WHERE key=ANY($1::uuid[])', [[...keys]]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
        await pool.end();
      }
    }
  },
);
