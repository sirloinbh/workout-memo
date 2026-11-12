import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/official-weights-ui.test.ts (vm hook harness) to a real DOM.
// It checks rendered text and handlers; browser layout and link opening still need
// browser verification.
const brands = [
  { id: 1, name: 'Arsenal Strength' },
  { id: 2, name: 'Hammer Strength' },
  { id: 3, name: 'Other' },
  { id: 4, name: 'Newtech' },
];
const bench = {
  id: 11,
  brand: 'Hammer Strength',
  lineup: 'Plate-Loaded',
  model_number: 'IL-BP',
  model_name: 'Iso-Lateral Bench Press',
  official_item_name: 'Starting Resistance (per arm)',
  setting: '',
  status: 'verified',
  raw_value: '7.00',
  raw_unit: 'lb',
  official_kg_text: '3.2 kg',
  weight_kg: '3.18',
  basis: 'per_arm',
  source_url:
    'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-bench-press',
  checked_date: '2026-10-19',
  notes: '',
};
const unknown = {
  ...bench,
  id: 12,
  brand: 'Arsenal Strength',
  lineup: 'Reloaded',
  model_number: '',
  model_name: 'Reloaded Multi-Flex',
  official_item_name: 'Starting Resistance',
  status: 'unverified',
  raw_value: null,
  raw_unit: null,
  official_kg_text: null,
  weight_kg: null,
  basis: null,
  source_url: null,
  notes: '제조사 공식 자료를 찾지 못했다.',
};
const onhim = {
  ...unknown,
  id: 13,
  brand: 'Newtech',
  lineup: '온힘',
  model_name: '온힘 라인업 (모델 미확인)',
  notes: 'Official site lookup failed',
};
const linkedMachine = {
  id: 5,
  brand_id: 2,
  brand: 'Hammer Strength',
  name: 'My Chest Press',
  base_weight: null,
  notes: '',
  official_weight_id: 11,
  official_status: 'verified',
  official_model_name: bench.model_name,
  official_setting: '',
  official_raw_value: '7.00',
  official_raw_unit: 'lb',
  official_weight_kg: '3.18',
  official_basis: 'per_arm',
  official_source_url: bench.source_url,
  official_checked_date: '2026-10-19',
};

