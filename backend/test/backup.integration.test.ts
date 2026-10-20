import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import type { Backup, RestoreSummary } from '../src/backup.js';
import { routineInput } from './routine-fixture.js';
import { parseCsv } from './csv-reader.js';

// Restore in "replace" mode deletes every row. Each scenario therefore runs in its own
// PostgreSQL schema inside the dedicated test DB so concurrently running test files keep
// their data. Schemas are dropped in finally; no real backup file is read or written.
const url = process.env.TEST_DATABASE_URL;
const migrations = new URL('../../database/migrations/', import.meta.url);
type Api = (
  path: string,
  method?: string,
  body?: unknown,
  raw?: string,
) => Promise<{ status: number; data: Data; text: string; headers: Headers }>;
// Every JSON response of these endpoints is one of these shapes.
type Data = Backup & RestoreSummary & { id: number; error: string };
type Db = {
  pool: Pool;
  api: Api;
  base: string;
  count: () => Promise<Record<string, number>>;
};

async function isolated(run: (...dbs: Db[]) => Promise<void>, n = 1, wrap?: (p: Pool) => Pool) {
  const admin = new Pool({ connectionString: url });
  const created: {
    schema: string;
    pool: Pool;
    server: ReturnType<ReturnType<typeof createApp>['listen']>;
  }[] = [];
  try {
    const dbs: Db[] = [];
    for (let i = 0; i < n; i++) {
      const schema = 'backup33_' + randomUUID().replaceAll('-', '');
      await admin.query(`CREATE SCHEMA ${schema}`);
      const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
      const files = readdirSync(migrations)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) await pool.query(readFileSync(new URL(file, migrations), 'utf8'));
      const server = createApp(wrap && i === 0 ? wrap(pool) : pool).listen(0, '127.0.0.1');
      created.push({ schema, pool, server });
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const api: Api = async (path, method = 'GET', body, raw) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        });
        // Keep the BOM: response.text() would silently strip it.
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
          await response.arrayBuffer(),
        );
        let data = null as unknown as Data;
        if (response.headers.get('content-type')?.includes('application/json'))
          data = JSON.parse(text);
        return { status: response.status, data, text, headers: response.headers };
      };
      const count = async () => {
        const out: Record<string, number> = {};
        for (const table of ['brands', 'machines', 'workouts', 'sets', 'goals', 'routines'])
          out[table] = (await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
        return out;
      };
      dbs.push({ pool, api, count, base: `http://127.0.0.1:${address.port}` });
    }
    await run(...dbs);
  } finally {
    for (const { schema, pool, server } of created) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await admin.end();
  }
}

const tricky = '쉼표, "따옴표"\n줄바꿈 한글';
async function seed(api: Api) {
  const brands = (await api('/brands')).data as unknown as { id: number; name: string }[];
  const arsenal = brands.find((b) => b.name === 'Arsenal Strength')!;
  const hammer = brands.find((b) => b.name === 'Hammer Strength')!;
  const press = await api('/machines', 'POST', {
    brand_id: arsenal.id,
    name: '레그 프레스',
    base_weight: null,
    notes: '기본중량 미확인',
  });
  const row = await api('/machines', 'POST', {
    brand_id: hammer.id,
    name: 'Iso Row, "와이드"',
    base_weight: 20.5,
    notes: '',
  });
  assert.equal(press.status, 201);
  assert.equal(row.status, 201);
  const first = await api('/workouts', 'POST', {
    date: '2024-02-29',
    title: '=SUM(A1) 하체',
    notes: tricky,
    sets: [
      { exercise: '레그 프레스', machine_id: press.data.id, weight: 100.25, reps: 10, notes: '' },
      { exercise: '레그 프레스', machine_id: press.data.id, weight: 120, reps: 8, notes: '+힘듦' },
      { exercise: '맨몸 스쿼트', machine_id: null, weight: 0, reps: 20, notes: tricky },
    ],
  });
  const second = await api('/workouts', 'POST', {
    date: '2024-03-01',
    title: '등',
    notes: '',
    sets: [{ exercise: '로우', machine_id: row.data.id, weight: 60.5, reps: 12, notes: '' }],
  });
  // Two identical sessions on the same day are both real records and must both survive.
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await api('/workouts', 'POST', {
          date: '2024-03-02',
          title: '반복',
          notes: '',
          sets: [{ exercise: '컬', machine_id: null, weight: 10, reps: 10, notes: '' }],
        })
      ).status,
      201,
    );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(
    (
      await api('/goals', 'POST', {
        exercise: '레그 프레스',
        target_weight: 150.5,
        target_reps: 5,
        start_date: '2024-02-01',
        deadline: '2024-06-30',
      })
    ).status,
    201,
  );
  assert.equal((await api('/routines', 'POST', routineInput(2))).status, 201);
}

