import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #89: InBody results become an editable preview; only confirmed rows are saved.
const ocr = vi.hoisted(() => ({ text: '', images: [] as unknown[] }));
vi.mock('tesseract.js', () => ({
  createWorker: () =>
    Promise.resolve({
      recognize: (image: unknown) => {
        ocr.images.push(image);
        return Promise.resolve({ data: { text: ocr.text } });
      },
      terminate: () => Promise.resolve(undefined),
    }),
}));

function mount() {
  fixClock();
  const saved: unknown[] = [];
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/body-measurements' && method === 'POST') {
      if ((body as { date: string }).date === '2026-10-08')
        return json({ error: 'This date is already recorded' }, 409);
      saved.push(body);
      return json({ id: saved.length }, 201);
    }
    return [];
  });
  return { user: userEvent.setup(), saved, requests: api.requests };
}
const panel = () => screen.getByRole('region', { name: 'Import InBody' });
async function openImport(ui: ReturnType<typeof mount>) {
  render(<App />);
  await openPage('Body records', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Import InBody' }));
  // #222: the header button says whether the panel is open.
  expect(screen.getByRole('button', { name: 'Import InBody' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
}
const file = (content: string, name: string, type: string) => new File([content], name, { type });

test('a CSV export is previewed, corrected and saved row by row', async () => {
  const ui = mount();
  await openImport(ui);
  const csv = [
    '측정일시,체중(kg),체지방률(%),골격근량(kg),기타',
    '2026.10.01 07:30,72.4,18.3,33.1,x',
    '2026.10.08 07:30,72.0,18.1,33.2,x',
    '잘못된 날짜,71.5,,,x',
  ].join('\n');
  await ui.user.upload(
    within(panel()).getByLabelText('InBody file or result sheet photo'),
    file(csv, 'inbody.csv', 'text/csv'),
  );
  await waitFor(() => expect(panel().textContent).toMatch(/found automatically/));
  expect(within(panel()).getByLabelText('Row 1 measurement date')).toHaveValue('2026-10-01');
  expect(within(panel()).getByLabelText('Row 1 weight kg')).toHaveValue(72.4);
  // A row without a readable date cannot be saved until the user fills it.
  expect(within(panel()).getByLabelText('Save row 3')).toBeDisabled();
  expect(within(panel()).getByLabelText('Save row 3')).not.toBeChecked();
  await ui.user.type(within(panel()).getByLabelText('Row 3 measurement date'), '2026-10-12');
  expect(within(panel()).getByLabelText('Save row 3')).toBeChecked();
  await ui.user.clear(within(panel()).getByLabelText('Row 1 body fat %'));
  await ui.user.click(within(panel()).getByRole('button', { name: 'Save 3 selected' }));
  await waitFor(() => expect(panel().textContent).toMatch(/2 records saved/));
  expect(ui.saved).toEqual([
    { date: '2026-10-01', body_weight_kg: 72.4, body_fat_percent: null, skeletal_muscle_kg: 33.1 },
    { date: '2026-10-12', body_weight_kg: 71.5, body_fat_percent: null, skeletal_muscle_kg: null },
  ]);
  // The failed row keeps its values and the server's reason.
  expect(panel().textContent).toMatch(/This date is already recorded/);
  // #223: the partial failure is an alert in the panel, apart from the saved count.
  expect(within(panel()).getByRole('alert')).toHaveTextContent('1 record was not saved');
  expect(within(panel()).getByRole('status')).toHaveTextContent('2 records saved.');
  expect(within(panel()).getByLabelText('Save row 2')).toBeChecked();
});

test('columns that are not recognized can be chosen by the user', async () => {
  const ui = mount();
  await openImport(ui);
  await ui.user.upload(
    within(panel()).getByLabelText('InBody file or result sheet photo'),
    file('day,kg\n2026-10-01,70.1', 'export.csv', 'text/csv'),
  );
  await waitFor(() => expect(panel().textContent).toMatch(/Choose them below/));
  expect(within(panel()).getByLabelText('Row 1 weight kg')).toHaveValue(null);
  await ui.user.selectOptions(within(panel()).getByLabelText('Measurement date column'), 'day');
  await ui.user.selectOptions(within(panel()).getByLabelText('Weight kg column'), 'kg');
  expect(within(panel()).getByLabelText('Row 1 measurement date')).toHaveValue('2026-10-01');
  expect(within(panel()).getByLabelText('Row 1 weight kg')).toHaveValue(70.1);
});

test('a photo is read in the browser and only its values are sent after review', async () => {
  const ui = mount();
  ocr.text = '측정일시 2026.10.15\n체중 (kg) 72.4\n골격근량 (kg) 33.1';
  await openImport(ui);
  const photo = file('image-bytes', 'sheet.jpg', 'image/jpeg');
  await ui.user.upload(within(panel()).getByLabelText('InBody file or result sheet photo'), photo);
  await waitFor(() => expect(panel().textContent).toMatch(/Check the values read/));
  expect(ocr.images).toEqual([photo]);
  expect(within(panel()).getByLabelText('Row 1 weight kg')).toHaveValue(72.4);
  expect(within(panel()).getByLabelText('Row 1 body fat %'), 'not read stays empty').toHaveValue(
    null,
  );
  await ui.user.click(within(panel()).getByRole('button', { name: 'Save 1 selected' }));
  await waitFor(() => expect(ui.saved).toHaveLength(1));
  expect(ui.saved[0]).toEqual({
    date: '2026-10-15',
    body_weight_kg: 72.4,
    body_fat_percent: null,
    skeletal_muscle_kg: 33.1,
  });
  // The image itself is never uploaded: every request body is JSON values only.
  expect(ui.requests.every((r) => !(r.body instanceof File))).toBe(true);
});

test('the preview is a scrollable named table with checkbox rows and announced results', async () => {
  const ui = mount();
  await openImport(ui);
  expect(within(panel()).getByRole('heading', { level: 2, name: 'Import InBody' })).toBeVisible();
  const csv = [
    '측정일시,체중(kg),체지방률(%),골격근량(kg)',
    '2026.10.01 07:30,72.4,18.3,33.1',
  ].join('\n');
  await ui.user.upload(
    within(panel()).getByLabelText('InBody file or result sheet photo'),
    file(csv, 'inbody.csv', 'text/csv'),
  );
  // The table sits in a focusable scroll region so a phone or keyboard can reach every column.
  const scroller = within(panel()).getByRole('region', { name: 'InBody preview' });
  expect(scroller).toHaveAttribute('tabindex', '0');
  const table = within(scroller).getByRole('table');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual([
    'Save',
    'Measurement date',
    'Weight kg',
    'Body fat %',
    'Skeletal muscle mass kg',
    'Confirm',
  ]);
  const save = within(table).getByRole('checkbox', { name: 'Save row 1' });
  expect(save).toBeChecked();
  // Unticking a row leaves nothing to save; ticking it again restores it.
  await ui.user.click(save);
  expect(save).not.toBeChecked();
  expect(within(panel()).getByRole('button', { name: 'Save 0 selected' })).toBeDisabled();
  await ui.user.click(save);
  await ui.user.click(within(panel()).getByRole('button', { name: 'Save 1 selected' }));
  expect(await within(panel()).findByRole('status')).toHaveTextContent('1 record saved.');
  expect(within(table).getByRole('cell', { name: 'Saved' })).toBeInTheDocument();
});

test('an unreadable file is reported as an alert inside the panel', async () => {
  const ui = mount();
  await openImport(ui);
  await ui.user.upload(
    within(panel()).getByLabelText('InBody file or result sheet photo'),
    file('No columns', 'inbody.csv', 'text/csv'),
  );
  expect(await within(panel()).findByRole('alert')).toBeVisible();
  expect(within(panel()).queryByRole('table')).toBeNull();
});
