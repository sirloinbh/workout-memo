import { Download } from 'lucide-react';
import React, { useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import { selectField, touchText } from './components/form-styles';
import { Button } from './components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { plural } from './labels';
import { cn } from './lib/utils';

// Analysis CSV and restore backup are separate artifacts (#33). The server validates and
// computes every summary; this page only shows it and asks for explicit confirmation.
const maxBytes = 10 * 1024 * 1024;
const confirmation = 'Replace all';
// Each paragraph takes the size itself: the legacy `p` rule (12px) applies to the element directly.
const copy = 'flex flex-col gap-2';
const text = 'text-body-sm text-muted-foreground';
const field = 'flex flex-col gap-2';
type Counts = { added: number; skipped: number; conflicts: number; deleted: number };
type Summary = {
  mode: 'merge' | 'replace';
  dry_run: boolean;
  tables: Record<string, Counts>;
  conflicts: string[];
  retry_keys_cleared: number;
};
const labels: [string, string][] = [
  ['workouts', 'Workout journals'],
  ['sets', 'Sets'],
  ['goals', 'Goals'],
  ['routines', 'Routines'],
  // #114: backup v2. A server without cardio sessions sends no such table; the row is skipped.
  ['cardio_sessions', 'Cardio'],
  // #253: backup v3. An older server sends no such table; the row is skipped.
  ['cardio_goals', 'Cardio goals'],
  ['machines', 'Machines'],
  ['brands', 'Brands'],
];
async function post(path: string, body: unknown): Promise<Summary> {
  const response = await fetch('/api/backup/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? 'The backup request failed');
  return data;
}

export function Backup({ onRestored }: { onRestored: () => void }) {
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [typed, setTyped] = useState('');
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check(value: unknown, nextMode: 'merge' | 'replace') {
    setPreview(null);
    setResult(null);
    setError('');
    setBusy(true);
    try {
      setPreview(await post('preview', { mode: nextMode, backup: value }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(file: { name: string; size: number; text: () => Promise<string> }) {
    setBackup(null);
    setPreview(null);
    setResult(null);
    setTyped('');
    setFileName(file.name);
    if (file.size > maxBytes) {
      setError('The backup file must be 10 MB or smaller.');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      setError(
        'Could not read the backup file. Check that it is a JSON backup downloaded from this app.',
      );
      return;
    }
    setBackup(value);
    await check(value, mode);
  }
  async function run() {
    if (!preview || busy || (mode === 'replace' && typed !== confirmation)) return;
    setBusy(true);
    setError('');
    try {
      const done = await post(
        'restore',
        mode === 'replace' ? { mode, backup, confirm: typed } : { mode, backup },
      );
      setResult(done);
      setPreview(null);
      setBackup(null);
      setTyped('');
      onRestored();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = result ?? preview;
  return (
    <section className="flex flex-col gap-4">
      <h2>Backup & Export</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">CSV for analysis</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            Downloads the sets of your workout journals as a UTF-8 CSV, one row per set. Dates are
            YYYY-MM-DD and weight is the total weight (kg) including the machine&apos;s base weight.
            It is blank if there is no machine or the base weight is unknown.
          </p>
          <p className={text}>
            So that spreadsheets do not run them as formulas, a single quote (&apos;) is added
            before text values that start with =, +, -, @, tab, or CR. CSV cannot be used for
            restore.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <a href="/api/export/workouts.csv" download>
              <Download aria-hidden />
              Download CSV
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Backup for restore (JSON)</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            Stores workout journals, sets, goals, routines, cardio records, cardio goals, brands,
            machines, and their links in a single versioned JSON file. Save retry keys are temporary
            duplicate-prevention records, so they are not included. A backup file contains personal
            records, so keep it somewhere safe.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <a href="/api/backup" download>
              <Download aria-hidden />
              Download backup file
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Restore from backup</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            Additions only (default): adds only new records without editing or deleting existing
            ones. Identical records are skipped. If a machine with the same brand and name differs,
            the existing value is kept and shown as a conflict.
          </p>
          <p className={text}>
            Replace all: deletes every current record and replaces it with the backup content. Save
            retry records are also reset, so a save whose response was lost becomes a new record if
            you save it again. Type the confirmation phrase “{confirmation}” to run it.
          </p>
          <p className={text}>
            Before restoring, the format, version, references, and size (up to 10 MB) are checked
            and a summary of changes is previewed. A restore either fully succeeds or is fully
            canceled.
          </p>
        </CardContent>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className={field}>
              <Label htmlFor="backup-mode">Restore mode</Label>
              <select
                id="backup-mode"
                className={selectField}
                value={mode}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value === 'replace' ? 'replace' : 'merge';
                  setMode(next);
                  setTyped('');
                  if (backup !== null) void check(backup, next);
                }}
              >
                <option value="merge">Additions only (default)</option>
                <option value="replace">Replace all</option>
              </select>
            </div>
            <div className={field}>
              <Label htmlFor="backup-file">Choose backup file</Label>
              <Input
                id="backup-file"
                className={touchText}
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void choose(file);
                }}
              />
            </div>
          </div>
          {fileName && (
            <p className="text-body-sm text-muted-foreground">Selected file: {fileName}</p>
          )}
          <Notice
            notice={
              busy
                ? { kind: 'status', text: preview ? 'Restoring…' : 'Checking backup…' }
                : undefined
            }
          />
          {error && <AlertBanner className="mb-0">{error}</AlertBanner>}
          {/* #223: the deletion warning is its own alert, next to (not inside) the live summary. */}
          {shown && shown.mode === 'replace' && !result && (
            <AlertBanner className="mb-0">
              Existing records will be deleted. Check the deleted counts. Save retry records in
              progress are also reset ({plural(shown.retry_keys_cleared, 'record')}).
            </AlertBanner>
          )}
          {shown && (
            <div role="status" className="flex flex-col gap-3 rounded-lg border p-4">
              <h4 className="text-body-sm font-semibold">
                {result
                  ? 'Restore complete.'
                  : `Preview · ${mode === 'replace' ? 'Replace all' : 'Additions only'} (nothing changed yet)`}
              </h4>
              <ul aria-label="Change summary" className="flex flex-col gap-1.5 text-body-sm">
                {labels.map(([key, label]) => {
                  const c = shown.tables[key];
                  if (!c) return null;
                  return (
                    <li key={key}>
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · Added {c.added} · Skipped {c.skipped}
                        {c.conflicts > 0 && ` · Conflicts (kept existing) ${c.conflicts}`}
                        {shown.mode === 'replace' && ` · Deleted ${c.deleted}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {shown.conflicts.length > 0 && (
                <ul
                  aria-label="Conflict"
                  className="flex flex-col gap-1 border-t pt-3 text-body-sm text-muted-foreground"
                >
                  {shown.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {preview && !result && (
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
              {mode === 'replace' && (
                <div className={cn(field, 'w-full md:w-64')}>
                  <Label htmlFor="backup-confirm">Confirmation phrase</Label>
                  <Input
                    id="backup-confirm"
                    className={touchText}
                    value={typed}
                    placeholder={confirmation}
                    autoComplete="off"
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </div>
              )}
              <Button
                variant={mode === 'replace' ? 'destructive' : 'default'}
                disabled={busy || (mode === 'replace' && typed !== confirmation)}
                onClick={() => void run()}
              >
                {busy && <Spinner size="sm" aria-hidden />}
                Run restore
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