// Compare content without database ids, resolving every reference to natural keys.
function normalize(backup: Backup) {
  const brand = new Map(backup.data.brands.map((b) => [b.id, b.name]));
  const machine = new Map(
    backup.data.machines.map((m) => [m.id, `${brand.get(m.brand_id)}/${m.name}`]),
  );
  const sort = (list: unknown[]) => list.map((x) => JSON.stringify(x)).sort();
  return {
    brands: sort(backup.data.brands.map((b) => b.name)),
    machines: sort(
      backup.data.machines.map((m) => ({
        key: machine.get(m.id),
        base_weight: m.base_weight,
        notes: m.notes,
      })),
    ),
    workouts: sort(
      backup.data.workouts.map((w) => ({
        date: w.date,
        title: w.title,
        notes: w.notes,
        created_at: w.created_at,
        sets: w.sets.map((s) => ({
          ...s,
          machine_id: s.machine_id === null ? null : machine.get(s.machine_id),
        })),
      })),
    ),
    goals: sort(backup.data.goals.map((g) => ({ ...g, id: 0 }))),
    routines: sort(backup.data.routines.map((r) => ({ ...r, id: 0 }))),
  };
}

const skip = !url;

test(
  'backup export → restore into an empty DB is equivalent and repeat restores skip identical duplicates',
  { skip },
  async () => {
    await isolated(async (source, target) => {
      await seed(source.api);
      const exported = await source.api('/backup');
      assert.equal(exported.status, 200);
      assert.match(
        exported.headers.get('content-disposition') ?? '',
        /attachment; filename="?workout-memo-backup-\d{4}-\d{2}-\d{2}\.json"?$/,
      );
      const backup = exported.data;
      assert.equal(backup.format, 'workout-memo-backup');
      assert.equal(backup.version, 1);
      assert.equal(backup.data.workouts.length, 4);
      assert.equal(backup.data.workouts[0].sets.length, 3, 'Sets nest inside their workout');
      assert.equal(backup.data.workouts[0].sets[0].weight, 100.25, 'Total kg is a JSON number');
      assert.ok(
        backup.data.machines.some((m) => m.base_weight === null),
        'Unknown base weight stays null',
      );
      assert.equal('workout_requests' in backup.data, false);

      const before = await target.count();
      const preview = await target.api('/backup/preview', 'POST', { mode: 'merge', backup });
      assert.equal(preview.status, 200);
      assert.deepEqual(preview.data.tables.workouts, {
        added: 4,
        skipped: 0,
        conflicts: 0,
        deleted: 0,
      });
      assert.deepEqual(preview.data.tables.sets, {
        added: 6,
        skipped: 0,
        conflicts: 0,
        deleted: 0,
      });
      assert.equal(preview.data.tables.machines.added, 2);
      assert.equal(preview.data.tables.brands.added, 0, 'Seeded brands are matched by name');
      assert.equal(preview.data.tables.brands.skipped, backup.data.brands.length);
      assert.equal(preview.data.tables.goals.added, 1);
      assert.equal(preview.data.tables.routines.added, 1);
      assert.equal(preview.data.dry_run, true);
      assert.deepEqual(await target.count(), before, 'Preview never writes');

      const restored = await target.api('/backup/restore', 'POST', { mode: 'merge', backup });
      assert.equal(restored.status, 200);
      assert.equal(restored.data.dry_run, false);
      assert.deepEqual(restored.data.tables, preview.data.tables, 'Preview matches the real run');
      const roundTrip = (await target.api('/backup')).data;
      assert.deepEqual(normalize(roundTrip), normalize(backup));
      // Restored workouts are fresh records for optimistic locking and stay editable.
      const listed = await target.api('/workouts?from=2024-01-01&to=2024-12-31');
      assert.ok((listed.data as unknown as { version: number }[]).every((w) => w.version === 1));
      // Goal evaluation works on restored sets.
      assert.equal(
        ((await target.api('/goals')).data as unknown as { achieved: boolean }[])[0].achieved,
        false,
      );

      // Same backup again: add-only mode changes nothing.
      const after = await target.count();
      const again = await target.api('/backup/restore', 'POST', { mode: 'merge', backup });
      assert.equal(again.status, 200);
      for (const table of ['brands', 'machines', 'workouts', 'goals', 'routines'] as const)
        assert.equal(again.data.tables[table].added, 0, `${table} not duplicated`);
      assert.equal(again.data.tables.workouts.skipped, 4);
      assert.deepEqual(await target.count(), after);
      // Restoring into the source itself is also a no-op.
      const self = await source.api('/backup/restore', 'POST', { backup });
      assert.equal(self.status, 200);
      assert.equal(self.data.mode, 'merge', 'Add-only is the default');
      assert.equal(self.data.tables.workouts.added, 0);

      // The CSV of both databases reads back the same values apart from local ids.
      const strip = (csv: string) =>
        parseCsv(csv)
          .map((r) => [...r.slice(1, 10), ...r.slice(11)])
          .sort();
      assert.deepEqual(
        strip((await target.api('/export/workouts.csv')).text),
        strip((await source.api('/export/workouts.csv')).text),
      );
    }, 2);
  },
);

