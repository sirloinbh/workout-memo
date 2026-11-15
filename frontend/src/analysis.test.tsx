import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { type AnalysisSet, analyze } from '../../backend/src/analysis';
import { App } from './app';
import { bodyPartLabel } from './labels';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/analysis-ui.test.ts (vm hook harness) to a real DOM. The
// in-memory API reuses the real server-side analysis function on fixed rows.
type Row = Omit<AnalysisSet, 'id' | 'exercise_key'>;
type Mapping = { exercise: string; body_parts: string[] };

function mount(initialRows: Row[] = []) {
  // A UTC device at 00:30 Seoul time on Thursday 2026-10-15.
  fixClock();
  const server = {
    rows: structuredClone(initialRows),
    mappings: [] as { exercise: string; body_part: string }[],
  };
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/exercise-body-parts' && method === 'PUT') {
      const mapping = body as Mapping;
      const key = mapping.exercise.trim().toLowerCase();
      server.mappings = [
        ...server.mappings.filter((m) => m.exercise !== key),
        ...mapping.body_parts.map((body_part) => ({ exercise: key, body_part })),
      ];
      return { exercise: key, body_parts: mapping.body_parts };
    }
    if (url.pathname === '/api/analysis') {
      const today = '2026-10-15';
      const rows = server.rows
        .filter((r) => r.date <= today)
        .map((r, id) => ({ ...r, id, exercise_key: r.exercise.trim().toLowerCase() }));
      return {
        ...analyze(
          rows,
          server.mappings,
          url.searchParams.get('from')!,
          url.searchParams.get('to')!,
        ),
        today,
      };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const analysisRequests = () =>
    api.requests.filter((r) => r.path.startsWith('/api/analysis')).map((r) => r.path);
  return { server, requests: api.requests, user, analysisRequests };
}

const page = () => document.body.textContent ?? '';
const loaded = () =>
  waitFor(() => {
    expect(screen.queryByText('Loading analysis…')).toBeNull();
    expect(document.querySelector('[data-slot="analysis-page"] [data-slot="card"]')).not.toBeNull();
  });
const partRow = (week: string, name: string) => {
  const article = [...document.querySelectorAll('[data-slot="analysis-week"]')].find((e) =>
    e.textContent.startsWith(week),
  );
  expect(article, `week ${week}`).toBeDefined();
  const row = [...article!.querySelectorAll('tr')].find((e) =>
    e.textContent.startsWith(bodyPartLabel(name)),
  );
  expect(row, `row ${name}`).toBeDefined();
  return row!.textContent;
};
// #125: one exercise is shown in detail at a time; picking it from the list shows it.
const shownDetail = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="exercise-pr"]')].find(
    (e) => e.querySelector('h3')?.textContent === name,
  );
const exercise = (name: string) => {
  if (!shownDetail(name)) {
    const list = screen.getByRole('list', { name: 'Exercise list' });
    const item = [...list.querySelectorAll('button')].find(
      (b) => b.querySelector('span')?.textContent === name,
    );
    expect(item, `list item ${name}`).toBeDefined();
    fireEvent.click(item!);
  }
  const card = shownDetail(name);
  expect(card, `exercise ${name}`).toBeDefined();
  return card!;
};
const row = (
  date: string,
  exercise: string,
  weight: number,
  reps: number,
  unknown_base = false,
) => ({
  date,
  exercise,
  weight,
  reps,
  unknown_base,
});

