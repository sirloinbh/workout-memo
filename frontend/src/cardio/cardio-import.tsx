import { useEffect, useMemo, useRef, useState } from 'react';

import { type CardioKind, cardioKinds } from '../../../shared/contract';
import { AlertBanner } from '../components/alert-banner';
import { formHint, selectField, touchText } from '../components/form-styles';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Notice } from '../components/ui/notice';
import { cn } from '../lib/utils';
import { activityFileAccept, type ImportedActivity } from './activity-file';
import { readActivityFiles, type Reading } from './activity-reader';
import {
  type CardioBody,
  CardioImportError,
  type CardioSession,
  importCardioSessions,
  listCardioSessions,
} from './api';
import { CardioForm, type LinkableWorkout } from './cardio-form';
import { cardioKindLabels, formatDistance, formatDuration } from './format';
import { affectedBy, canSave, type Check, recheck } from './import-check';

const cell = 'px-3 py-2 text-left align-middle font-normal';

type Row = {
  key: number;
  file: string;
  format: ImportedActivity['format'];
  body: CardioBody;
  // The date read from the file. The duplicate check keeps reading around it after the date is
  // edited, so an activity imported before is still found by its id.
  readDate: string;
  selected: boolean;
  // The user chose the check box; until then the default (only "Ready to save" rows) follows the
  // latest duplicate check.
  touched: boolean;
  // The save check, kept on the row and updated only for the rows an edit can affect (#387).
  check: Check;
  // The server's reason after a refused save, until the row is changed.
  result?: string;
};

// One request carries at most this many rows (the API's limit, backend/src/routes/cardio.ts).
// More chosen rows are sent in batches of this size (2026-11-16 decision).
const importLimit = 200;

// An activity from a file → the body the API takes. Values the file does not have stay null.
function bodyOf(activity: ImportedActivity): CardioBody {
  return {
    date: activity.date,
    start_time: activity.start_time,
    kind: activity.kind,
    duration_sec: activity.duration_sec,
    distance_km: activity.distance_km,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    calories_kcal: activity.calories_kcal,
    elevation_gain_m: activity.elevation_gain_m,
    avg_cadence: activity.avg_cadence,
    effort: null,
    workout_id: null,
    source: 'file',
    external_id: activity.external_id,
    memo: activity.memo,
  };
}

// A day before and after the rows' dates, so a start near midnight finds its look-alike.
function rangeOf(rows: readonly Pick<Row, 'body' | 'readDate'>[]) {
  const dates = rows
    .flatMap((r) => [r.body.date, r.readDate])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dates.length) return null;
  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  dates.sort();
  return { from: shift(dates[0], -1), to: shift(dates[dates.length - 1], 1) };
}

// The preview table shows this many rows at a time (#387): a whole-account export can hold
// thousands, and rendering them all makes every edit slow.
const pageSize = 100;

