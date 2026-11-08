import { Plus, Scale } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import { fieldLabel, formHint as hint, touchText } from './components/form-styles';
import { List, ListItem } from './components/list';
import { PageHeader } from './components/page-header';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonList } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { seoulDate } from './date';
import { InbodyImport } from './inbody-import';
import { cn } from './lib/utils';

export type BodyRecord = {
  id: number;
  date: string;
  body_weight_kg: number | null;
  body_fat_percent: number | null;
  skeletal_muscle_kg: number | null;
};
type MetricKey = 'body_weight_kg' | 'body_fat_percent' | 'skeletal_muscle_kg';
type Draft = { id?: number; date: string } & Record<MetricKey, string>;
type WorkoutLike = {
  date: string;
  sets: { weight: number | string; reps: number; completed?: boolean }[];
};

// Units match the API: kg and %, stored with at most two decimals.
const metrics: { key: MetricKey; label: string; unit: string; min: string; max: string }[] = [
  { key: 'body_weight_kg', label: '체중', unit: 'kg', min: '0.01', max: '999.99' },
  { key: 'body_fat_percent', label: '체지방률', unit: '%', min: '0', max: '100' },
  { key: 'skeletal_muscle_kg', label: '골격근량', unit: 'kg', min: '0.01', max: '999.99' },
];
const fmt = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n);
const day = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z');
const days = (from: string, to: string) => Math.round((+day(to) - +day(from)) / 86400000);

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/body-measurements' + path, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error ?? '신체 기록 요청에 실패했습니다');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function BodyMeasurements({
  from,
  to,
  workouts,
  controls,
}: {
  from: string;
  to: string;
  workouts: WorkoutLike[];
  controls: React.ReactNode;
}) {
  const [rows, setRows] = useState<BodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const data = await request<BodyRecord[]>(`?from=${from}&to=${to}`);
      // Only the newest period request may replace the list.
      if (current !== version.current) return;
      setRows(data);
      setError('');
    } catch (e) {
      if (current === version.current) setError((e as Error).message);
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || saving) return;
    const body: Record<string, unknown> = { date: draft.date };
    for (const m of metrics) {
      const raw = draft[m.key].trim();
      const value = raw === '' ? null : Number(raw);
      if (value !== null && !Number.isFinite(value)) {
        setFormError(`${m.label} 값을 숫자로 입력하세요`);
        return;
      }
      body[m.key] = value;
    }
    if (metrics.every((m) => body[m.key] === null)) {
      setFormError('체중, 체지방률, 골격근량 중 하나 이상을 입력하세요');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await request(draft.id ? '/' + draft.id : '', draft.id ? 'PUT' : 'POST', body);
      setDraft(null);
      setStatus('신체 기록을 저장했습니다');
      await load();
    } catch (e) {
      // Keep the input so the user can change the date or edit the existing record.
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(row: BodyRecord) {
    if (saving || !confirm(`${row.date.slice(0, 10)} 신체 기록을 삭제할까요?`)) return;
    setSaving(true);
    try {
      await request('/' + row.id, 'DELETE');
      setStatus('신체 기록을 삭제했습니다');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const volumeByDate = new Map<string, number>();
  for (const w of workouts) {
    const date = w.date.slice(0, 10);
    // Planned (not completed) sets are not performance (#31); missing means completed.
    const volume = w.sets
      .filter((s) => s.completed !== false)
      .reduce((n, s) => n + Number(s.weight) * s.reps, 0);
    volumeByDate.set(date, (volumeByDate.get(date) ?? 0) + volume);
  }
  // #123: a metric without any value in the period gets one line instead of an empty chart.
  const charted = metrics.filter((m) => rows.some((row) => row[m.key] !== null));
  const missing = metrics.filter((m) => !charted.includes(m));
  const edit = (row?: BodyRecord) => {
    setFormError('');
    setStatus('');
    setDraft(
      row
        ? {
            id: row.id,
            date: row.date.slice(0, 10),
            ...(Object.fromEntries(
              metrics.map((m) => [m.key, row[m.key] === null ? '' : String(row[m.key])]),
            ) as Record<MetricKey, string>),
          }
        : {
            date: seoulDate() >= from && seoulDate() <= to ? seoulDate() : to,
            body_weight_kg: '',
            body_fat_percent: '',
            skeletal_muscle_kg: '',
          },
    );
  };
  return (
    <section>
      <PageHeader
        eyebrow="BODY CHANGES, SIDE BY SIDE"
        title="몸의 변화도 함께 기록해요"
        description="체중·체지방률·골격근량을 날짜별로 기록합니다. 측정하지 않은 값은 비워두면 미입력으로 보관하며 추정하지 않습니다."
        actions={
          <>
            <Button
              variant="secondary"
              aria-expanded={importing}
              onClick={() => setImporting(!importing)}
            >
              인바디 가져오기
            </Button>
            <Button disabled={saving} onClick={() => edit()}>
              <Plus aria-hidden />
              신체 기록 추가
            </Button>
          </>
        }
      />
      {controls}
      {error && (
        <AlertBanner
          className="mt-4"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              다시 연결
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      <Notice className="mt-4" notice={status ? { kind: 'status', text: status } : undefined} />
      {importing && (
        <InbodyImport save={(body) => request('', 'POST', body)} done={() => void load()} />
      )}
      {draft && (
        <Card className="mt-4 gap-4 shadow-none">
          <CardHeader>
            <CardTitle asHeading="h2" className="text-body font-semibold">
              {draft.id ? '신체 기록 수정' : '새 신체 기록'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {formError && <AlertBanner>{formError}</AlertBanner>}
              <fieldset
                disabled={saving}
                className="m-0 grid min-w-0 grid-cols-2 gap-x-3 border-0 p-0 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1"
              >
                <Label className={fieldLabel}>
                  측정 날짜
                  <Input
                    className={touchText}
                    type="date"
                    required
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </Label>
                {metrics.map((m) => (
                  <Label key={m.key} className={fieldLabel}>
                    {m.label} {m.unit}
                    <Input
                      className={touchText}
                      type="number"
                      inputMode="decimal"
                      min={m.min}
                      max={m.max}
                      step="0.01"
                      placeholder="미입력"
                      value={draft[m.key]}
                      onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })}
                    />
                  </Label>
                ))}
              </fieldset>
              <p className={hint}>
                날짜마다 한 개의 기록만 저장합니다. 이미 기록한 날짜는 목록에서 수정하세요. 값은
                소수점 둘째 자리까지 저장하며, 하나 이상 입력해야 합니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button disabled={saving}>
                  {saving && <Spinner size="sm" aria-hidden />}
                  {saving ? '저장 중…' : '신체 기록 저장'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  취소
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {charted.length > 0 && (
        <div className="mt-4 grid gap-3.5 md:grid-cols-3">
          {charted.map((m) => (
            <Trend key={m.key} metric={m} rows={rows} from={from} to={to} />
          ))}
        </div>
      )}
      {/* A failed load has no rows to judge, so it must not claim the values are missing. */}
      {!loading && !error && missing.length > 0 && (
        <p className={cn(hint, 'mt-4')}>
          이 기간에 입력한 값이 없는 지표: {missing.map((m) => m.label).join(' · ')}
        </p>
      )}
      <p className={cn(hint, 'mt-2 mb-4')}>
        같은 날의 운동 볼륨을 나란히 보여줄 뿐이며, 운동과 신체 변화 사이의 인과 관계를 뜻하지
        않습니다. 의학적 판정이나 권장 범위는 제공하지 않습니다.
      </p>
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
          <CardTitle asHeading="h2" className="flex items-center gap-2 text-body font-semibold">
            신체 기록{' '}
            <Badge variant="secondary" className="text-xs">
              {rows.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-caption">
            선택한 기간의 측정값과 같은 날 운동 볼륨
          </CardDescription>
        </CardHeader>
        {loading ? (
          // #173: row placeholders while the list loads; the hidden line keeps the status.
          <div aria-busy="true" className="px-6 py-6">
            <p role="status" className="sr-only">
              기록을 불러오는 중…
            </p>
            <SkeletonList />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4 md:m-6"
            headingLevel="h3"
            icon={<Scale />}
            title="선택한 기간에 신체 기록이 없습니다"
            description="측정한 날의 값만 입력하세요. 그래프는 기록한 값만 표시합니다."
          />
        ) : (
          <List aria-label="신체 기록" className="px-4 py-1 md:px-6 md:py-2.5">
            {[...rows].reverse().map((row) => {
              const date = row.date.slice(0, 10);
              const volume = volumeByDate.get(date);
              return (
                <ListItem key={row.id} className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4">
                  <div className="min-w-0 flex-1 basis-full [overflow-wrap:anywhere] md:basis-auto">
                    <h3 className="text-body-sm font-semibold">{date}</h3>
                    <p className="mt-1 text-meta text-muted-foreground">
                      {metrics
                        .map(
                          (m) =>
                            `${m.label} ${row[m.key] === null ? '미입력' : fmt(row[m.key]!) + ' ' + m.unit}`,
                        )
                        .join(' · ')}
                    </p>
                    <p className="mt-1 text-meta text-muted-foreground">
                      {volume === undefined
                        ? '같은 날 운동 기록 없음'
                        : `같은 날 운동 볼륨 ${fmt(volume)} kg`}
                    </p>
                  </div>
                  <div className="flex gap-1 max-md:ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`${date} 신체 기록 수정`}
                      onClick={() => edit(row)}
                    >
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`${date} 신체 기록 삭제`}
                      onClick={() => void remove(row)}
                    >
                      삭제
                    </Button>
                  </div>
                </ListItem>
              );
            })}
          </List>
        )}
      </Card>
    </section>
  );
}

// Drawn only for a metric with at least one value in the period (#123).
function Trend({
  metric,
  rows,
  from,
  to,
}: {
  metric: (typeof metrics)[number];
  rows: BodyRecord[];
  from: string;
  to: string;
}) {
  const width = 300,
    height = 120,
    pad = 10;
  const span = Math.max(days(from, to), 1);
  // A record without this metric breaks the line; missing values are never drawn as 0.
  const segments: { date: string; value: number }[][] = [[]];
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const value = row[metric.key];
    if (value === null) {
      if (segments.at(-1)!.length) segments.push([]);
    } else segments.at(-1)!.push({ date: row.date.slice(0, 10), value });
  }
  const points = segments.flat();
  const values = points.map((p) => p.value);
  const low = Math.min(...values),
    high = Math.max(...values);
  const [min, max] = low === high ? [low - 1, high + 1] : [low, high];
  const x = (date: string) => pad + (days(from, date) / span) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min)) * (height - pad * 2);
  const change = points.length > 1 ? points.at(-1)!.value - points[0].value : null;
  return (
    <figure
      data-slot="body-trend"
      className="m-0 rounded-xl border bg-card p-4 text-card-foreground"
      role="img"
      aria-label={`${metric.label} 추이 (${metric.unit}): ${points
        .map((p) => `${p.date} ${fmt(p.value)}`)
        .join(', ')}`}
    >
      <figcaption className="mb-2 flex justify-between gap-2 text-meta text-muted-foreground">
        <strong className="font-semibold text-foreground">
          {metric.label} ({metric.unit})
        </strong>
        <span>
          {change === null
            ? `${fmt(points[0].value)} ${metric.unit}`
            : `첫 기록 대비 ${change > 0 ? '+' : ''}${fmt(change)} ${metric.unit}`}
        </span>
      </figcaption>
      <svg
        className="block h-30 w-full border-y border-dashed"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {segments
          .filter((s) => s.length > 1)
          .map((s, i) => (
            <polyline
              key={i}
              className="stroke-primary stroke-2 [vector-effect:non-scaling-stroke]"
              fill="none"
              points={s.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
            />
          ))}
        {points.map((p) => (
          <circle key={p.date} className="fill-primary" cx={x(p.date)} cy={y(p.value)} r="3.5">
            <title>{`${p.date} ${fmt(p.value)} ${metric.unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1.5 flex justify-between gap-1.5 text-meta text-muted-foreground">
        <span>{from}</span>
        <span>
          {fmt(low)}–{fmt(high)} {metric.unit}
        </span>
        <span>{to}</span>
      </div>
    </figure>
  );
}
