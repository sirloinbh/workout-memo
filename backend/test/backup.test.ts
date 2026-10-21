import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupFormat,
  backupVersion,
  csvCell,
  toCsv,
  parseBackup,
  BackupInvalid,
} from '../src/backup.js';
import { routineInput } from './routine-fixture.js';
import { parseCsv } from './csv-reader.js';

test('CSV cells keep commas, quotes, newlines and Korean intact', () => {
  const values = [
    '벤치, 프레스',
    '그립 "넓게"',
    '첫 줄\n둘째 줄',
    '캐리지\r리턴',
    '레그 프레스',
    '',
  ];
  const csv = toCsv([['a', 'b', 'c', 'd', 'e', 'f'], values]);
  assert.ok(csv.endsWith('\r\n'));
  assert.deepEqual(parseCsv(csv), [['a', 'b', 'c', 'd', 'e', 'f'], values]);
  assert.equal(csvCell('그립 "넓게"'), '"그립 ""넓게"""');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('평범한 값'), '평범한 값');
});

test('CSV neutralizes values a spreadsheet would run as formulas', () => {
  for (const value of ['=1+1', '+82', '-5', '@SUM(A1)', '\tcmd', '\rcmd', '=HYPERLINK("x")']) {
    const [[read]] = parseCsv(toCsv([[value]]));
    assert.equal(read, "'" + value, `${JSON.stringify(value)} starts with an apostrophe`);
  }
  // Ordinary text and numeric columns are not altered.
  assert.equal(parseCsv(toCsv([['스쿼트 -5kg']]))[0][0], '스쿼트 -5kg');
  assert.equal(csvCell(100.25), '100.25');
  assert.equal(csvCell(0), '0');
});

test('CSV writes NULL as an empty cell', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.deepEqual(parseCsv(toCsv([['x', null, 'y']])), [['x', '', 'y']]);
});

function validBackup() {
  return {
    format: backupFormat,
    version: backupVersion,
    exported_at: '2026-10-19T01:02:03.000Z',
    data: {
      brands: [{ id: 1, name: 'Arsenal Strength' }],
      machines: [{ id: 5, brand_id: 1, name: '레그 프레스', base_weight: null, notes: '' }],
      workouts: [
        {
          id: 9,
          date: '2024-02-29',
          title: '하체',
          notes: '',
          created_at: '2024-02-29T10:00:00.000Z',
          sets: [{ exercise: '레그 프레스', machine_id: 5, weight: 100.25, reps: 10, notes: '' }],
        },
      ],
      goals: [
        {
          id: 3,
          exercise: '레그 프레스',
          target_weight: 120,
          target_reps: 8,
          start_date: '2024-02-01',
          deadline: '2024-03-31',
        },
      ],
      routines: [{ id: 2, created_at: '2024-02-28T00:00:00.000Z', plan: routineInput() }],
    },
  };
}

function rejects(mutate: (b: ReturnType<typeof validBackup>) => unknown, pattern: RegExp) {
  const backup = validBackup();
  const value = mutate(backup) ?? backup;
  assert.throws(
    () => parseBackup(value),
    (e: unknown) => e instanceof BackupInvalid && pattern.test(e.message),
  );
}

test('backup validation accepts a well-formed v1 backup', () => {
  const parsed = parseBackup(validBackup());
  assert.equal(parsed.data.workouts[0].sets[0].weight, 100.25);
  assert.equal(parsed.data.machines[0].base_weight, null);
});

test('backup validation rejects other files and unsupported versions first', () => {
  rejects(() => 'not an object', /백업 파일 형식이 아닙니다/);
  rejects(() => [], /백업 파일 형식이 아닙니다/);
  rejects((b) => ({ ...b, format: 'other-app' }), /백업 파일 형식이 아닙니다/);
  rejects((b) => ({ ...b, version: 2 }), /지원하지 않는 백업 버전.*2/);
  rejects((b) => ({ ...b, version: '1' }), /지원하지 않는 백업 버전/);
});

test('backup validation rejects broken references, duplicate ids and invalid values', () => {
  rejects((b) => {
    b.data.machines[0].brand_id = 77;
  }, /machines\[0\].*브랜드 77/);
  rejects((b) => {
    b.data.workouts[0].sets[0].machine_id = 404;
  }, /workouts\[0\]\.sets\[0\].*머신 404/);
  rejects((b) => {
    b.data.workouts.push({ ...b.data.workouts[0] });
  }, /workouts.*중복된 id 9/);
  rejects((b) => {
    b.data.brands.push({ id: 2, name: 'Arsenal Strength' });
  }, /브랜드 이름이 중복/);
  rejects((b) => {
    b.data.machines.push({ ...b.data.machines[0], id: 6 });
  }, /같은 브랜드의 머신 이름이 중복/);
  rejects((b) => {
    b.data.workouts[0].date = '2024-02-30';
  }, /workouts\.0\.date/);
  rejects((b) => {
    b.data.workouts[0].sets[0].reps = 0;
  }, /reps/);
  rejects((b) => {
    b.data.goals[0].deadline = '2024-01-01';
  }, /목표 종료일/);
  rejects((b) => {
    (b.data.routines[0].plan as { split_count: number }).split_count = 4;
  }, /분할 개수/);
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).goals;
  }, /data\.goals/);
  // #82: a routine plan may name a machine, which must be in the same backup.
  rejects((b) => {
    (b.data.routines[0].plan.splits[0].exercises[0] as { machine_id?: number }).machine_id = 404;
  }, /routines\[0\].*머신 404/);
});

test('backup validation accepts a routine that names a machine in the backup (#82)', () => {
  const backup = validBackup();
  (backup.data.routines[0].plan.splits[0].exercises[0] as { machine_id?: number }).machine_id = 5;
  assert.equal(parseBackup(backup).data.routines[0].plan.splits[0].exercises[0].machine_id, 5);
});
