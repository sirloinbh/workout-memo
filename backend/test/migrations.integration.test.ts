import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import {
  checksum,
  migrate,
  migrationStatus,
  readMigrations,
  type Migration,
} from '../src/migrations.js';

const repoMigrations = fileURLToPath(new URL('../../database/migrations/', import.meta.url));

// Every case runs in its own schema so the shared test database's tables are untouched.
async function inSchema(run: (client: PoolClient, schema: string) => Promise<void>) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  const schema = `migrate_test_${randomUUID().replace(/-/g, '')}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await run(client, schema);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    client.release();
    await pool.end();
  }
}
const history = async (client: PoolClient) =>
  (await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(
    (row: { name: string }) => row.name,
  );

test(
  'db:migrate builds an empty schema once and records every file',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const files = await readMigrations(repoMigrations);
    await inSchema(async (client, schema) => {
      assert.deepEqual((await migrationStatus(client, files)).applied, []);
      assert.equal(
        (await client.query(`SELECT to_regclass('${schema}.schema_migrations') t`)).rows[0].t,
        null,
        'status alone must not create the history table',
      );
      assert.deepEqual(
        await migrate(client, files),
        files.map((f) => f.name),
      );
      assert.deepEqual(
        await history(client),
        files.map((f) => f.name),
      );
      for (const table of ['workouts', 'sets', 'routines', 'body_measurements'])
        assert.ok((await client.query(`SELECT to_regclass('${schema}.${table}') t`)).rows[0].t);
      // Korean seed values arrive intact without a console pipe.
      const brands = (await client.query('SELECT name FROM brands')).rows.map((r) => r.name);
      assert.ok(brands.includes('기타'));
      assert.deepEqual(await migrate(client, files), []);
      const status = await migrationStatus(client, files);
      assert.deepEqual(status.pending, []);
      assert.deepEqual(status.errors, []);
    });
  },
);

test(
  'an existing database without history is baselined and keeps its records',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const files = await readMigrations(repoMigrations);
    await inSchema(async (client) => {
      // Simulate a volume prepared by docker-entrypoint-initdb.d or manual psql runs.
      for (const file of files) await client.query(file.sql);
      const created = await client.query(
        `INSERT INTO workouts(date, title) VALUES ('2040-01-02', 'baseline fixture') RETURNING id`,
      );
      await client.query(
        `INSERT INTO sets(workout_id, exercise, weight, reps, position, rpe) VALUES ($1, 'squat', 100.25, 5, 0, 8.5)`,
        [created.rows[0].id],
      );
      assert.equal(
        (await migrate(client, files)).length,
        files.length,
        'every file is safe to re-run',
      );
      const sets = await client.query(
        'SELECT weight, reps, completed, rpe FROM sets WHERE workout_id=$1',
        [created.rows[0].id],
      );
      assert.deepEqual(sets.rows, [{ weight: '100.25', reps: 5, completed: true, rpe: '8.5' }]);
      // #83: an existing workout has no feedback; only the three levels are accepted.
      const workout = await client.query('SELECT feedback FROM workouts WHERE id=$1', [
        created.rows[0].id,
      ]);
      assert.deepEqual(workout.rows, [{ feedback: null }]);
      await assert.rejects(
        client.query(`UPDATE workouts SET feedback='0' WHERE id=$1`, [created.rows[0].id]),
        /workouts_feedback_check/,
      );
      assert.deepEqual(await migrate(client, files), []);
    });
  },
);

test(
  'a changed applied file or a failing file stops without partial history',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const files = await readMigrations(repoMigrations);
    await inSchema(async (client, schema) => {
      await migrate(client, files);
      const edited = files.map((f, i) =>
        i === 1
          ? { ...f, sql: f.sql + '\n-- edited', checksum: checksum(f.sql + '\n-- edited') }
          : f,
      );
      await assert.rejects(
        migrate(client, edited),
        new RegExp(`내용이 바뀌었습니다: ${files[1].name}`),
      );
      const broken: Migration = {
        name: '999_broken.sql',
        sql: 'CREATE TABLE half_applied(id integer); SELECT 1/0;',
        checksum: checksum('broken'),
      };
      await assert.rejects(migrate(client, [...files, broken]), /999_broken\.sql 적용 실패/);
      assert.equal(
        (await client.query(`SELECT to_regclass('${schema}.half_applied') t`)).rows[0].t,
        null,
      );
      assert.ok(!(await history(client)).includes('999_broken.sql'));
      // The session is usable and the advisory lock was released after the failure.
      const other = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      const session = await other.connect();
      try {
        const locked = await session.query('SELECT pg_try_advisory_lock(581003) ok');
        assert.equal(locked.rows[0].ok, true);
        await session.query('SELECT pg_advisory_unlock(581003)');
      } finally {
        session.release();
        await other.end();
      }
    });
  },
);
