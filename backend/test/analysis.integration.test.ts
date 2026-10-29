import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

type PR = { value: number; date: string; ties: number } | null;
type Exercise = {
  key: string;
  exercise: string;
  body_parts: string[];
  unknown_base_sets: number;
  prs: Record<'max_weight' | 'max_reps' | 'max_set_volume' | 'actual_1rm' | 'estimated_1rm', PR>;
  trend: { date: string; max_weight: number | null }[];
};
type Week = {
  week_start: string;
  sets: number;
  volume: number;
  parts: { body_part: string; sets: number; volume: number }[];
};

test(
  'PostgreSQL exercise analysis: normalized identity, mapping, future exclusion, edit/delete recompute',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api`;
    const tag = `Analysis ${randomUUID().slice(0, 8)}`;
    const bench = `${tag} Bench`;
    const row = `${tag} Row`;
    const benchKey = bench.toLowerCase();
    const workoutIds: number[] = [];
    const goalIds: number[] = [];
    let machineId: number | undefined;
    const call = async (path: string, method = 'GET', body?: unknown, status = 200) => {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.status, status, `${method} ${path}`);
      return response.json();
    };
    const workout = (date: string, sets: unknown[]) => ({ date, title: tag, notes: '', sets });
    const s = (
      exercise: string,
      weight: number,
      reps: number,
      machine_id: number | null = null,
    ) => ({
      exercise,
      machine_id,
      weight,
      reps,
      notes: '',
    });
    const create = async (value: unknown) => {
      const created = await call('/workouts', 'POST', value, 201);
      workoutIds.push(created.id);
      return created as { id: number; version: number };
    };
    // A dedicated past range (1987) avoids other fixtures; 2099 stays in the future.
    const analysis = async () => {
      const data = await call('/analysis?from=1987-03-02&to=1987-03-08');
      const own = (data.exercises as Exercise[]).filter((x) => x.key.startsWith(tag.toLowerCase()));
      return { own, weeks: data.weeks as Week[], today: data.today as string };
    };
    const part = (week: Week, name: string) => week.parts.find((p) => p.body_part === name)!;
    try {
      const brand = (await call('/brands'))[0].id;
      machineId = (
        await call(
          '/machines',
          'POST',
          { brand_id: brand, name: `${tag} 머신`, base_weight: null, notes: '' },
          201,
        )
      ).id;
      // Mapping keys use the goal judgment identity: case and outer spaces are ignored.
      const saved = await call('/exercise-body-parts', 'PUT', {
        exercise: `  ${bench.toUpperCase()}  `,
        body_parts: ['어깨', '가슴'],
      });
      assert.deepEqual(saved, { exercise: benchKey, body_parts: ['가슴', '어깨'] });
      const mappings = await call('/exercise-body-parts');
      assert.deepEqual(
        mappings.find((m: { exercise: string }) => m.exercise === benchKey)?.body_parts,
        ['가슴', '어깨'],
      );

      // 1987-03-02 is a Monday and 1987-03-08 the following Sunday.
      const monday = await create(
        workout('1987-03-02', [s(bench, 100, 5), s(row.toUpperCase(), 80, 8)]),
      );
      // #31: a planned (not completed) set is not performance; it must not change
      // any PR, trend or weekly total asserted below.
      await create(
        workout('1987-03-08', [
          s(bench.toLowerCase(), 100, 5),
          { ...s(bench, 200, 10), completed: false },
        ]),
      );
      const nextWeek = await create(workout('1987-03-09', [s(bench, 105, 3)]));
      await create(workout('1987-03-01', [s(bench, 60, 1, machineId)]));
      await create(workout('2099-01-01', [s(bench, 999, 1)]));

      const first = await analysis();
      let { own, weeks } = first;
      const { today } = first;
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(own.length, 2, 'Case variants are one exercise');
      const b = own.find((x) => x.key === benchKey)!;
      assert.equal(b.exercise, bench, 'Latest spelling (1987-03-09) is shown');
      assert.deepEqual(b.body_parts, ['가슴', '어깨']);
      assert.equal(b.unknown_base_sets, 1);
      assert.deepEqual(
        [b.prs.max_weight?.value, b.prs.max_weight?.date],
        [105, '1987-03-09'],
        'All-time PR excludes the 2099 record',
      );
      assert.equal(b.prs.actual_1rm, null, 'Unknown machine base weight is not an actual 1RM');
      assert.equal(b.prs.estimated_1rm?.value, 116.67);
      assert.equal(b.prs.estimated_1rm?.date, '1987-03-02');
      assert.equal(b.prs.estimated_1rm?.ties, 2);
      assert.deepEqual(
        b.trend.map((t) => [t.date, t.max_weight]),
        [
          ['1987-03-02', 100],
          ['1987-03-08', 100],
        ],
      );
      const r = own.find((x) => x.key === row.toLowerCase())!;
      assert.deepEqual(r.body_parts, []);
      assert.equal(weeks.length, 1);
      assert.equal(weeks[0].week_start, '1987-03-02');
      assert.equal(weeks[0].sets, 3);
      assert.equal(weeks[0].volume, 1640);
      assert.deepEqual(part(weeks[0], '가슴'), { body_part: '가슴', sets: 2, volume: 1000 });
      assert.deepEqual(part(weeks[0], '어깨'), { body_part: '어깨', sets: 2, volume: 1000 });
      assert.deepEqual(part(weeks[0], '미분류'), { body_part: '미분류', sets: 1, volume: 640 });

      // Goals share the same identity rule.
      const goal = await call(
        '/goals',
        'POST',
        {
          exercise: bench.toUpperCase(),
          target_weight: 105,
          target_reps: 3,
          start_date: '1987-03-01',
          deadline: '1987-03-31',
        },
        201,
      );
      goalIds.push(goal.id);
      const goals = await call('/goals');
      assert.equal(goals.find((g: { id: number }) => g.id === goal.id)?.achieved, true);

      // Edit lowers the all-time PR; the tie between the two 100 kg sets reappears.
      await call(`/workouts/${nextWeek.id}`, 'PUT', {
        ...workout('1987-03-09', [s(bench, 90, 3)]),
        version: nextWeek.version,
      });
      ({ own, weeks } = await analysis());
      let edited = own.find((x) => x.key === benchKey)!;
      assert.deepEqual(
        [edited.prs.max_weight?.value, edited.prs.max_weight?.date, edited.prs.max_weight?.ties],
        [100, '1987-03-02', 2],
      );

      await call(`/workouts/${monday.id}`, 'DELETE');
      ({ own, weeks } = await analysis());
      edited = own.find((x) => x.key === benchKey)!;
      assert.deepEqual(
        [edited.prs.max_weight?.value, edited.prs.max_weight?.date, edited.prs.max_weight?.ties],
        [100, '1987-03-08', 1],
      );
      assert.equal(own.length, 1, 'The deleted row exercise disappears');
      assert.equal(weeks[0].sets, 1);
      assert.equal(part(weeks[0], '미분류').sets, 0);

      // Clearing the mapping moves the exercise to 미분류.
      await call('/exercise-body-parts', 'PUT', { exercise: bench, body_parts: [] });
      ({ own, weeks } = await analysis());
      assert.deepEqual(own[0].body_parts, []);
      assert.deepEqual(part(weeks[0], '미분류'), { body_part: '미분류', sets: 1, volume: 500 });
      assert.equal(part(weeks[0], '가슴').sets, 0);
    } finally {
      for (const id of workoutIds) await pool.query('DELETE FROM workouts WHERE id=$1', [id]);
      for (const id of goalIds) await pool.query('DELETE FROM goals WHERE id=$1', [id]);
      await pool.query('DELETE FROM exercise_body_parts WHERE exercise LIKE $1', [
        tag.toLowerCase() + '%',
      ]);
      if (machineId) await pool.query('DELETE FROM machines WHERE id=$1', [machineId]);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    }
  },
);