// What the table shows but does not edit; "Edit" opens the full form for these.
function summaryOf(body: CardioBody) {
  return [
    formatDuration(body.duration_sec),
    formatDistance(body.kind, body.distance_km),
    body.avg_heart_rate === null ? null : `Avg heart rate ${body.avg_heart_rate}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// #119: brings activity files (TCX, GPX, FIT, or a ZIP of them) in through an editable preview
// (2026-11-08 user decisions). Files are read in this browser and never uploaded or kept. The
// table edits the save check, kind, date and start time; "Edit" opens CardioForm without saving
// for the rest. Up to 200 chosen rows are saved together, all or none; more go in batches of
// 200 in table order (start time as read), and a refused batch stops the save with the batches
// before it kept.
export function CardioImport({
  today,
  workouts,
  close,
  done,
  savedSome,
}: {
  today: string;
  workouts: readonly LinkableWorkout[];
  close: () => void;
  // After a save, with the number of sessions saved; the caller closes the card and reports it.
  done: (count: number) => void;
  // After a batched save stopped part way, with the number saved before it; the card stays open
  // with the rows left, and the caller reloads its records.
  savedSome?: (count: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<CardioSession[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  // Bumped after a refused save, so the stored sessions are read again.
  const [reload, setReload] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  // The file being read, so Cancel can stop it (#387), and how far it is.
  const reading = useRef<Reading | null>(null);
  const [readingFiles, setReadingFiles] = useState(false);
  const chosen = rows.filter((r) => r.selected && canSave(r.check));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shownPage = Math.min(page, pages - 1);
  const first = shownPage * pageSize;

  // The card opens on its file chooser, so keyboard and screen reader users land in it.
  useEffect(() => fileInput.current?.focus(), []);

  // An edited date may leave the range read for the duplicate check, so the range is read again
  // (the dates read from the files stay in it). Rows the user has not chosen or cleared follow
  // the new answer.
  const range = useMemo(() => rangeOf(rows), [rows]);
  const rangeKey = range ? `${range.from}~${range.to}` : '';
  // What was read last, so the range open() has just read is not read twice.
  const loaded = useRef('');
  useEffect(() => {
    const key = `${rangeKey}#${reload}`;
    if (!range || loaded.current === key) return;
    loaded.current = key;
    let current = true;
    listCardioSessions(range.from, range.to).then(
      (sessions) => {
        if (!current) return;
        setExisting(sessions);
        setRows((now) => recheck(now, sessions, today));
      },
      () =>
        current &&
        setError(
          'Could not load the existing cardio records, so duplicates cannot be checked. Choose the files again.',
        ),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again only when the range changes or after a refused save.
  }, [rangeKey, reload]);

  async function open(files: File[]) {
    setRows([]);
    setFileErrors([]);
    setError('');
    setStatus('Reading files…');
    setBusy(true);
    setPage(0);
    // Unzipping and FIT parsing run in a Web Worker, so the page stays usable (#387).
    const read = readActivityFiles(files, ({ file, index, count, done, total }) =>
      setStatus(
        `Reading ${count > 1 ? `file ${index + 1} of ${count}: ` : ''}${file}${total ? ` (${done} of ${total} files)` : ''}…`,
      ),
    );
    reading.current = read;
    setReadingFiles(true);
    const result = await read.promise;
    reading.current = null;
    setReadingFiles(false);
    if (result.canceled) {
      setStatus('Reading canceled.');
      setBusy(false);
      requestAnimationFrame(() => fileInput.current?.focus());
      return;
    }
    const found: ImportedActivity[] = result.activities;
    const problems = result.problems;
    setFileErrors(problems);
    const next = found
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map((activity, key): Row => ({
        key,
        file: activity.file,
        format: activity.format,
        body: bodyOf(activity),
        readDate: activity.date,
        selected: false,
        touched: false,
        check: { kind: 'ok', text: '' },
      }));
    // The default check needs the stored sessions, so they are read before the table shows.
    const span = rangeOf(next);
    let stored: CardioSession[] = [];
    if (span)
      try {
        stored = await listCardioSessions(span.from, span.to);
        loaded.current = `${span.from}~${span.to}#${reload}`;
      } catch {
        setError(
          'Could not load the existing cardio records, so duplicates cannot be checked. Choose the files again.',
        );
        setStatus('');
        setBusy(false);
        return;
      }
    setExisting(stored);
    setRows(recheck(next, stored, today));
    setBusy(false);
    // The file input was disabled while reading, which drops its focus; it gets it back.
    requestAnimationFrame(() => fileInput.current?.focus());
    setStatus(
      next.length
        ? `Read ${next.length} ${next.length === 1 ? 'activity' : 'activities'}. Check the values and choose the records to save. Possible duplicates are left unchecked.`
        : '',
    );
  }

  // A chosen row can block or free the rows that look like it; only those are checked again.
  const choose = (key: number, selected: boolean) =>
    setRows((current) => {
      const index = current.findIndex((r) => r.key === key);
      const next = current.map((r, i) =>
        i === index ? { ...r, result: undefined, selected, touched: true } : r,
      );
      return recheck(next, existing, today, {
        only: affectedBy(next, index, next[index].body),
        defaults: false,
      });
    });
  // A changed date, time or distance may make a row a look-alike; the defaults follow it, for the
  // edited row and the rows connected to it only (#387).
  const updateBody = (key: number, change: Partial<CardioBody>) =>
    setRows((current) => {
      const index = current.findIndex((r) => r.key === key);
      const next = current.map((r, i) =>
        i === index ? { ...r, result: undefined, body: { ...r.body, ...change } } : r,
      );
      return recheck(next, existing, today, {
        only: affectedBy(next, index, current[index].body),
      });
    });

  async function saveAll() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setError('');
    setStatus('');
    let saved = 0;
    try {
      for (let start = 0; start < chosen.length; start += importLimit) {
        const batch = chosen.slice(start, start + importLimit);
        if (chosen.length > importLimit)
          setStatus(`Saving records ${start + 1}–${start + batch.length} of ${chosen.length}…`);
        try {
          saved += (await importCardioSessions(batch.map((r) => r.body))).length;
        } catch (e) {
          // This batch saved nothing; the batches before it stay saved and leave the table.
          // Each refused row shows the server's reason in its Check column.
          const kept = new Set(chosen.slice(0, start).map((r) => r.key));
          const refused = e instanceof CardioImportError ? e.rows : [];
          const reasons = new Map(refused.map((p) => [batch[p.index]?.key, p.message]));
          setRows((current) =>
            recheck(
              current
                .filter((r) => !kept.has(r.key))
                .map((r) => (reasons.has(r.key) ? { ...r, result: reasons.get(r.key) } : r)),
              existing,
              today,
              { defaults: false },
            ),
          );
          // E.g. imported meanwhile in another tab, or rows just saved: the stored sessions are
          // read again, so a row shows "Already imported" instead of looking savable.
          if (saved || (e instanceof CardioImportError && e.status === 409))
            setReload((n) => n + 1);
          if (saved) savedSome?.(saved);
          const reason = refused.length
            ? `${(e as Error).message}. See the Check column for each reason, then fix the row or clear its selection and save again.`
            : (e as Error).message;
          setStatus('');
          setError(
            saved
              ? `Saved ${saved} of ${chosen.length} records, then stopped. The next ${batch.length} were not saved: ${reason}`
              : reason,
          );
          return;
        }
      }
      setRows([]);
      done(saved);
    } finally {
      setBusy(false);
    }
  }

  const editingRow = rows.find((r) => r.key === editing);
  return (
    <Card role="region" aria-label="Import activity file" className="mt-4 gap-4 shadow-none">
      <CardHeader>
        <CardTitle asHeading="h2" className="text-body font-semibold">
          Import activity file
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className={formHint}>
          Choose TCX, GPX or FIT files exported from Garmin Connect or a similar service, or a ZIP
          of them (such as Garmin&rsquo;s &ldquo;Export Original&rdquo; or a whole-account export).
          You can choose several files at once. Files are read only in this browser and are never
          sent to the server; only the summary values (time, distance, heart rate, calories) are
          saved.
        </p>
        <Label className="mb-0 flex flex-col items-start gap-2 text-meta text-muted-foreground">
          Activity file (TCX/GPX/FIT/ZIP)
          <Input
            ref={fileInput}
            className={touchText}
            type="file"
            multiple
            accept={activityFileAccept}
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void open(files);
              e.target.value = '';
            }}
          />
        </Label>
        {fileErrors.length > 0 && (
          <AlertBanner className="mb-0">
            Some files could not be read.
            <ul className="mt-1 list-disc pl-5">
              {fileErrors.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          </AlertBanner>
        )}
        {error && <AlertBanner className="mb-0">{error}</AlertBanner>}
        <Notice notice={status ? { kind: 'status', text: status } : undefined} />
        {readingFiles && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => reading.current?.cancel()}
          >
            Cancel reading
          </Button>
        )}
        {rows.some((r) => r.format === 'gpx') && (
          <p className={formHint}>
            GPX files do not record pauses, so the workout time runs from the first record to the
            last (pauses included). If that is wrong, fix it with &ldquo;Edit&rdquo;.
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div
              // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must be focusable.
              tabIndex={0}
              role="region"
              aria-label="Import preview"
              className="max-w-full overflow-x-auto rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-muted text-meta text-muted-foreground">
                  <tr>
                    {['Save', 'Type', 'Date', 'Start', 'Record', 'Check', 'Edit'].map((h) => (
                      <th scope="col" key={h} className={cell}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(first, first + pageSize).map((row, offset) => {
                    const check = row.check;
                    const n = first + offset + 1;
                    return (
                      <tr key={row.key} className="border-t">
                        <td className={cell}>
                          <Checkbox
                            aria-label={`Save row ${n}`}
                            // As in the InBody import: the box stays 16px with the common 44px
                            // ::after touch area (#271).
                            className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                            checked={row.selected && canSave(check)}
                            disabled={busy || !canSave(check)}
                            onCheckedChange={(checked) => choose(row.key, checked === true)}
                          />
                        </td>
                        <td className={cell}>
                          <select
                            aria-label={`Row ${n} type`}
                            className={cn(selectField, 'min-w-28')}
                            disabled={busy}
                            value={row.body.kind}
                            onChange={(e) =>
                              updateBody(row.key, { kind: e.target.value as CardioKind })
                            }
                          >
                            {cardioKinds.map((kind) => (
                              <option key={kind} value={kind}>
                                {cardioKindLabels[kind]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={cell}>
                          <Input
                            aria-label={`Row ${n} date`}
                            className={cn(touchText, 'min-w-36')}
                            type="date"
                            max={today}
                            disabled={busy}
                            value={row.body.date}
                            onChange={(e) => updateBody(row.key, { date: e.target.value })}
                          />
                        </td>
                        <td className={cell}>
                          <Input
                            aria-label={`Row ${n} start time`}
                            className={cn(touchText, 'min-w-28')}
                            type="time"
                            disabled={busy}
                            value={row.body.start_time ?? ''}
                            onChange={(e) =>
                              updateBody(row.key, { start_time: e.target.value || null })
                            }
                          />
                        </td>
                        <td className={cn(cell, 'min-w-40')}>
                          <span className="block">{summaryOf(row.body)}</span>
                          <span className="block text-meta text-muted-foreground">{row.file}</span>
                        </td>
                        <td
                          className={cn(
                            cell,
                            'min-w-40 text-meta',
                            row.result || check.kind === 'invalid' || check.kind === 'blocked'
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {row.result ?? check.text}
                        </td>
                        <td className={cell}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Edit row ${n}`}
                            disabled={busy}
                            onClick={() => setEditing(row.key)}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > pageSize && (
              <nav aria-label="Preview pages" className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={shownPage === 0}
                  onClick={() => setPage(shownPage - 1)}
                >
                  Previous rows
                </Button>
                <span className="text-body-sm text-muted-foreground">
                  Rows {first + 1}–{Math.min(rows.length, first + pageSize)} of {rows.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={shownPage >= pages - 1}
                  onClick={() => setPage(shownPage + 1)}
                >
                  Next rows
                </Button>
              </nav>
            )}
            {chosen.length > importLimit && (
              <p className={formHint}>
                The records are saved {importLimit} at a time, in the order of the table. If a batch
                is refused, saving stops there and the batches before it stay saved.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !chosen.length} onClick={() => void saveAll()}>
                {busy ? 'Saving…' : `Save ${chosen.length} selected`}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={close}>
                Close
              </Button>
            </div>
          </>
        )}
        {!rows.length && (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            disabled={busy}
            onClick={close}
          >
            Close
          </Button>
        )}
      </CardContent>
      {editingRow && (
        <CardioForm
          session={editingRow.body}
          date={editingRow.body.date}
          today={today}
          workouts={workouts}
          close={() => setEditing(null)}
          apply={(body) => {
            updateBody(editingRow.key, body);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
