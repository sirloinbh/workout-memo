import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/body-ui.test.ts (vm hook harness) to a real DOM. Real browser
// layout, SVG painting, focus and native validation are verified separately.
type Body = {
  id: number;
  date: string;
  body_weight_kg: number | null;
  body_fat_percent: number | null;
  skeletal_muscle_kg: number | null;
};

const fixture = (): Body[] => [
  {
    id: 1,
    date: '2024-03-03',
    body_weight_kg: 99,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
  {
    id: 2,
    date: '2024-03-04',
    body_weight_kg: 70.5,
    body_fat_percent: 20,
    skeletal_muscle_kg: null,
  },
  {
    id: 3,
    date: '2024-03-05',
    body_weight_kg: null,
    body_fat_percent: 19.8,
    skeletal_muscle_kg: null,
  },
  {
    id: 4,
    date: '2024-03-06',
    body_weight_kg: 70.25,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
  { id: 5, date: '2024-03-07', body_weight_kg: 70, body_fat_percent: null, skeletal_muscle_kg: 33 },
  {
    id: 6,
    date: '2024-03-18',
    body_weight_kg: 98,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
];

function mount(now?: string) {
  if (now) fixClock(now);
  vi.stubGlobal('confirm', () => true);
  let records = fixture();
  let nextId = 100;
  const workouts = [
    {
      id: 9,
      version: 1,
      date: '2024-03-06',
      title: 'Lower body',
      notes: '',
      sets: [
        { exercise: 'Squat', machine_id: null, weight: 100.25, reps: 10, notes: '' },
        // #31: a planned set stays out of the same-day volume (still 1,002.5).
        {
          exercise: 'Squat',
          machine_id: null,
          weight: 200,
          reps: 10,
          notes: '',
          completed: false,
          rpe: null,
        },
      ],
    },
  ];
  const api = mockApi(({ method, url, body }) => {
    const inRange = (date: string) =>
      date >= url.searchParams.get('from')! && date <= url.searchParams.get('to')!;
    if (url.pathname === '/api/workouts') return workouts.filter((w) => inRange(w.date));
    if (url.pathname.startsWith('/api/body-measurements')) {
      const id = Number(url.pathname.split('/')[3]);
      const record = body as Body;
      if (method === 'GET')
        return records.filter((r) => inRange(r.date)).sort((a, b) => a.date.localeCompare(b.date));
      if (method === 'POST') {
        if (records.some((r) => r.date === record.date))
          return json(
            { error: 'A body record already exists for this date. Edit the existing record.' },
            409,
          );
        records.push({ ...record, id: nextId });
        return json({ ...record, id: nextId++ }, 201);
      }
      if (method === 'PUT') {
        records = records.map((r) => (r.id === id ? { ...record, id } : r));
        return { ...record, id };
      }
      if (method === 'DELETE') {
        records = records.filter((r) => r.id !== id);
        return { ok: true };
      }
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const bodyGets = () =>
    api.requests.filter((r) => r.method === 'GET' && r.path.startsWith('/api/body-measurements'));
  // Waits for the newest body request to finish rendering.
  const loaded = () => waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  const input = (label: string) => {
    const item = [...document.querySelectorAll('label')].find((e) =>
      e.textContent.trim().startsWith(label),
    );
    expect(item, `Input label ${label} exists`).toBeDefined();
    const found = item!.querySelector('input');
    expect(found).not.toBeNull();
    return found!;
  };
  async function change(label: string, value: string) {
    const target = input(label);
    if (target.type === 'date') {
      // jsdom date inputs do not accept typed keys; set the value as the browser would.
      fireEvent.change(target, { target: { value } });
    } else {
      await user.clear(target);
      await user.type(target, value);
    }
  }
  async function click(label: string) {
    // Period tabs are radios; everything else clicked here is a button.
    const button =
      screen.queryByRole('radio', { name: label }) ?? screen.getByRole('button', { name: label });
    expect(button, `${label} is enabled`).toBeEnabled();
    await user.click(button);
  }
  async function setAnchor(value: string) {
    const before = bodyGets().length;
    fireEvent.change(screen.getByLabelText('Reference date'), { target: { value } });
    await waitFor(() => expect(bodyGets().length).toBeGreaterThan(before));
    await loaded();
  }
  async function submit() {
    await user.click(screen.getByRole('button', { name: 'Save body record' }));
  }
  const chart = (label: string) => {
    const found = [...document.querySelectorAll('[aria-label]')].find((e) =>
      e.getAttribute('aria-label')!.startsWith(label + ' trend'),
    );
    expect(found, `${label} trend chart exists`).toBeDefined();
    return {
      label: found!.getAttribute('aria-label')!,
      points: found!.querySelectorAll('[data-slot="chart-dot"]').length,
      lines: found!.querySelectorAll('polyline').length,
      text: found!.textContent,
    };
  };
  return {
    user,
    requests: api.requests,
    bodyGets,
    loaded,
    input,
    change,
    click,
    setAnchor,
    submit,
    chart,
  };
}

const page = () => document.body.textContent ?? '';

async function openWeek() {
  const ui = mount();
  await openPage('Body records');
  await ui.loaded();
  // The body page starts at 12 weeks (#123); these cases pick one week explicitly.
  await ui.click('1 week');
  await ui.loaded();
  // The period anchor is reused on the body page.
  await ui.setAnchor('2024-03-06');
  // 3/4..3/7 are the four records of the anchored week.
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Body records' })).getAllByRole('listitem'),
    ).toHaveLength(4),
  );
  return ui;
}

test('body page reuses the selected period and plots only recorded values without bridging gaps', async () => {
  const ui = await openWeek();
  expect(ui.bodyGets().at(-1)?.path).toBe('/api/body-measurements?from=2024-03-04&to=2024-03-10');
  await waitFor(() => expect(page()).toMatch(/1,002\.5/));
  const weight = ui.chart('Weight');
  // 3/4, 3/6, 3/7 have weight; 3/5 has a record without weight, so the line breaks there.
  expect(weight.points).toBe(3);
  // Only 3/6→3/7 is connected.
  expect(weight.lines).toBe(1);
  expect(weight.label).toMatch(/2024-03-04 70\.5/);
  expect(weight.label).toMatch(/2024-03-07 70(?:\D|$)/);
  // Missing weight is not plotted as 0.
  expect(weight.label).not.toMatch(/2024-03-05/);
  // Out-of-range records are excluded.
  expect(weight.label).not.toMatch(/2024-03-03|99/);
  const fat = ui.chart('Body fat');
  expect(fat.points).toBe(2);
  expect(fat.lines).toBe(1);
  const muscle = ui.chart('Skeletal muscle mass');
  expect(muscle.points).toBe(1);
  expect(muscle.lines).toBe(0);
  expect(page()).toMatch(/Not entered/);
  // Same-day workout volume is shown side by side.
  expect(page()).toMatch(/1,002\.5/);
  // Side-by-side view states it is not causation.
  expect(page()).toMatch(/causal/);
  expect(page()).not.toMatch(/normal|abnormal|obese|overweight|underweight|risk|health status/i);
  expect(page()).not.toMatch(/2024-03-18/);
});

const trendCharts = () =>
  [...document.querySelectorAll('[aria-label]')].filter((e) =>
    / trend \(/.test(e.getAttribute('aria-label')!),
  );

test('default period is 12 weeks so a record from last week is charted on first open', async () => {
  // Monday 2024-03-11 in Seoul; the latest records (3/3–3/7) are all from last week.
  const ui = mount('2024-03-11T03:00:00Z');
  await openPage('Body records', ui.user);
  await ui.loaded();
  expect(ui.bodyGets().at(-1)?.path).toBe('/api/body-measurements?from=2023-12-19&to=2024-03-11');
  expect(screen.getByRole('radio', { name: '12 weeks' })).toBeChecked();
  await waitFor(() => expect(ui.chart('Weight').points).toBe(4));
  expect(ui.chart('Body fat').points).toBe(2);
  expect(ui.chart('Skeletal muscle mass').points).toBe(1);
  expect(page()).not.toMatch(/Metrics with no values/);
});

test('the 12-week default is only for the body page; a chosen preset is shared', async () => {
  const ui = mount('2024-03-11T03:00:00Z');
  await openPage('Body records', ui.user);
  await ui.loaded();
  await openPage('Dashboard', ui.user);
  // The dashboard keeps its one-week default.
  await waitFor(() => expect(page()).toMatch(/2024-03-11 — 2024-03-17/));
  expect(screen.getByRole('radio', { name: '1 week' })).toBeChecked();
  await ui.click('4 weeks');
  await openPage('Body records', ui.user);
  // Once chosen, the period is shared again instead of falling back to 12 weeks.
  await waitFor(() =>
    expect(ui.bodyGets().at(-1)?.path).toBe('/api/body-measurements?from=2024-02-13&to=2024-03-11'),
  );
  expect(screen.getByRole('radio', { name: '4 weeks' })).toBeChecked();
});

test('empty period replaces empty charts with one line', async () => {
  const ui = await openWeek();
  await ui.click('Next period');
  await waitFor(() =>
    expect(ui.bodyGets().at(-1)?.path).toBe('/api/body-measurements?from=2024-03-11&to=2024-03-17'),
  );
  await waitFor(() => expect(page()).toMatch(/No body records in the selected period/));
  // No empty chart cards; the metrics without values are named in a single line.
  expect(trendCharts()).toHaveLength(0);
  expect(page()).toMatch(
    /Metrics with no values in this period: Weight · Body fat · Skeletal muscle mass/,
  );
  await ui.click('1 month');
  await waitFor(() =>
    expect(ui.bodyGets().at(-1)?.path).toBe('/api/body-measurements?from=2024-03-01&to=2024-03-31'),
  );
  // Month view includes 3/3 and 3/18 weights.
  await waitFor(() => expect(ui.chart('Weight').points).toBe(5));
});

test('partial input is sent with nulls; blank input is blocked; duplicate date keeps the form', async () => {
  const ui = await openWeek();
  await ui.click('Add body record');
  await ui.submit();
  await waitFor(() => expect(page()).toMatch(/Enter at least one/));
  expect(ui.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

  await ui.change('Measurement date', '2024-03-08');
  await ui.change('Skeletal muscle mass', '33.4');
  await ui.submit();
  await waitFor(() => expect(ui.requests.filter((r) => r.method === 'POST')).toHaveLength(1));
  const post = ui.requests.filter((r) => r.method === 'POST').at(-1);
  expect(post?.body).toEqual({
    date: '2024-03-08',
    body_weight_kg: null,
    body_fat_percent: null,
    skeletal_muscle_kg: 33.4,
  });
  // Saved record is re-queried and plotted.
  await waitFor(() => expect(ui.chart('Skeletal muscle mass').points).toBe(2));
  // No weight was estimated for the new date.
  expect(ui.chart('Weight').points).toBe(3);

  await ui.click('Add body record');
  await ui.change('Measurement date', '2024-03-04');
  await ui.change('Weight', '71');
  await ui.submit();
  await waitFor(() => expect(page()).toMatch(/already exists/));
  // Input is kept after a conflict.
  expect(ui.input('Weight').value).toBe('71');
});

test('edit sends a full replacement via PUT and delete removes the record', async () => {
  const ui = await openWeek();
  await ui.click('Edit body record 2024-03-05');
  expect(ui.input('Body fat').value).toBe('19.8');
  await ui.change('Weight', '71');
  await ui.submit();
  await waitFor(() => expect(ui.requests.filter((r) => r.method === 'PUT')).toHaveLength(1));
  const put = ui.requests.filter((r) => r.method === 'PUT').at(-1);
  expect(put?.path).toBe('/api/body-measurements/3');
  expect(put?.body).toEqual({
    date: '2024-03-05',
    body_weight_kg: 71,
    body_fat_percent: 19.8,
    skeletal_muscle_kg: null,
  });
  // 3/4..3/7 now all have weight, so the whole week is one connected line.
  await waitFor(() => expect(ui.chart('Weight').points).toBe(4));
  expect(ui.chart('Weight').lines).toBe(1);

  await ui.click('Delete body record 2024-03-06');
  await waitFor(() => expect(ui.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1));
  const del = ui.requests.filter((r) => r.method === 'DELETE').at(-1);
  expect(del?.path).toBe('/api/body-measurements/4');
  await waitFor(() => expect(ui.chart('Weight').label).not.toMatch(/2024-03-06/));
  expect(ui.chart('Weight').points).toBe(3);
});

test('a failed load reports the error without claiming the metrics are empty', async () => {
  mockApi(({ url }) => {
    if (url.pathname.startsWith('/api/body-measurements')) throw new TypeError('Failed to fetch');
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('Body records', user);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Reconnect');
  expect(page()).not.toMatch(/Metrics with no values/);
});

test('the record form, its messages and the list are named for assistive technology', async () => {
  const ui = await openWeek();
  const list = screen.getByRole('list', { name: 'Body records' });
  // The card title carries the count.
  expect(screen.getByRole('heading', { level: 2, name: 'Body records 4' })).toBeInTheDocument();
  expect(
    within(list)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent),
  ).toEqual(['2024-03-07', '2024-03-06', '2024-03-05', '2024-03-04']);
  expect(within(list).getByRole('button', { name: 'Edit body record 2024-03-05' })).toBeEnabled();
  await ui.click('Add body record');
  expect(screen.getByRole('heading', { level: 2, name: 'New body record' })).toBeInTheDocument();
  for (const name of ['Weight kg', 'Body fat %', 'Skeletal muscle mass kg'])
    expect(screen.getByRole('spinbutton', { name })).toHaveValue(null);
  // A blank form is refused with an alert next to the form.
  await ui.submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Enter at least one/);
  await ui.user.type(screen.getByRole('spinbutton', { name: 'Weight kg' }), '70.5');
  await ui.change('Measurement date', '2024-03-09');
  await ui.submit();
  expect(await screen.findByRole('status')).toHaveTextContent('Body record saved');
  expect(screen.queryByRole('heading', { name: 'New body record' })).toBeNull();
  // Cancel closes the form without saving.
  await ui.click('Add body record');
  await ui.click('Cancel');
  expect(screen.queryByRole('heading', { name: 'New body record' })).toBeNull();
  expect(ui.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
});