test(
  'merge keeps an existing machine on conflict and links restored sets to it',
  { skip },
  async () => {
    await isolated(async (source, target) => {
      await seed(source.api);
      const backup = (await source.api('/backup')).data;
      const brands = (await target.api('/brands')).data as unknown as {
        id: number;
        name: string;
      }[];
      const existing = await target.api('/machines', 'POST', {
        brand_id: brands.find((b) => b.name === 'Arsenal Strength')!.id,
        name: '레그 프레스',
        base_weight: 35,
        notes: '현장 확인',
      });
      const result = await target.api('/backup/restore', 'POST', { mode: 'merge', backup });
      assert.equal(result.status, 200);
      assert.equal(result.data.tables.machines.conflicts, 1);
      assert.equal(result.data.tables.machines.added, 1);
      assert.match(result.data.conflicts.join('\n'), /Arsenal Strength \/ 레그 프레스/);
      const machine = await target.pool.query('SELECT * FROM machines WHERE id=$1', [
        existing.data.id,
      ]);
      assert.equal(Number(machine.rows[0].base_weight), 35, 'Existing value is not overwritten');
      assert.equal(machine.rows[0].notes, '현장 확인');
      const linked = await target.pool.query(
        "SELECT count(*)::int n FROM sets WHERE machine_id=$1 AND exercise='레그 프레스'",
        [existing.data.id],
      );
      assert.equal(linked.rows[0].n, 2);
    }, 2);
  },
);

test(
  'replace requires the typed confirmation and then mirrors the backup exactly',
  { skip },
  async () => {
    await isolated(async (source, target) => {
      await seed(source.api);
      const backup = (await source.api('/backup')).data;
      const extra = await target.api('/workouts', 'POST', {
        date: '2025-01-01',
        title: '대상에만 있는 기록',
        notes: '',
        sets: [{ exercise: '벤치', machine_id: null, weight: 50, reps: 5, notes: '' }],
      });
      assert.equal(extra.status, 201);
      const before = await target.count();
      for (const confirm of [undefined, '', '전체교체', 'replace']) {
        const refused = await target.api('/backup/restore', 'POST', {
          mode: 'replace',
          backup,
          confirm,
        });
        assert.equal(refused.status, 400);
        assert.match(refused.data.error, /전체 교체/);
      }
      assert.deepEqual(await target.count(), before, 'Nothing is deleted without confirmation');

      const preview = await target.api('/backup/preview', 'POST', { mode: 'replace', backup });
      assert.equal(preview.status, 200, 'Preview needs no confirmation');
      assert.equal(preview.data.tables.workouts.deleted, 1);
      assert.equal(preview.data.tables.sets.deleted, 1);
      assert.equal(preview.data.tables.brands.deleted, backup.data.brands.length);
      assert.deepEqual(await target.count(), before);

      const replaced = await target.api('/backup/restore', 'POST', {
        mode: 'replace',
        backup,
        confirm: '전체 교체',
      });
      assert.equal(replaced.status, 200);
      assert.deepEqual(replaced.data.tables, preview.data.tables);
      assert.deepEqual(normalize((await target.api('/backup')).data), normalize(backup));
      assert.equal(
        (await target.pool.query("SELECT 1 FROM workouts WHERE title='대상에만 있는 기록'"))
          .rowCount,
        0,
      );
    }, 2);
  },
);

