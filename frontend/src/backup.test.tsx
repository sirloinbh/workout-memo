import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { App } from './app';
import { json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/backup-ui.test.ts (vm hook harness) to a real DOM. Real file
// pickers, downloads, layout and focus still need separate browser verification.
type Summary = {
  mode: string;
  dry_run: boolean;
  tables: Record<string, { added: number; skipped: number; conflicts: number; deleted: number }>;
  conflicts: string[];
  retry_keys_cleared: number;
};
const summary = (mode: string, dry_run: boolean): Summary => ({
  mode,
  dry_run,
  tables: {
    brands: { added: 0, skipped: 4, conflicts: 0, deleted: mode === 'replace' ? 4 : 0 },
    machines: { added: 1, skipped: 0, conflicts: 1, deleted: mode === 'replace' ? 3 : 0 },
    workouts: { added: 7, skipped: 2, conflicts: 0, deleted: mode === 'replace' ? 5 : 0 },
    sets: { added: 21, skipped: 6, conflicts: 0, deleted: mode === 'replace' ? 15 : 0 },
    goals: { added: 1, skipped: 0, conflicts: 0, deleted: 0 },
    routines: { added: 0, skipped: 1, conflicts: 0, deleted: 0 },
  },
  conflicts: mode === 'merge' ? ['Arsenal Strength / 레그 프레스: 기존 값 유지'] : [],
  retry_keys_cleared: mode === 'replace' ? 3 : 0,
});
const backup = {
  format: 'workout-memo-backup',
  version: 1,
  data: { marker: crypto.randomUUID() },
};

function mount(previewError?: string) {
  const api = mockApi(({ url, body }) => {
    const mode = String((body as { mode?: unknown } | undefined)?.mode);
    if (url.pathname === '/api/backup/preview') {
      if (previewError) return json({ error: previewError }, 400);
      return summary(mode, true);
    }
    if (url.pathname === '/api/backup/restore') return summary(mode, false);
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const file = (content: string, size = content.length) => {
    const value = new File([content], 'workout-memo-backup-2026-10-19.json');
    // A real picker reports the on-disk size; only the size check reads it.
    Object.defineProperty(value, 'size', { value: size });
    return value;
  };
  const restoreButton = () => screen.queryByRole('button', { name: '복원 실행' });
  // Wait until the file input is enabled again (no preview in flight).
  const idle = () => waitFor(() => expect(screen.getByLabelText('백업 파일 선택')).toBeEnabled());
  async function choose(value: File) {
    await user.upload(screen.getByLabelText('백업 파일 선택'), value);
    await idle();
  }
  return { requests: api.requests, user, file, restoreButton, choose, idle };
}

const page = () => document.body.textContent ?? '';

async function openBackup(ui: ReturnType<typeof mount>) {
  await openPage('백업·내보내기', ui.user);
}

test('backup page separates the analysis CSV from the restore backup and states the policy', async () => {
  const ui = mount();
  await openBackup(ui);
  const csv = document.querySelector('a[href="/api/export/workouts.csv"]');
  const backupLink = document.querySelector('a[href="/api/backup"]');
  // Both downloads are offered.
  expect(csv).not.toBeNull();
  expect(backupLink).not.toBeNull();
  expect(csv).toHaveAttribute('download');
  expect(backupLink).toHaveAttribute('download');
  expect(page()).toMatch(/분석용 CSV/);
  expect(page()).toMatch(/복원용 백업/);
  expect(page()).toMatch(/CSV는 복원에 사용할 수 없습니다/);
  expect(page()).toMatch(/총중량/);
  expect(page()).toMatch(/=, \+, -, @/);
  expect(page()).toMatch(/추가만/);
  expect(page()).toMatch(/동일한 기록은 건너뜁니다/);
  expect(page()).toMatch(/전체 교체/);
  expect(page()).toMatch(/재시도 키/);
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('choosing a file shows an add-only preview before anything is restored', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.choose(ui.file(JSON.stringify(backup)));
  await waitFor(() => expect(page()).toMatch(/미리보기/));
  const preview = ui.requests.filter((r) => r.path === '/api/backup/preview');
  expect(preview).toHaveLength(1);
  expect(preview[0].body).toEqual({ mode: 'merge', backup });
  expect(ui.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(0);
  expect(page()).toMatch(/운동 일지.*추가 7.*건너뜀 2/s);
  expect(page()).toMatch(/세트.*추가 21/s);
  expect(page()).toMatch(/Arsenal Strength \/ 레그 프레스: 기존 값 유지/);
  expect(page()).not.toMatch(/삭제 5/);
  await ui.user.click(ui.restoreButton()!);
  await waitFor(() => expect(page()).toMatch(/복원을 완료했습니다/));
  const restore = ui.requests.filter((r) => r.path === '/api/backup/restore');
  expect(restore).toHaveLength(1);
  expect(restore[0].body).toEqual({ mode: 'merge', backup });
  // A completed restore cannot be resent.
  expect(ui.restoreButton()).toBeNull();
});

test('replace mode previews deletions and requires the typed confirmation', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.choose(ui.file(JSON.stringify(backup)));
  await waitFor(() => expect(ui.restoreButton()).not.toBeNull());
  await ui.user.selectOptions(screen.getByLabelText('복원 방식'), 'replace');
  await ui.idle();
  await waitFor(() => expect(page()).toMatch(/기존 기록이 삭제됩니다/));
  const previews = ui.requests.filter((r) => r.path === '/api/backup/preview');
  // Changing the mode refreshes the preview.
  expect(previews).toHaveLength(2);
  expect((previews[1].body as { mode: string }).mode).toBe('replace');
  expect(page()).toMatch(/진행 중이던 저장 재시도 기록도\s*초기화됩니다\(3건\)/);
  expect(page()).toMatch(/운동 일지.*삭제 5/s);
  // Replace is locked until confirmed.
  expect(ui.restoreButton()).toBeDisabled();
  const typed = screen.getByLabelText('확인 문구');
  await ui.user.type(typed, '전체교체');
  expect(ui.restoreButton()).toBeDisabled();
  await ui.user.clear(typed);
  await ui.user.type(typed, '전체 교체');
  expect(ui.restoreButton()).toBeEnabled();
  await ui.user.click(ui.restoreButton()!);
  await waitFor(() =>
    expect(ui.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(1),
  );
  const restore = ui.requests.filter((r) => r.path === '/api/backup/restore');
  expect(restore[0].body).toEqual({ mode: 'replace', backup, confirm: '전체 교체' });
});

test('unreadable, oversized or rejected files never reach restore', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.choose(ui.file('{"format":'));
  await waitFor(() => expect(page()).toMatch(/백업 파일을 읽을 수 없습니다/));
  await ui.choose(ui.file('{}', 10 * 1024 * 1024 + 1));
  await waitFor(() => expect(page()).toMatch(/10MB/));
  expect(screen.getByRole('alert')).toHaveTextContent(/10MB/);
  expect(ui.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  expect(ui.restoreButton()).toBeNull();

  // A second, independent app whose server rejects the preview.
  cleanup();
  const rejected = mount('지원하지 않는 백업 버전입니다 (v2). 지원 버전: v1');
  await openBackup(rejected);
  await rejected.choose(rejected.file(JSON.stringify(backup)));
  await waitFor(() => expect(page()).toMatch(/지원하지 않는 백업 버전입니다/));
  expect(rejected.restoreButton()).toBeNull();
  expect(rejected.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(0);
});
