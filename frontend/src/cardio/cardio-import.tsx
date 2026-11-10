import { useEffect, useRef, useState } from 'react';

import { AlertBanner } from '../components/alert-banner';
import { formHint, selectField, touchText } from '../components/form-styles';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Notice } from '../components/ui/notice';
import { type CardioKind, cardioKinds, cardioSessionSchemaFor, fieldErrors } from '../contract';
import { cn } from '../lib/utils';
import { activityFileAccept, type ImportedActivity, parseActivityFile } from './activity-file';
import {
  type CardioBody,
  CardioImportError,
  type CardioSession,
  importCardioSessions,
  listCardioSessions,
} from './api';
import { CardioForm, type LinkableWorkout } from './cardio-form';
import { isSameActivity, isSimilarActivity } from './duplicates';
import { cardioKindLabels, formatDistance, formatDuration, sessionLabel } from './format';

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
  // The user chose the check box; until then the default (only "저장 가능" rows) follows the
  // latest duplicate check.
  touched: boolean;
  // The server's reason after a refused save, until the row is changed.
  result?: string;
};

// One request carries at most this many rows (the API's limit, backend/src/routes/cardio.ts).
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

type Check =
  | { kind: 'invalid'; text: string }
  | { kind: 'blocked'; text: string }
  | { kind: 'candidate'; text: string }
  | { kind: 'ok'; text: string };

const canSave = (check: Check) => check.kind === 'ok' || check.kind === 'candidate';

// What the row's 확인 column says and whether it may be saved, given the checks of the rows
// before it: invalid values and an activity already stored cannot be saved. An earlier row with
// the same id blocks this one only while that row is chosen, so either copy (e.g. the TCX
// without pauses rather than the GPX) can be picked. A look-alike may be saved once checked.
function checkRow(
  row: Row,
  index: number,
  rows: readonly Row[],
  before: readonly Check[],
  existing: readonly CardioSession[],
  today: string,
): Check {
  const parsed = cardioSessionSchemaFor(today).safeParse(row.body);
  if (!parsed.success)
    return { kind: 'invalid', text: Object.values(fieldErrors(parsed.error)).join(' · ') };
  const stored = existing.find((s) => isSameActivity(s, row.body));
  if (stored) return { kind: 'blocked', text: `이미 가져온 기록입니다 (${sessionLabel(stored)})` };
  const same = (r: Row, i: number) => i < index && isSameActivity(r.body, row.body);
  const chosenTwin = rows.findIndex((r, i) => same(r, i) && r.selected && canSave(before[i]));
  if (chosenTwin >= 0)
    return {
      kind: 'blocked',
      text: `${chosenTwin + 1}행과 같은 활동입니다. 그 행의 선택을 해제하면 고를 수 있습니다`,
    };
  const similar = existing.find((s) => isSimilarActivity(s, row.body));
  if (similar) return { kind: 'candidate', text: `중복 후보: 기존 기록 ${sessionLabel(similar)}` };
  const twin = rows.findIndex(
    (r, i) => same(r, i) || (i < index && isSimilarActivity(r.body, row.body)),
  );
  if (twin >= 0) return { kind: 'candidate', text: `중복 후보: ${twin + 1}행과 같거나 비슷합니다` };
  return { kind: 'ok', text: '저장 가능' };
}

function checkRows(rows: readonly Row[], existing: readonly CardioSession[], today: string) {
  const checks: Check[] = [];
  rows.forEach((row, i) => checks.push(checkRow(row, i, rows, checks, existing, today)));
  return checks;
}

