import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

// project-standards#559: shared-ai calls the AI tools with a signed token; each call is checked
// for its scope and leaves one audit_log row.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
// One owner per run, so the audit rows of an earlier run on the same DB do not count.
const owner = `owner-${randomUUID()}`;
// project-standards#670, #822: a token names its tool ('@list' for the list) and has its own jti; the app requires both.
function token(scope: string, tool: string, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ iss: 'shared-ai', aud: 'workout-memo', sub: owner, client: 'stdio', scope, tool, jti: randomUUID(), iat: now, exp: now + 60 })}`;
  return `${body}.${sign(null, Buffer.from(body), key).toString('base64url')}`;
}

test(
  'AI tools: list and add workouts with scopes, signatures and audit rows',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const toolsPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const server = createApp(pool, { toolsPublicKey }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/internal/tools`;
    const call = (name: string, auth: string | null, body: unknown = {}) =>
      fetch(`${base}/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify(body),
      });
    const title = `AI-${randomUUID()}`;
    const workout = {
      date: '2040-04-01',
      title,
      notes: 'From the AI shell',
      sets: [{ exercise: 'Squat', machine_id: null, weight: 60, reps: 5, notes: '' }],
    };
    try {
      const listed = await fetch(base, {
        headers: { authorization: `Bearer ${token('workout-memo:read', '@list')}` },
      });
      assert.equal(listed.status, 200);
      const { tools } = (await listed.json()) as {
        tools: { name: string; annotations: { readOnlyHint: boolean } }[];
      };
      assert.deepEqual(
        tools.map((t) => [t.name, t.annotations.readOnlyHint]),
        [
          ['list_workouts', true],
          ['add_workout', false],
        ],
      );

      assert.equal((await call('add_workout', null, workout)).status, 401);
      assert.equal(
        (
          await call(
            'add_workout',
            token('workout-memo:write', 'add_workout', generateKeyPairSync('ed25519').privateKey),
            workout,
          )
        ).status,
        401,
      );
      assert.equal(
        (await call('add_workout', token('workout-memo:read', 'add_workout'), workout)).status,
        403,
      );
      assert.equal(
        (
          await call('add_workout', token('workout-memo:write', 'add_workout'), {
            ...workout,
            title: '',
          })
        ).status,
        400,
      );

      const added = await call('add_workout', token('workout-memo:write', 'add_workout'), workout);
      assert.equal(added.status, 200);
      const { result } = (await added.json()) as { result: { id: number } };
      const read = await call('list_workouts', token('workout-memo:read', 'list_workouts'), {
        from: '2040-04-01',
        to: '2040-04-01',
      });
      assert.equal(read.status, 200);
      const found = (
        (await read.json()) as { result: { id: number; title: string; sets: unknown[] }[] }
      ).result.find((w) => w.id === result.id);
      assert.equal(found?.title, title);
      assert.equal(found?.sets.length, 1);
      assert.equal(
        (
          await call('list_workouts', token('workout-memo:read', 'list_workouts'), {
            from: '2039-01-01',
            to: '2040-04-01',
          })
        ).status,
        400,
      );

      const rows = (
        await pool.query(
          "SELECT action,result,entity_id,tool,client,actor_type FROM audit_log WHERE actor_type='ai-tool' AND actor_id=$1 ORDER BY id",
          [owner],
        )
      ).rows;
      assert.deepEqual(
        rows.map((r) => [r.tool, r.action, r.result]),
        [
          ['add_workout', 'create', 'denied'],
          ['add_workout', 'create', 'error'],
          ['add_workout', 'create', 'ok'],
          ['list_workouts', 'read', 'ok'],
          ['list_workouts', 'read', 'error'],
        ],
      );
      assert.equal(rows[2].entity_id, String(result.id));
      assert.equal(rows[2].client, 'stdio');
    } finally {
      server.close();
      await pool.end();
    }
  },
);

test(
  'AI tools are off without the shared-ai public key',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/internal/tools`)).status, 404);
    } finally {
      server.close();
      await pool.end();
    }
  },
);

// #362: a retried add_workout call with the same idempotency key adds one journal, not two.
test(
  'add_workout with the same idempotency key adds one journal',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const toolsPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const server = createApp(pool, { toolsPublicKey }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/internal/tools`;
    const add = async (body: unknown) => {
      const response = await fetch(`${base}/add_workout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token('workout-memo:write', 'add_workout')}`,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        result: ((await response.json()) as { result: never }).result as {
          id?: number;
          error?: string;
        },
      };
    };
    const key = randomUUID();
    const title = `AI-retry-${randomUUID()}`;
    const workout = {
      date: '2040-05-01',
      title,
      notes: '',
      sets: [{ exercise: 'Squat', machine_id: null, weight: 60, reps: 5, notes: '' }],
      idempotency_key: key,
    };
    try {
      const first = await add(workout);
      const second = await add(workout);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.ok(first.result.id);
      assert.equal(second.result.id, first.result.id);
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM workouts WHERE title=$1', [title])).rows[0]
          .n,
        1,
      );
      // The same key with other content is refused, and nothing is added.
      const other = await add({ ...workout, title: title + '-2' });
      assert.match(other.result.error ?? '', /differs/);
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM workouts WHERE title=$1', [title + '-2']))
          .rows[0].n,
        0,
      );
      // Without a key every call adds a journal, as before.
      const { idempotency_key: _unused, ...plain } = workout;
      void _unused;
      await add(plain);
      await add(plain);
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM workouts WHERE title=$1', [title])).rows[0]
          .n,
        3,
      );
    } finally {
      server.close();
      await pool.end();
    }
  },
);