test(
  'invalid, unsupported, inconsistent or oversized backups are rejected without changes',
  { skip },
  async () => {
    await isolated(async (db) => {
      await seed(db.api);
      const backup = (await db.api('/backup')).data;
      const before = await db.count();
      const cases: [string, unknown, RegExp, number?, string?][] = [
        ['corrupted JSON', undefined, /요청 형식/, 400, '{"mode":"merge","backup":{'],
        ['other format', { ...backup, format: 'strong-app' }, /백업 파일 형식이 아닙니다/],
        ['unsupported version', { ...backup, version: 99 }, /지원하지 않는 백업 버전/],
        ['missing data', { ...backup, data: undefined }, /data/],
        [
          'unknown machine reference',
          structuredClone({
            ...backup,
            data: {
              ...backup.data,
              workouts: backup.data.workouts.map((w, i) =>
                i === 0 ? { ...w, sets: [{ ...w.sets[0], machine_id: 999999 }] } : w,
              ),
            },
          }),
          /머신 999999/,
        ],
        [
          'unknown brand reference',
          {
            ...backup,
            data: {
              ...backup.data,
              machines: backup.data.machines.map((m) => ({ ...m, brand_id: 888888 })),
            },
          },
          /브랜드 888888/,
        ],
        [
          'duplicate ids',
          {
            ...backup,
            data: { ...backup.data, goals: [...backup.data.goals, ...backup.data.goals] },
          },
          /중복된 id/,
        ],
      ];
      for (const [name, value, pattern, status = 400, raw] of cases) {
        for (const path of ['/backup/preview', '/backup/restore']) {
          const result = await db.api(path, 'POST', { mode: 'merge', backup: value }, raw);
          assert.equal(result.status, status, `${name} ${path}`);
          assert.match(result.data.error, pattern, name);
        }
      }
      const huge = 'x'.repeat(10 * 1024 * 1024 + 70 * 1024);
      const tooBig = await db.api(
        '/backup/restore',
        'POST',
        undefined,
        JSON.stringify({ backup: { pad: huge } }),
      );
      assert.equal(tooBig.status, 413);
      assert.match(tooBig.data.error, /10MB/);
      const bad = await db.api('/backup/restore', 'POST', { mode: 'everything', backup });
      assert.equal(bad.status, 400);
      assert.deepEqual(await db.count(), before);
    });
  },
);

for (const mode of ['merge', 'replace'] as const) {
  test(`a failure midway through a ${mode} restore rolls back every change`, { skip }, async () => {
    // Fail the goals insert, after brands/machines/workouts/sets (and deletes) already ran.
    const failing = (pool: Pool) =>
      new Proxy(pool, {
        get(target, prop) {
          if (prop !== 'connect') return Reflect.get(target, prop);
          return async () => {
            const client = await target.connect();
            return new Proxy(client, {
              get(c, p) {
                if (p !== 'query') return Reflect.get(c, p);
                return (text: unknown, ...rest: unknown[]) => {
                  if (typeof text === 'string' && text.startsWith('INSERT INTO goals'))
                    return Promise.reject(
                      Object.assign(Error('simulated failure'), { code: 'XX000' }),
                    );
                  return (c.query as (...a: unknown[]) => unknown).call(c, text, ...rest);
                };
              },
            });
          };
        },
      });
    await isolated(
      async (target, source) => {
        await seed(source.api);
        const backup = (await source.api('/backup')).data;
        await target.api('/workouts', 'POST', {
          date: '2025-01-01',
          title: '보존되어야 하는 기록',
          notes: '',
          sets: [{ exercise: '벤치', machine_id: null, weight: 50, reps: 5, notes: '' }],
        });
        const before = await target.count();
        const snapshot = normalize((await target.api('/backup')).data);
        const result = await target.api('/backup/restore', 'POST', {
          mode,
          backup,
          confirm: '전체 교체',
        });
        assert.equal(result.status, 500);
        assert.match(result.data.error, /전체 취소/);
        assert.deepEqual(await target.count(), before);
        assert.deepEqual(normalize((await target.api('/backup')).data), snapshot);
      },
      2,
      failing,
    );
  });
}