// Rows the user has not chosen or cleared follow the default: chosen only when "저장 가능".
// Re-run after the stored sessions or a row change, so a new look-alike is never left chosen.
function withDefaults(rows: readonly Row[], existing: readonly CardioSession[], today: string) {
  const out: Row[] = [];
  const checks: Check[] = [];
  // A later twin the user chose wins: the row before it is not chosen by default, or it would
  // block the user's choice (review round 2).
  const chosenLater = (row: Row, i: number) =>
    rows.some((r, j) => j > i && r.touched && r.selected && isSameActivity(r.body, row.body));
  rows.forEach((row, i) => {
    const draft = row.touched ? row : { ...row, selected: false };
    const check = checkRow(draft, i, [...out, draft], checks, existing, today);
    const next = row.touched
      ? row
      : { ...row, selected: check.kind === 'ok' && !chosenLater(row, i) };
    out.push(next);
    checks.push(row.touched ? check : checkRow(next, i, [...out], checks, existing, today));
  });
  return out;
}

// What the table shows but does not edit; "수정" opens the full form for these.
function summaryOf(body: CardioBody) {
  return [
    formatDuration(body.duration_sec),
    formatDistance(body.kind, body.distance_km),
    body.avg_heart_rate === null ? null : `평균 심박 ${body.avg_heart_rate}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// #119: brings activity files (TCX, GPX) in through an editable preview (2026-11-08 user
// decisions). Files are read in this browser and never uploaded or kept. The table edits the
// save check, kind, date and start time; "수정" opens CardioForm without saving for the rest.
// The chosen rows are saved together: all or none.
export function CardioImport({
  today,
  workouts,
  close,
  done,
}: {
  today: string;
  workouts: readonly LinkableWorkout[];
  close: () => void;
  // After a save, with the number of sessions saved; the caller closes the card and reports it.
  done: (count: number) => void;
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
  const checks = checkRows(rows, existing, today);
  const savable = (i: number) => canSave(checks[i]);
  const chosen = rows.filter((r, i) => r.selected && savable(i));
  const tooMany = chosen.length > importLimit;

  // The card opens on its file chooser, so keyboard and screen reader users land in it.
  useEffect(() => fileInput.current?.focus(), []);

  // An edited date may leave the range read for the duplicate check, so the range is read again
  // (the dates read from the files stay in it). Rows the user has not chosen or cleared follow
  // the new answer.
  const range = rangeOf(rows);
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
        setRows((now) => withDefaults(now, sessions, today));
      },
      () =>
        current &&
        setError(
          '기존 유산소 기록을 불러오지 못해 중복을 확인할 수 없습니다. 파일을 다시 선택하세요.',
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
    setStatus('');
    setBusy(true);
    const found: ImportedActivity[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        found.push(...parseActivityFile(file.name, await file.text()));
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    setFileErrors(problems);
    const next = found
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map((activity, key) => ({
        key,
        file: activity.file,
        format: activity.format,
        body: bodyOf(activity),
        readDate: activity.date,
        selected: false,
        touched: false,
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
          '기존 유산소 기록을 불러오지 못해 중복을 확인할 수 없습니다. 파일을 다시 선택하세요.',
        );
        setBusy(false);
        return;
      }
    setExisting(stored);
    setRows(withDefaults(next, stored, today));
    setBusy(false);
    // The file input was disabled while reading, which drops its focus; it gets it back.
    requestAnimationFrame(() => fileInput.current?.focus());
    if (next.length)
      setStatus(
        `활동 ${next.length}건을 읽었습니다. 값을 확인하고 저장할 기록을 고르세요. 중복 후보는 선택을 해제해 두었습니다.`,
      );
  }

  const choose = (key: number, selected: boolean) =>
    setRows((current) =>
      current.map((r) =>
        r.key === key ? { ...r, result: undefined, selected, touched: true } : r,
      ),
    );
  // A changed date, time or distance may make a row a look-alike; the defaults follow it.
  const updateBody = (key: number, change: Partial<CardioBody>) =>
    setRows((current) =>
      withDefaults(
        current.map((r) =>
          r.key === key ? { ...r, result: undefined, body: { ...r.body, ...change } } : r,
        ),
        existing,
        today,
      ),
    );

  async function saveAll() {
    if (busy || !chosen.length || tooMany) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const saved = await importCardioSessions(chosen.map((r) => r.body));
      setRows([]);
      done(saved.length);
    } catch (e) {
      // Nothing was saved. Each refused row shows the server's reason in its 확인 column.
      const refused = e instanceof CardioImportError ? e.rows : [];
      const reasons = new Map(refused.map((p) => [chosen[p.index]?.key, p.message]));
      setRows((current) =>
        current.map((r) => (reasons.has(r.key) ? { ...r, result: reasons.get(r.key) } : r)),
      );
      // E.g. imported meanwhile in another tab: the stored sessions are read again, so the row
      // shows "이미 가져온 기록" instead of looking savable after the next edit.
      if (e instanceof CardioImportError && e.status === 409) setReload((n) => n + 1);
      setError(
        refused.length
          ? `${(e as Error).message}. 표의 확인 칸에서 이유를 보고 고치거나 선택을 해제한 뒤 다시 저장하세요.`
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  const editingRow = rows.find((r) => r.key === editing);
  return (
    <Card role="region" aria-label="활동 파일 가져오기" className="mt-4 gap-4 shadow-none">
      <CardHeader>
        <CardTitle asHeading="h2" className="text-body font-semibold">
          활동 파일 가져오기
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className={formHint}>
          가민 커넥트 등에서 내보낸 TCX·GPX 파일을 고르세요. 여러 파일을 한 번에 고를 수 있습니다.
          파일은 이 브라우저에서만 읽고 서버로 보내지 않으며, 요약값(시간·거리·심박·칼로리)만
          저장합니다.
        </p>
        <Label className="mb-0 flex flex-col items-start gap-2 text-meta text-muted-foreground">
          활동 파일 (TCX·GPX)
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
            읽지 못한 파일이 있습니다.
            <ul className="mt-1 list-disc pl-5">
              {fileErrors.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          </AlertBanner>
        )}
        {error && <AlertBanner className="mb-0">{error}</AlertBanner>}
        <Notice notice={status ? { kind: 'status', text: status } : undefined} />
        {rows.some((r) => r.format === 'gpx') && (
          <p className={formHint}>
            GPX 파일은 일시정지를 기록하지 않아 운동 시간이 첫 기록부터 마지막 기록까지(일시정지
            포함)입니다. 다르면 &ldquo;수정&rdquo;에서 고치세요.
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div
              // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must be focusable.
              tabIndex={0}
              role="region"
              aria-label="가져올 활동 미리보기"
              className="max-w-full overflow-x-auto rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-muted text-meta text-muted-foreground">
                  <tr>
                    {['저장', '종류', '날짜', '시작', '기록', '확인', '수정'].map((h) => (
                      <th scope="col" key={h} className={cell}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const check = checks[i];
                    const n = i + 1;
                    return (
                      <tr key={row.key} className="border-t">
                        <td className={cell}>
                          <Checkbox
                            aria-label={`${n}행 저장`}
                            // As in the InBody import: the box stays 16px with the common 44px
                            // ::after touch area (#271).
                            className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                            checked={row.selected && savable(i)}
                            disabled={busy || !savable(i)}
                            onCheckedChange={(checked) => choose(row.key, checked === true)}
                          />
                        </td>
                        <td className={cell}>
                          <select
                            aria-label={`${n}행 종류`}
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
                            aria-label={`${n}행 날짜`}
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
                            aria-label={`${n}행 시작 시각`}
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
                            aria-label={`${n}행 수정`}
                            disabled={busy}
                            onClick={() => setEditing(row.key)}
                          >
                            수정
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tooMany && (
              <p className={cn(formHint, 'text-destructive')}>
                한 번에 {importLimit}건까지 저장할 수 있습니다. 선택을 {chosen.length - importLimit}
                건 줄이세요.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !chosen.length || tooMany} onClick={() => void saveAll()}>
                {busy ? '저장 중…' : `선택한 ${chosen.length}건 저장`}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={close}>
                닫기
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
            닫기
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