function mount(failReferences = false) {
  const api = mockApi(({ method, url }) => {
    if (method !== 'GET') return { id: 99 };
    if (url.pathname === '/api/official-machine-weights' && failReferences)
      return json({ error: 'relation does not exist' }, 500);
    if (url.pathname === '/api/machines') return [linkedMachine];
    if (url.pathname === '/api/brands') return brands;
    if (url.pathname === '/api/official-machine-weights') return [bench, unknown, onhim];
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const mutations = () =>
    api.requests
      .filter((r) => r.method !== 'GET')
      .map((r) => ({ ...r, body: r.body as Record<string, unknown> }));
  // Waits until brands, machines and official references have been answered and rendered.
  const settle = async () => {
    await waitFor(() => {
      const paths = api.requests.map((r) => r.url.pathname);
      for (const path of ['/api/brands', '/api/machines', '/api/official-machine-weights'])
        expect(paths).toContain(path);
    });
    await Promise.allSettled(api.fetch.mock.results.map((r) => r.value));
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const button = (label: string) => screen.getAllByRole('button', { name: label })[0];
  const labelled = <T extends 'select' | 'input'>(label: string, type: T) => {
    const found = [...document.querySelectorAll('label')]
      .filter((l) => l.textContent.startsWith(label))
      .flatMap((l) => [...l.querySelectorAll(type)])[0];
    expect(found, `${type} ${label}`).toBeDefined();
    return found;
  };
  const options = (select: HTMLSelectElement) =>
    [...select.querySelectorAll('option')].map((o) => o.textContent);
  const submit = () => user.click(screen.getByRole('button', { name: 'Save machine' }));
  return { user, settle, button, labelled, options, submit, mutations };
}

const texts = (value: string) =>
  [...document.querySelectorAll('*')].filter((e) => e.textContent === value);

test('machine library shows the linked official reference with basis and source, not as base weight', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  const row = document.querySelector<HTMLElement>('[data-slot="machine-row"]')!;
  expect(row).not.toBeNull();
  const rowText = row.textContent;
  expect(rowText).toMatch(
    /Official reference \(Iso-Lateral Bench Press\): 7 lb = 3\.18 kg · One side/,
  );
  expect(rowText).toMatch(/checked 2026-10-19/);
  expect(row.querySelector('strong')!.textContent).toBe('Not entered');
  const link = row.querySelector('a')!;
  expect(link).toHaveAttribute('href', bench.source_url);
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

test('journal machine select shows the official reference next to the user base weight', async () => {
  const ui = mount();
  await ui.settle();
  await ui.user.click(ui.button('Log workout'));
  const option = document.querySelector('option[value="5"]');
  expect(option).not.toBeNull();
  expect(option!.textContent).toBe(
    'Hammer Strength · My Chest Press (base weight unconfirmed) · Official reference 7 lb = 3.18 kg · One side',
  );
});

test('registering a machine links a reference without filling or changing base weight', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  await ui.user.click(ui.button('Add machine'));
  await ui.user.selectOptions(ui.labelled('Brand', 'select'), '2');
  const select = ui.labelled('Official reference', 'select');
  expect(ui.options(select)).toEqual([
    'Not linked',
    'Plate-Loaded · Iso-Lateral Bench Press — 7 lb = 3.18 kg · One side',
  ]);
  await ui.user.selectOptions(select, '11');
  // Selected reference details are shown.
  const note = screen.getByRole('note');
  const noteText = note.textContent;
  expect(noteText).toMatch(/Official reference: 7 lb = 3\.18 kg · One side/);
  expect(noteText).toMatch(
    /IL-BP · Starting Resistance \(per arm\) · Manufacturer kg figure 3\.2 kg/,
  );
  expect(noteText).toMatch(/checked 2026-10-19/);
  expect(noteText).toMatch(/not automatically added/);
  expect(note.querySelector('a')).toHaveAttribute('href', bench.source_url);
  // Base weight stays empty.
  expect(ui.labelled('Base weight', 'input').value).toBe('');
  await ui.user.type(ui.labelled('Machine name', 'input'), 'Bench');
  await ui.submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  expect(ui.mutations()[0].path).toBe('/api/machines');
  expect(ui.mutations()[0].body.official_weight_id).toBe(11);
  expect(ui.mutations()[0].body.base_weight).toBeNull();
});

test('unverified references read Official value unconfirmed and changing brand clears a mismatched link', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  await ui.user.click(ui.button('Add machine'));
  await ui.user.selectOptions(ui.labelled('Brand', 'select'), '1');
  await ui.user.selectOptions(ui.labelled('Official reference', 'select'), '12');
  const noteText = screen.getByRole('note').textContent;
  expect(noteText).toMatch(/Official reference: Official value unconfirmed/);
  expect(noteText).toMatch(/제조사 공식 자료를 찾지 못했다/);
  expect(noteText).toMatch(/No official source/);
  expect(noteText).not.toMatch(/0 kg/);
  await ui.user.selectOptions(ui.labelled('Brand', 'select'), '3');
  expect(screen.queryAllByRole('note')).toHaveLength(0);
  expect(texts('No official reference data for this brand.').length).toBeGreaterThan(0);
  await ui.user.type(ui.labelled('Machine name', 'input'), 'Other machine');
  await ui.submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  expect(ui.mutations()[0].body.official_weight_id).toBeNull();
});

test('a reference load failure does not block machines and is reported in the form', async () => {
  const ui = mount(true);
  await ui.settle();
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  await openPage('Machine Library', ui.user);
  expect(
    within(screen.getByRole('list', { name: 'Machine' })).getAllByRole('listitem'),
  ).toHaveLength(1);
  await ui.user.click(ui.button('Add machine'));
  expect(texts('Could not load the official reference.').length).toBeGreaterThan(0);
});

test('Newtech is selectable on register and its references read Official value unconfirmed', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  expect(screen.getByRole('radio', { name: 'Newtech' })).toBeInTheDocument();
  await ui.user.click(ui.button('Add machine'));
  const brandSelect = ui.labelled('Brand', 'select');
  expect(ui.options(brandSelect)).toContain('Newtech');
  await ui.user.selectOptions(brandSelect, '4');
  expect(ui.options(ui.labelled('Official reference', 'select'))).toEqual([
    'Not linked',
    '온힘 · 온힘 라인업 (모델 미확인) — Official value unconfirmed',
  ]);
});

test('brand tabs pick one brand at a time and an empty brand shows the empty state', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  const tabs = screen.getByRole('radiogroup', { name: 'Brand' });
  expect(within(tabs).getByRole('radio', { name: 'All brands' })).toBeChecked();
  expect(
    within(screen.getByRole('list', { name: 'Machine' })).getAllByRole('listitem'),
  ).toHaveLength(1);
  await ui.user.click(within(tabs).getByRole('radio', { name: 'Arsenal Strength' }));
  expect(within(tabs).getByRole('radio', { name: 'Arsenal Strength' })).toBeChecked();
  expect(within(tabs).getByRole('radio', { name: 'All brands' })).not.toBeChecked();
  expect(screen.queryByRole('list', { name: 'Machine' })).toBeNull();
  expect(
    screen.getByRole('heading', { level: 3, name: 'Register your own machine' }),
  ).toBeInTheDocument();
  // Clicking the current tab again keeps it selected.
  await ui.user.click(within(tabs).getByRole('radio', { name: 'Arsenal Strength' }));
  expect(within(tabs).getByRole('radio', { name: 'Arsenal Strength' })).toBeChecked();
  // A brand that has a machine keeps it (the tab value is a string, the brand id a number).
  await ui.user.click(within(tabs).getByRole('radio', { name: 'Hammer Strength' }));
  expect(
    within(screen.getByRole('list', { name: 'Machine' })).getByRole('heading', { level: 3 }),
  ).toHaveTextContent('My Chest Press');
  await ui.user.click(within(tabs).getByRole('radio', { name: 'All brands' }));
  expect(
    within(screen.getByRole('list', { name: 'Machine' })).getAllByRole('listitem'),
  ).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 2, name: 'Machine Library' })).toBeInTheDocument();
});