test('empty analysis shows Monday-start week totals, 미분류 and the 1RM policy', async () => {
  const ui = mount();
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  expect(ui.analysisRequests()).toEqual(['/api/analysis?from=2026-10-12&to=2026-10-18']);
  expect(page()).toMatch(/No records to analyze/);
  expect(page()).toMatch(/Est\. 1RM = total weight kg × \(1 \+ reps ÷ 30\)/);
  expect(page()).toMatch(/applies only to sets of 1-10 reps/);
  expect(page()).toMatch(/measured 1RM/);
  expect(page()).toMatch(/body part totals can be larger than the weekly total/);
  expect(page()).toMatch(/2026-10-12 — 2026-10-18 · Total 0 sets · 0kg/);
  expect(partRow('2026-10-12', '미분류')).toBe('Unclassified0 sets0kg');
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('4 and 12 week tabs request Monday-aligned ranges ending with the anchor week', async () => {
  const ui = mount();
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  await ui.user.click(screen.getByRole('radio', { name: '4 weeks' }));
  await ui.user.click(screen.getByRole('radio', { name: '12 weeks' }));
  // jsdom date inputs do not accept typed keys; set the value as the browser would.
  fireEvent.change(screen.getByLabelText('Analysis reference date'), {
    target: { value: '2025-01-05' },
  });
  await waitFor(() => expect(ui.analysisRequests()).toHaveLength(4));
  expect(ui.analysisRequests()).toEqual([
    '/api/analysis?from=2026-10-12&to=2026-10-18',
    '/api/analysis?from=2026-09-21&to=2026-10-18',
    '/api/analysis?from=2026-07-27&to=2026-10-18',
    '/api/analysis?from=2024-10-14&to=2025-01-05',
  ]);
});

test('PRs show ties, exclusions and trends; mapping and journal changes recompute on read', async () => {
  const ui = mount([
    row('2026-10-12', 'Bench Press', 100, 5),
    row('2026-10-13', 'bench press', 100, 5),
    row('2026-10-13', 'Bench Press', 0, 12),
    row('2026-10-14', 'Bench Press', 60, 1, true),
    row('2026-10-14', 'Row', 80, 8),
    row('2026-10-16', 'Bench Press', 300, 1),
  ]);
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  const bench = exercise('Bench Press');
  const text = bench.textContent;
  // Future 300 kg excluded.
  expect(text).toMatch(/Best weight100kg × 5 reps · 2026-10-12 · 2 tied/);
  expect(text).toMatch(/Most reps12 reps · 0kg · 2026-10-13/);
  expect(text).toMatch(/Measured 1RMNo 1-rep set recorded/);
  expect(text).toMatch(
    /Est\. 1RM \(Epley\)116\.67kg est\. \(100kg × 5 reps\) · 2026-10-12 · 2 tied/,
  );
  expect(text).toMatch(
    /1 set on machines with unconfirmed base weight is excluded from the 1RM calculation/,
  );
  expect(text).toMatch(/1 set at 0kg is included only in rep PRs/);
  expect(text).toMatch(/Body parts: Unclassified/);
  const trend = bench.querySelector('[role="img"]')!.getAttribute('aria-label')!;
  expect(trend).toMatch(/2026-10-12 best weight 100kg, max reps 5, est\. 1RM 116\.67kg/);
  expect(trend).toMatch(/2026-10-14 best weight 60kg, max reps 1, est\. 1RM excluded/);
  expect(partRow('2026-10-12', '미분류')).toBe('Unclassified5 sets1,700kg');

  await ui.user.click(screen.getByRole('button', { name: 'Set body part for Bench Press' }));
  await ui.user.click(screen.getByRole('button', { name: 'Shoulders' }));
  await ui.user.click(screen.getByRole('button', { name: 'Chest' }));
  await ui.user.click(screen.getByRole('button', { name: 'Save body parts' }));
  await waitFor(() =>
    expect(exercise('Bench Press').textContent).toMatch(/Body parts: Chest, Shoulders/),
  );
  const put = ui.requests.find((r) => r.method === 'PUT');
  expect(put?.body).toEqual({ exercise: 'Bench Press', body_parts: ['가슴', '어깨'] });
  expect(partRow('2026-10-12', '가슴')).toBe('Chest4 sets1,060kg');
  expect(partRow('2026-10-12', '어깨')).toBe('Shoulders4 sets1,060kg');
  expect(partRow('2026-10-12', '미분류')).toBe('Unclassified1 set640kg');
  expect(page()).toMatch(/2026-10-12 — 2026-10-18 · Total 5 sets · 1,700kg/);

  // Journal edits/deletes happen elsewhere; returning re-reads the server records.
  ui.server.rows = ui.server.rows
    .filter((r) => r.date !== '2026-10-12')
    .map((r) => (r.exercise === 'Row' ? { ...r, weight: 90 } : r));
  await openPage('Workout journal', ui.user);
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  const updated = exercise('Bench Press').textContent;
  // The former tie is gone.
  expect(updated).toMatch(/Best weight100kg × 5 reps · 2026-10-13Most/);
  expect(exercise('Row').textContent).toMatch(/Best weight90kg × 8 reps/);
  expect(partRow('2026-10-12', '미분류')).toBe('Unclassified1 set720kg');
});

test('the mapping editor offers Biceps and Triceps; a saved 팔 is shown only until it is removed (#88)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10), row('2026-10-13', 'Dip', 0, 10)]);
  ui.server.mappings = [{ exercise: 'curl', body_part: '팔' }];
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  expect(exercise('Curl').textContent).toMatch(/Body parts: Arms/);
  expect(partRow('2026-10-12', '팔')).toBe('Arms1 set200kg');

  exercise('Dip');
  await ui.user.click(screen.getByRole('button', { name: 'Set body part for Dip' }));
  expect(screen.getByRole('button', { name: 'Biceps' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Triceps' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Arms' }), 'not offered for new choices').toBeNull();
  await ui.user.click(screen.getByRole('button', { name: 'Triceps' }));
  await ui.user.click(screen.getByRole('button', { name: 'Save body parts' }));
  await waitFor(() => expect(exercise('Dip').textContent).toMatch(/Body parts: Triceps/));

  exercise('Curl');
  await ui.user.click(screen.getByRole('button', { name: 'Set body part for Curl' }));
  const legacy = screen.getByRole('button', { name: 'Arms' });
  expect(legacy).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(screen.getByRole('button', { name: 'Biceps' }));
  await ui.user.click(screen.getByRole('button', { name: 'Save body parts' }));
  // Saving without touching 팔 keeps it; the user decides when to remove it.
  expect(ui.requests.filter((r) => r.method === 'PUT').at(-1)!.body).toEqual({
    exercise: 'Curl',
    body_parts: ['팔', '이두'],
  });
  await waitFor(() => expect(exercise('Curl').textContent).toMatch(/Body parts: Arms, Biceps/));
});

test('cancelling the mapping editor sends nothing and the PR count badge matches (#102)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10), row('2026-10-13', 'Dip', 0, 10)]);
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  const prs = screen.getByRole('region', { name: 'PRs by exercise' });
  expect(prs.querySelector('[data-slot="badge"]')!.textContent).toBe('2');
  expect(within(prs).getByRole('heading', { level: 2 }).textContent).toBe('PRs by exercise 2');
  expect(screen.getByRole('region', { name: 'Weekly volume by body part' })).toBeInTheDocument();

  exercise('Curl');
  await ui.user.click(screen.getByRole('button', { name: 'Set body part for Curl' }));
  expect(screen.getByRole('group', { name: 'Body part for Curl' })).toBeInTheDocument();
  await ui.user.click(screen.getByRole('button', { name: 'Biceps' }));
  expect(screen.getByRole('button', { name: 'Biceps' })).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group', { name: 'Body part for Curl' })).toBeNull();
  expect(ui.requests.some((r) => r.method === 'PUT')).toBe(false);
  expect(exercise('Curl').textContent).toMatch(/Body parts: Unclassified/);
});