test(
  'analysis CSV is UTF-8 with escaping, formula guards, NULL cells and an optional date range',
  { skip },
  async () => {
    await isolated(async (db) => {
      await seed(db.api);
      const csv = await db.api('/export/workouts.csv');
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
      assert.match(
        csv.headers.get('content-disposition') ?? '',
        /attachment; filename="?workout-memo-workouts-\d{4}-\d{2}-\d{2}\.csv"?$/,
      );
      const rows = parseCsv(csv.text);
      assert.deepEqual(rows[0], [
        'workout_id',
        'date',
        'title',
        'workout_notes',
        'set_number',
        'exercise',
        'weight_kg',
        'reps',
        'volume_kg',
        'set_notes',
        'machine_id',
        'brand',
        'machine_name',
        'machine_base_weight_kg',
      ]);
      assert.equal(rows.length, 1 + 6, 'One row per set');
      const col = (name: string) => rows[0].indexOf(name);
      const first = rows[1];
      assert.equal(first[col('date')], '2024-02-29');
      assert.equal(first[col('title')], "'=SUM(A1) 하체", 'Formula-like titles are neutralized');
      assert.equal(first[col('workout_notes')], tricky);
      assert.equal(first[col('set_number')], '1');
      assert.equal(first[col('weight_kg')], '100.25');
      assert.equal(first[col('volume_kg')], '1002.5');
      assert.equal(first[col('brand')], 'Arsenal Strength');
      assert.equal(
        first[col('machine_base_weight_kg')],
        '',
        'Unknown base weight is an empty cell',
      );
      assert.equal(rows[2][col('set_notes')], "'+힘듦");
      const bodyweight = rows[3];
      assert.equal(bodyweight[col('machine_id')], '');
      assert.equal(bodyweight[col('machine_name')], '');
      assert.equal(bodyweight[col('weight_kg')], '0');
      assert.equal(bodyweight[col('set_notes')], tricky);
      assert.equal(rows[4][col('machine_name')], 'Iso Row, "와이드"');
      assert.equal(rows[4][col('machine_base_weight_kg')], '20.5');
      const ranged = parseCsv(
        (await db.api('/export/workouts.csv?from=2024-03-01&to=2024-03-01')).text,
      );
      assert.equal(ranged.length, 2);
      assert.equal(ranged[1][col('title')], '등');
      assert.equal(
        (await db.api('/export/workouts.csv?from=2024-03-02&to=2024-03-01')).status,
        400,
      );
      assert.equal((await db.api('/export/workouts.csv?from=2024-02-30')).status, 400);
    });
  },
);

test('idempotency keys are not part of the backup', { skip }, async () => {
  await isolated(async (db) => {
    const key = randomUUID();
    const saved = await db.pool.query(
      "INSERT INTO workout_requests(key,fingerprint,status,response) VALUES($1,'f',201,'{}') RETURNING key",
      [key],
    );
    assert.equal(saved.rowCount, 1);
    const exported = await db.api('/backup');
    assert.equal(exported.text.includes(key), false);
    assert.deepEqual(Object.keys(exported.data.data).sort(), [
      'brands',
      'goals',
      'machines',
      'routines',
      'workouts',
    ]);
  });
});

// Regression (#33 review): a retry key from before a replace must not replay the id of a
// workout the replace deleted, otherwise the client believes a lost save succeeded.
test(
  'a retried save after a replace restore never claims a deleted workout id',
  { skip },
  async () => {
    await isolated(async (db) => {
      const key = randomUUID();
      const body = {
        date: '2025-02-01',
        title: '응답 유실된 저장',
        notes: '',
        sets: [{ exercise: '벤치', machine_id: null, weight: 60, reps: 5, notes: '' }],
      };
      const save = (k: string) =>
        fetchJson(db, '/workouts', 'POST', body, { 'Idempotency-Key': k });
      const first = await save(key);
      assert.equal(first.status, 201);
      const backup = (await db.api('/backup')).data;

      // Add-only restore keeps retry keys: nothing was deleted, the replay is still true.
      const merged = await db.api('/backup/restore', 'POST', { mode: 'merge', backup });
      assert.equal(merged.status, 200);
      const replay = await save(key);
      assert.equal(replay.data.id, first.data.id);

      const preview = await db.api('/backup/preview', 'POST', { mode: 'replace', backup });
      assert.equal(preview.status, 200);
      assert.equal(
        (await db.pool.query('SELECT 1 FROM workout_requests WHERE key=$1', [key])).rowCount,
        1,
        'Preview does not clear retry keys',
      );
      const replaced = await db.api('/backup/restore', 'POST', {
        mode: 'replace',
        backup,
        confirm: '전체 교체',
      });
      assert.equal(replaced.status, 200);
      const exists = await db.pool.query('SELECT 1 FROM workouts WHERE id=$1', [first.data.id]);
      assert.equal(exists.rowCount, 0, 'Replace re-created the workout under a new id');

      const retried = await save(key);
      assert.ok([200, 201].includes(retried.status));
      assert.notEqual(retried.data.id, first.data.id, 'Must not replay the deleted id');
      assert.equal(
        (await db.pool.query('SELECT 1 FROM workouts WHERE id=$1', [retried.data.id])).rowCount,
        1,
        'The acknowledged id refers to a stored workout',
      );
      assert.equal(replaced.data.retry_keys_cleared, 1, 'The summary reports cleared retry keys');
    });
  },
);

async function fetchJson(
  db: Db,
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
) {
  const response = await fetch(`${db.base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as { id: number } };
}