test('the machine form names every field and saves notes and the single-joint checkbox', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('Machine Library', ui.user);
  await ui.user.click(ui.button('Add machine'));
  const dialog = screen.getByRole('dialog', { name: 'Add machine' });
  const form = within(dialog);
  await ui.user.selectOptions(form.getByRole('combobox', { name: 'Brand' }), '2');
  expect(form.getByRole('combobox', { name: 'Official reference (optional)' })).toHaveValue('');
  await ui.user.type(form.getByRole('textbox', { name: 'Machine name' }), 'Cable Fly');
  expect(form.getByRole('spinbutton', { name: /Base weight \(kg\)/ })).toHaveValue(null);
  await ui.user.type(form.getByRole('textbox', { name: 'Source / setting notes' }), 'Pin 3');
  const singleJoint = form.getByRole('checkbox', { name: /Single-joint exercise machine/ });
  expect(singleJoint).not.toBeChecked();
  // The visible label toggles the checkbox too.
  await ui.user.click(form.getByText(/Single-joint exercise machine/));
  expect(singleJoint).toBeChecked();
  await ui.submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  expect(ui.mutations()[0].body).toMatchObject({
    brand_id: 2,
    name: 'Cable Fly',
    notes: 'Pin 3',
    single_joint: true,
    base_weight: null,
    official_weight_id: null,
  });
});