test('a failed load shows an alert whose Reconnect button reloads the analysis (#102)', async () => {
  fixClock();
  let fail = true;
  const api = mockApi(({ url }) => {
    if (url.pathname === '/api/analysis') {
      if (fail) return json({ error: 'Cannot connect to the analysis server' }, 503);
      return {
        ...analyze([], [], url.searchParams.get('from')!, url.searchParams.get('to')!),
        today: '2026-10-15',
      };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('Exercise Analysis', user);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Cannot connect to the analysis server');
  expect(alert).toHaveAttribute('data-slot', 'alert-banner');
  // The period controls are the shared DateStepper and RangeSummary.
  expect(
    screen.getByLabelText('Analysis reference date').closest('[data-slot="date-stepper"]'),
  ).not.toBeNull();
  expect(document.querySelector('[data-slot="range-summary"]')!.textContent).toMatch(
    /2026-10-12 — 2026-10-18.*Monday-start weeks/,
  );

  fail = false;
  await user.click(within(alert).getByRole('button', { name: 'Reconnect' }));
  await loaded();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.requests.filter((r) => r.path.startsWith('/api/analysis'))).toHaveLength(2);
});

test('the list shows one summary line per exercise and one exercise in detail at a time (#125)', async () => {
  const ui = mount([
    row('2026-10-12', 'Bench Press', 100, 5),
    row('2026-10-13', 'Row', 80, 8),
    row('2026-10-14', 'Dip', 0, 10),
  ]);
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  const list = screen.getByRole('list', { name: 'Exercise list' });
  const items = within(list).getAllByRole('button');
  // The server orders exercises by their latest date.
  expect(items.map((b) => b.textContent)).toEqual([
    'DipNo weight recorded · 2026-10-14',
    'RowBest 80kg · Est. 1RM 101.33kg · 2026-10-13',
    'Bench PressBest 100kg · Est. 1RM 116.67kg · 2026-10-12',
  ]);
  // Before a pick the first exercise is shown (wide screens) but not announced as current.
  expect(document.querySelectorAll('[data-slot="exercise-pr"]')).toHaveLength(1);
  expect(items[0]).toHaveAttribute('data-shown');
  expect(items[0]).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('heading', { level: 3, name: 'Dip' })).toBeInTheDocument();

  // Wide screen (the test default): picking keeps focus on the list.
  await ui.user.click(items[1]);
  expect(items[1]).toHaveFocus();
  expect(items[1]).toHaveAttribute('aria-current', 'true');
  expect(items[0]).not.toHaveAttribute('data-shown');
  expect(document.querySelectorAll('[data-slot="exercise-pr"]')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Set body part for Row' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set body part for Dip' })).toBeNull();
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('on a phone a pick focuses the detail and Exercise list returns focus to that exercise (#125)', async () => {
  const media = window.matchMedia;
  window.matchMedia = (query: string) => ({
    ...media(query),
    matches: query === '(max-width: 767px)',
  });
  try {
    const ui = mount([row('2026-10-12', 'Bench Press', 100, 5), row('2026-10-13', 'Row', 80, 8)]);
    await openPage('Exercise Analysis', ui.user);
    await loaded();
    const list = screen.getByRole('list', { name: 'Exercise list' });
    const bench = within(list).getByRole('button', { name: /^Bench Press/ });
    await ui.user.click(bench);
    expect(screen.getByRole('heading', { level: 3, name: 'Bench Press' })).toHaveFocus();
    await ui.user.click(screen.getByRole('button', { name: 'Exercise list' }));
    expect(bench).toHaveFocus();
    expect(bench).not.toHaveAttribute('aria-current');
  } finally {
    window.matchMedia = media;
  }
});

test('parts without sets fold into a closed details under the week (#125)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10)]);
  ui.server.mappings = [{ exercise: 'curl', body_part: '이두' }];
  await openPage('Exercise Analysis', ui.user);
  await loaded();
  const week = document.querySelector<HTMLElement>('[data-slot="analysis-week"]')!;
  const folded = week.querySelector('details')!;
  expect(folded.open).toBe(false);
  expect(folded.querySelector('summary')!.textContent).toMatch(
    /^Body parts with no records \(8\) · Chest, Back, Shoulders, Triceps/,
  );
  // The visible table lists only parts with sets.
  const visible = [...week.querySelectorAll('tr')].filter((tr) => !folded.contains(tr));
  expect(visible.map((tr) => tr.textContent)).toEqual(['Body partSetsVolume', 'Biceps1 set200kg']);
  expect(partRow('2026-10-12', '가슴')).toBe('Chest0 sets0kg');
});
