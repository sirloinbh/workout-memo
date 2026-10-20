import { render, screen, waitFor } from '@testing-library/react';
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
  { id: 3, name: '기타' },
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
  notes: '공식 사이트 조회 실패',
};
const linkedMachine = {
  id: 5,
  brand_id: 2,
  brand: 'Hammer Strength',
  name: '내 체스트 프레스',
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
      .filter((l) => l.textContent!.startsWith(label))
      .flatMap((l) => [...l.querySelectorAll(type)])[0];
    expect(found, `${type} ${label}`).toBeDefined();
    return found as HTMLElementTagNameMap[T];
  };
  const options = (select: HTMLSelectElement) =>
    [...select.querySelectorAll('option')].map((o) => o.textContent);
  const submit = () => user.click(screen.getByRole('button', { name: '머신 저장하기' }));
  return { user, settle, button, labelled, options, submit, mutations };
}

const texts = (value: string) =>
  [...document.querySelectorAll('*')].filter((e) => e.textContent === value);

test('machine library shows the linked official reference with basis and source, not as base weight', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('머신 라이브러리', ui.user);
  const row = document.querySelector<HTMLElement>('.workout-row')!;
  expect(row).not.toBeNull();
  const rowText = row.textContent;
  expect(rowText).toMatch(/공식 참고값\(Iso-Lateral Bench Press\): 7 lb = 3\.18 kg · 편측/);
  expect(rowText).toMatch(/2026-10-19 확인/);
  expect(row.querySelector('strong')!.textContent).toBe('미입력');
  const link = row.querySelector('a')!;
  expect(link).toHaveAttribute('href', bench.source_url);
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

test('journal machine select shows the official reference next to the user base weight', async () => {
  const ui = mount();
  await ui.settle();
  await ui.user.click(ui.button('운동 기록하기'));
  const option = document.querySelector('option[value="5"]');
  expect(option).not.toBeNull();
  expect(option!.textContent).toBe(
    'Hammer Strength · 내 체스트 프레스 (기본중량 미확인) · 공식 참고값 7 lb = 3.18 kg · 편측',
  );
});

test('registering a machine links a reference without filling or changing base weight', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('머신 라이브러리', ui.user);
  await ui.user.click(ui.button('머신 등록'));
  await ui.user.selectOptions(ui.labelled('브랜드', 'select'), '2');
  const select = ui.labelled('공식 참고값', 'select');
  expect(ui.options(select)).toEqual([
    '연결 안 함',
    'Plate-Loaded · Iso-Lateral Bench Press — 7 lb = 3.18 kg · 편측',
  ]);
  await ui.user.selectOptions(select, '11');
  // Selected reference details are shown.
  const note = screen.getByRole('note');
  const noteText = note.textContent;
  expect(noteText).toMatch(/공식 참고값: 7 lb = 3\.18 kg · 편측/);
  expect(noteText).toMatch(/IL-BP · Starting Resistance \(per arm\) · 제조사 kg 표기 3\.2 kg/);
  expect(noteText).toMatch(/2026-10-19 확인/);
  expect(noteText).toMatch(/자동 반영되지 않습니다/);
  expect(note.querySelector('a')).toHaveAttribute('href', bench.source_url);
  // Base weight stays empty.
  expect(ui.labelled('기본중량', 'input').value).toBe('');
  await ui.user.type(ui.labelled('머신 이름', 'input'), '벤치');
  await ui.submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  expect(ui.mutations()[0].path).toBe('/api/machines');
  expect(ui.mutations()[0].body.official_weight_id).toBe(11);
  expect(ui.mutations()[0].body.base_weight).toBeNull();
});

test('unverified references read 공식값 미확인 and changing brand clears a mismatched link', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('머신 라이브러리', ui.user);
  await ui.user.click(ui.button('머신 등록'));
  await ui.user.selectOptions(ui.labelled('브랜드', 'select'), '1');
  await ui.user.selectOptions(ui.labelled('공식 참고값', 'select'), '12');
  const noteText = screen.getByRole('note').textContent;
  expect(noteText).toMatch(/공식 참고값: 공식값 미확인/);
  expect(noteText).toMatch(/제조사 공식 자료를 찾지 못했다/);
  expect(noteText).toMatch(/공식 출처 없음/);
  expect(noteText).not.toMatch(/0 kg/);
  await ui.user.selectOptions(ui.labelled('브랜드', 'select'), '3');
  expect(screen.queryAllByRole('note')).toHaveLength(0);
  expect(texts('이 브랜드의 공식 참고값 자료가 없습니다.').length).toBeGreaterThan(0);
  await ui.user.type(ui.labelled('머신 이름', 'input'), '기타 머신');
  await ui.submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  expect(ui.mutations()[0].body.official_weight_id).toBeNull();
});

test('a reference load failure does not block machines and is reported in the form', async () => {
  const ui = mount(true);
  await ui.settle();
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  await openPage('머신 라이브러리', ui.user);
  expect(document.querySelectorAll('.workout-row')).toHaveLength(1);
  await ui.user.click(ui.button('머신 등록'));
  expect(texts('공식 참고값을 불러오지 못했습니다.').length).toBeGreaterThan(0);
});

test('Newtech is selectable on register and its references read 공식값 미확인', async () => {
  const ui = mount();
  await ui.settle();
  await openPage('머신 라이브러리', ui.user);
  expect(screen.getAllByRole('button', { name: 'Newtech' }).length).toBeGreaterThan(0);
  await ui.user.click(ui.button('머신 등록'));
  const brandSelect = ui.labelled('브랜드', 'select');
  expect(ui.options(brandSelect)).toContain('Newtech');
  await ui.user.selectOptions(brandSelect, '4');
  expect(ui.options(ui.labelled('공식 참고값', 'select'))).toEqual([
    '연결 안 함',
    '온힘 · 온힘 라인업 (모델 미확인) — 공식값 미확인',
  ]);
});
