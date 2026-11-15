import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { deferred, json, mockApi } from './test/api';
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
    cardio_sessions: { added: 2, skipped: 1, conflicts: 0, deleted: 0 },
    cardio_goals: { added: 1, skipped: 1, conflicts: 0, deleted: 0 },
  },
  conflicts: mode === 'merge' ? ['Arsenal Strength / Leg Press: existing value kept'] : [],
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
  const restoreButton = () => screen.queryByRole('button', { name: 'Run restore' });
  // Wait until the file input is enabled again (no preview in flight).
  const idle = () =>
    waitFor(() => expect(screen.getByLabelText('Choose backup file')).toBeEnabled());
  async function choose(value: File) {
    await user.upload(screen.getByLabelText('Choose backup file'), value);
    await idle();
  }
  return { requests: api.requests, user, file, restoreButton, choose, idle };
}

const page = () => document.body.textContent ?? '';

async function openBackup(ui: ReturnType<typeof mount>) {
  await openPage('Backup & Export', ui.user);
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
  expect(page()).toMatch(/CSV for analysis/);
  expect(page()).toMatch(/Backup for restore/);
  expect(page()).toMatch(/CSV cannot be used for restore/);
  expect(page()).toMatch(/total weight/);
  expect(page()).toMatch(/=, \+, -, @/);
  expect(page()).toMatch(/Additions only/);
  expect(page()).toMatch(/Identical records are skipped/);
  expect(page()).toMatch(/Replace all/);
  expect(page()).toMatch(/retry key/i);
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('choosing a file shows an add-only preview before anything is restored', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.choose(ui.file(JSON.stringify(backup)));
  await waitFor(() => expect(page()).toMatch(/Preview/));
  const preview = ui.requests.filter((r) => r.path === '/api/backup/preview');
  expect(preview).toHaveLength(1);
  expect(preview[0].body).toEqual({ mode: 'merge', backup });
  expect(ui.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(0);
  expect(page()).toMatch(/Workout journals.*Added 7.*Skipped 2/s);
  expect(page()).toMatch(/Sets.*Added 21/s);
  expect(page()).toMatch(/Arsenal Strength \/ Leg Press: existing value kept/);
  expect(page()).not.toMatch(/Deleted 5/);
  await ui.user.click(ui.restoreButton()!);
  await waitFor(() => expect(page()).toMatch(/Restore complete/));
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
  await ui.user.selectOptions(screen.getByLabelText('Restore mode'), 'replace');
  await ui.idle();
  await waitFor(() => expect(page()).toMatch(/Existing records will be deleted/));
  // #223: the deletion warning is an alert of its own, outside the live summary.
  const warning = screen.getByRole('alert');
  expect(warning).toHaveTextContent(/Existing records will be deleted/);
  expect(warning.closest('[role="status"]')).toBeNull();
  const previews = ui.requests.filter((r) => r.path === '/api/backup/preview');
  // Changing the mode refreshes the preview.
  expect(previews).toHaveLength(2);
  expect((previews[1].body as { mode: string }).mode).toBe('replace');
  expect(page()).toMatch(/Save retry records in progress are also reset\s*\(3 records\)/);
  expect(page()).toMatch(/Workout journals.*Deleted 5/s);
  // Replace is locked until confirmed.
  expect(ui.restoreButton()).toBeDisabled();
  const typed = screen.getByLabelText('Confirmation phrase');
  await ui.user.type(typed, 'REPLACE ALL');
  expect(ui.restoreButton()).toBeDisabled();
  await ui.user.clear(typed);
  await ui.user.type(typed, 'Replace all');
  expect(ui.restoreButton()).toBeEnabled();
  await ui.user.click(ui.restoreButton()!);
  await waitFor(() =>
    expect(ui.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(1),
  );
  const restore = ui.requests.filter((r) => r.path === '/api/backup/restore');
  expect(restore[0].body).toEqual({ mode: 'replace', backup, confirm: 'Replace all' });
});

test('unreadable, oversized or rejected files never reach restore', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.choose(ui.file('{"format":'));
  await waitFor(() => expect(page()).toMatch(/Could not read the backup file/));
  await ui.choose(ui.file('{}', 10 * 1024 * 1024 + 1));
  await waitFor(() => expect(page()).toMatch(/10 MB/));
  expect(screen.getByRole('alert')).toHaveTextContent(/10 MB/);
  expect(ui.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  expect(ui.restoreButton()).toBeNull();

  // A second, independent app whose server rejects the preview.
  cleanup();
  const rejected = mount('Unsupported backup version (v4). Supported versions: v1, v2, v3');
  await openBackup(rejected);
  await rejected.choose(rejected.file(JSON.stringify(backup)));
  await waitFor(() => expect(page()).toMatch(/Unsupported backup version/));
  expect(rejected.restoreButton()).toBeNull();
  expect(rejected.requests.filter((r) => r.path === '/api/backup/restore')).toHaveLength(0);
});

test('downloads are named links and the preview lists one row per table', async () => {
  const ui = mount();
  await openBackup(ui);
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
    'href',
    '/api/export/workouts.csv',
  );
  expect(screen.getByRole('link', { name: 'Download backup file' })).toHaveAttribute(
    'href',
    '/api/backup',
  );
  // Each section is a titled card.
  for (const name of ['CSV for analysis', 'Backup for restore (JSON)', 'Restore from backup'])
    expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
  await ui.choose(ui.file(JSON.stringify(backup)));
  const rows = within(await screen.findByRole('list', { name: 'Change summary' })).getAllByRole(
    'listitem',
  );
  expect(rows.map((r) => r.textContent)).toEqual([
    'Workout journals · Added 7 · Skipped 2',
    'Sets · Added 21 · Skipped 6',
    'Goals · Added 1 · Skipped 0',
    'Routines · Added 0 · Skipped 1',
    'Cardio · Added 2 · Skipped 1',
    'Cardio goals · Added 1 · Skipped 1',
    'Machines · Added 1 · Skipped 0 · Conflicts (kept existing) 1',
    'Brands · Added 0 · Skipped 4',
  ]);
  expect(
    within(screen.getByRole('list', { name: 'Conflict' })).getByRole('listitem'),
  ).toHaveTextContent('Arsenal Strength / Leg Press: existing value kept');
  expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Preview · Additions only');
});

test('while a restore runs the status says it is restoring, not checking', async () => {
  const gate = deferred();
  mockApi(async ({ url, body }) => {
    const mode = String((body as { mode?: unknown } | undefined)?.mode);
    if (url.pathname === '/api/backup/preview') return summary(mode, true);
    if (url.pathname === '/api/backup/restore') {
      await gate.promise;
      return summary(mode, false);
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('Backup & Export', user);
  await user.upload(
    screen.getByLabelText('Choose backup file'),
    new File([JSON.stringify(backup)], 'backup.json'),
  );
  await user.click(await screen.findByRole('button', { name: 'Run restore' }));
  expect(await screen.findByText('Restoring…')).toBeInTheDocument();
  expect(screen.queryByText('Checking backup…')).toBeNull();
  gate.resolve();
  expect(await screen.findByText('Restore complete.')).toBeInTheDocument();
  expect(screen.queryByText('Restoring…')).toBeNull();
});
