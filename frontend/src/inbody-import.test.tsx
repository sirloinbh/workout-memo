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
        return json({ error: '이미 기록한 날짜입니다' }, 409);
      saved.push(body);
      return json({ id: saved.length }, 201);
    }
    return [];
  });
  return { user: userEvent.setup(), saved, requests: api.requests };
}
const panel = () => screen.getByRole('region', { name: '인바디 가져오기' });
async function openImport(ui: ReturnType<typeof mount>) {
  render(<App />);
  await openPage('신체 기록', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '인바디 가져오기' }));
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
    within(panel()).getByLabelText('인바디 파일 또는 결과지 사진'),
    file(csv, 'inbody.csv', 'text/csv'),
  );
  await waitFor(() => expect(panel().textContent).toMatch(/열을 자동으로 찾았습니다/));
  expect(within(panel()).getByLabelText('1행 측정 날짜')).toHaveValue('2026-10-01');
  expect(within(panel()).getByLabelText('1행 체중 kg')).toHaveValue(72.4);
  // A row without a readable date cannot be saved until the user fills it.
  expect(within(panel()).getByLabelText('3행 저장')).toBeDisabled();
  expect(within(panel()).getByLabelText('3행 저장')).not.toBeChecked();
  await ui.user.type(within(panel()).getByLabelText('3행 측정 날짜'), '2026-10-12');
  expect(within(panel()).getByLabelText('3행 저장')).toBeChecked();
  await ui.user.clear(within(panel()).getByLabelText('1행 체지방률 %'));
  await ui.user.click(within(panel()).getByRole('button', { name: '선택한 3건 저장' }));
  await waitFor(() => expect(panel().textContent).toMatch(/2건을 저장했습니다/));
  expect(ui.saved).toEqual([
    { date: '2026-10-01', body_weight_kg: 72.4, body_fat_percent: null, skeletal_muscle_kg: 33.1 },
    { date: '2026-10-12', body_weight_kg: 71.5, body_fat_percent: null, skeletal_muscle_kg: null },
  ]);
  // The failed row keeps its values and the server's reason.
  expect(panel().textContent).toMatch(/이미 기록한 날짜입니다/);
  expect(within(panel()).getByLabelText('2행 저장')).toBeChecked();
});

test('columns that are not recognized can be chosen by the user', async () => {
  const ui = mount();
  await openImport(ui);
  await ui.user.upload(
    within(panel()).getByLabelText('인바디 파일 또는 결과지 사진'),
    file('day,kg\n2026-10-01,70.1', 'export.csv', 'text/csv'),
  );
  await waitFor(() => expect(panel().textContent).toMatch(/열을 직접 고르세요/));
  expect(within(panel()).getByLabelText('1행 체중 kg')).toHaveValue(null);
  await ui.user.selectOptions(within(panel()).getByLabelText('측정 날짜 열'), 'day');
  await ui.user.selectOptions(within(panel()).getByLabelText('체중 kg 열'), 'kg');
  expect(within(panel()).getByLabelText('1행 측정 날짜')).toHaveValue('2026-10-01');
  expect(within(panel()).getByLabelText('1행 체중 kg')).toHaveValue(70.1);
});

test('a photo is read in the browser and only its values are sent after review', async () => {
  const ui = mount();
  ocr.text = '측정일시 2026.10.15\n체중 (kg) 72.4\n골격근량 (kg) 33.1';
  await openImport(ui);
  const photo = file('image-bytes', 'sheet.jpg', 'image/jpeg');
  await ui.user.upload(within(panel()).getByLabelText('인바디 파일 또는 결과지 사진'), photo);
  await waitFor(() => expect(panel().textContent).toMatch(/읽은 값을 확인하고/));
  expect(ocr.images).toEqual([photo]);
  expect(within(panel()).getByLabelText('1행 체중 kg')).toHaveValue(72.4);
  expect(within(panel()).getByLabelText('1행 체지방률 %'), 'not read stays empty').toHaveValue(
    null,
  );
  await ui.user.click(within(panel()).getByRole('button', { name: '선택한 1건 저장' }));
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
