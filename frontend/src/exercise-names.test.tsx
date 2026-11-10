import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { Combobox } from './components/combobox';
import { filterOptions } from './components/combobox-filter';
import { candidateNames, similarName } from './exercise-name-match';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #124: exercise name autocomplete (journal and goals) and similar-name hints.

test('options match ignoring spaces and case, skip the exact value and stop at eight', () => {
  const names = ['벤치프레스', '인클라인 벤치 프레스', 'Bench Press', '스쿼트'];
  expect(filterOptions(names, '벤치 프')).toEqual(['벤치프레스', '인클라인 벤치 프레스']);
  expect(filterOptions(names, 'bench')).toEqual(['Bench Press']);
  expect(filterOptions(names, '벤치프레스')).toEqual(['인클라인 벤치 프레스']);
  expect(filterOptions(names, '')).toEqual(names);
  expect(
    filterOptions(
      Array.from({ length: 20 }, (_, i) => `운동${i}`),
      '운동',
    ),
  ).toHaveLength(8);
});

test('candidates keep the server order and add local names once', () => {
  const server = [
    { name: '스쿼트', uses: 3, last_used: '2026-11-09' },
    { name: '벤치프레스', uses: 9, last_used: '2026-11-01' },
  ];
  expect(candidateNames(server, ['벤치프레스', ' 레그 프레스 ', '', '스쿼트'])).toEqual([
    '스쿼트',
    '벤치프레스',
    '레그 프레스',
  ]);
});

test('a similar name differs only in spaces or case; an exact name is not similar', () => {
  const names = ['벤치프레스', 'Lat Pulldown'];
  expect(similarName('벤치 프레스', names)).toBe('벤치프레스');
  expect(similarName(' lat pulldown ', names)).toBe('Lat Pulldown');
  expect(similarName('벤치프레스', names)).toBeNull();
  expect(similarName('벤치', names)).toBeNull();
  expect(similarName('  ', names)).toBeNull();
});

function Field({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="name">운동명</label>
      <Combobox
        id="name"
        value={value}
        onValueChange={setValue}
        options={['벤치프레스', '인클라인 벤치프레스', '스쿼트']}
        listLabel="운동명 후보"
      />
    </form>
  );
}

test('the field is a combobox: arrows move, Enter picks without submitting, Esc only closes the list', async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Field onSubmit={submit} />);
  const input = screen.getByRole('combobox', { name: '운동명' });
  expect(input).toHaveAttribute('aria-expanded', 'false');

  await user.type(input, '벤치');
  const list = screen.getByRole('listbox', { name: '운동명 후보' });
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(input).toHaveAttribute('aria-controls', list.id);
  expect(
    within(list)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['벤치프레스', '인클라인 벤치프레스']);

  await user.keyboard('{ArrowDown}{ArrowDown}');
  const second = within(list).getByRole('option', { name: '인클라인 벤치프레스' });
  expect(second).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant', second.id);
  await user.keyboard('{Enter}');
  expect(input).toHaveValue('인클라인 벤치프레스');
  expect(submit).not.toHaveBeenCalled();
  expect(input).toHaveAttribute('aria-expanded', 'false');

  // Esc closes the list and stops there: a dialog around the field must stay open.
  const outer = vi.fn();
  document.addEventListener('keydown', outer, { capture: true });
  await user.clear(input);
  await user.type(input, '스');
  expect(input).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  // With the list closed, Esc reaches the dialog as before.
  await user.keyboard('{Escape}');
  expect(outer).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  document.removeEventListener('keydown', outer, { capture: true });

  // A new name is kept as typed, and a tap on an option picks it.
  await user.clear(input);
  await user.type(input, '새 운동');
  expect(input).toHaveValue('새 운동');
  await user.clear(input);
  await user.type(input, '스');
  await user.click(screen.getByRole('option', { name: '스쿼트' }));
  expect(input).toHaveValue('스쿼트');
  expect(input).toHaveFocus();
});

function mount() {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/exercise-names')
      return [
        { name: '벤치프레스', uses: 5, last_used: '2026-10-14' },
        { name: '스쿼트', uses: 8, last_used: '2026-10-10' },
      ];
    if (url.pathname === '/api/goals' && method === 'POST') return json({ id: 1 }, 201);
    if (url.pathname === '/api/workouts' && method === 'POST')
      return json({ id: 42, version: 1 }, 201);
    return [];
  });
  return { user: userEvent.setup(), requests: api.requests };
}

test('journal sets suggest earlier names and offer the existing spelling of a similar one', async () => {
  const ui = mount();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
  await ui.user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
  const dialog = screen.getByRole('dialog');
  const first = within(dialog).getAllByRole('combobox', { name: '운동명' })[0];

  await ui.user.type(first, '스');
  await ui.user.click(await within(dialog).findByRole('option', { name: '스쿼트' }));
  expect(first).toHaveValue('스쿼트');

  await ui.user.clear(first);
  await ui.user.type(first, '벤치 프레스');
  const hint = await within(dialog).findByText(/기존 이름 ‘벤치프레스’로 바꿀까요\?/);
  expect(first).toHaveValue('벤치 프레스'); // Nothing changes until the user agrees.
  await ui.user.click(within(hint).getByRole('button', { name: '바꾸기' }));
  expect(first).toHaveValue('벤치프레스');
  expect(within(dialog).queryByText(/바꿀까요/)).toBeNull();
});

test('the goal form picks a suggestion and saves the existing spelling', async () => {
  const ui = mount();
  render(<App />);
  await openPage('나의 목표', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '목표 추가' }));
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByRole('combobox', { name: '운동명' });
  await ui.user.type(input, '벤치');
  await ui.user.click(await within(dialog).findByRole('option', { name: '벤치프레스' }));
  expect(input).toHaveValue('벤치프레스');
  fireEvent.change(within(dialog).getByLabelText('목표 총중량 (kg)'), { target: { value: '80' } });
  await ui.user.click(within(dialog).getByRole('button', { name: /목표 저장/ }));
  await waitFor(() =>
    expect(ui.requests.find((r) => r.method === 'POST' && r.path === '/api/goals')?.body).toEqual(
      expect.objectContaining({ exercise: '벤치프레스', target_weight: 80 }),
    ),
  );
});
