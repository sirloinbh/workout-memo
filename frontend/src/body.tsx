import React, { useCallback, useEffect, useRef, useState } from 'react';
import { seoulDate } from './date';

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
    <section className="body-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BODY CHANGES, SIDE BY SIDE</div>
          <h1>
            몸의 변화도 함께 기록해요<span className="heading-dot">.</span>
          </h1>
          <p>
            체중·체지방률·골격근량을 날짜별로 기록합니다. 측정하지 않은 값은 비워두면 미입력으로
            보관하며 추정하지 않습니다.
          </p>
        </div>
        <button className="primary" disabled={saving} onClick={() => edit()}>
          신체 기록 추가
        </button>
      </div>
      {controls}
      {error && (
        <div role="alert" className="error">
          {error} <button onClick={() => void load()}>다시 연결</button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {draft && (
        <form
          className="card body-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{draft.id ? '신체 기록 수정' : '새 신체 기록'}</h2>
          {formError && (
            <p role="alert" className="error">
              {formError}
            </p>
          )}
          <fieldset disabled={saving} className="form-grid">
            <label>
              측정 날짜
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            {metrics.map((m) => (
              <label key={m.key}>
                {m.label} {m.unit}
                <input
                  type="number"
                  inputMode="decimal"
                  min={m.min}
                  max={m.max}
                  step="0.01"
                  placeholder="미입력"
                  value={draft[m.key]}
                  onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
          <p className="form-hint">
            날짜마다 한 개의 기록만 저장합니다. 이미 기록한 날짜는 목록에서 수정하세요. 값은 소수점
            둘째 자리까지 저장하며, 하나 이상 입력해야 합니다.
          </p>
          <button className="primary" disabled={saving}>
            {saving ? '저장 중…' : '신체 기록 저장'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={saving}
            onClick={() => setDraft(null)}
          >
            취소
          </button>
        </form>
      )}
      <div className="body-trends">
        {metrics.map((m) => (
          <Trend key={m.key} metric={m} rows={rows} from={from} to={to} />
        ))}
      </div>
      <p className="form-hint">
        같은 날의 운동 볼륨을 나란히 보여줄 뿐이며, 운동과 신체 변화 사이의 인과 관계를 뜻하지
        않습니다. 의학적 판정이나 권장 범위는 제공하지 않습니다.
      </p>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>
              신체 기록 <span className="count">{rows.length}</span>
            </h2>
            <p>선택한 기간의 측정값과 같은 날 운동 볼륨</p>
          </div>
        </div>
        {loading ? (
          <div className="empty">기록을 불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <h3>선택한 기간에 신체 기록이 없습니다</h3>
            <p>측정한 날의 값만 입력하세요. 그래프는 기록한 값만 표시합니다.</p>
          </div>
        ) : (
          <ul className="body-list">
            {[...rows].reverse().map((row) => {
              const date = row.date.slice(0, 10);
              const volume = volumeByDate.get(date);
              return (
                <li key={row.id} className="workout-row">
                  <div className="workout-info">
                    <h3>{date}</h3>
                    <p>
                      {metrics
                        .map(
                          (m) =>
                            `${m.label} ${row[m.key] === null ? '미입력' : fmt(row[m.key]!) + ' ' + m.unit}`,
                        )
                        .join(' · ')}
                    </p>
                    <p>
                      {volume === undefined
                        ? '같은 날 운동 기록 없음'
                        : `같은 날 운동 볼륨 ${fmt(volume)} kg`}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={saving}
                    aria-label={`${date} 신체 기록 수정`}
                    onClick={() => edit(row)}
                  >
                    수정
                  </button>
                  <button
                    className="text-button"
                    disabled={saving}
                    aria-label={`${date} 신체 기록 삭제`}
                    onClick={() => void remove(row)}
                  >
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

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
      className="card body-trend"
      role="img"
      aria-label={`${metric.label} 추이 (${metric.unit}): ${
        points.length ? points.map((p) => `${p.date} ${fmt(p.value)}`).join(', ') : '기록 없음'
      }`}
    >
      <figcaption>
        <strong>
          {metric.label} ({metric.unit})
        </strong>
        <span>
          {change === null
            ? points.length
              ? `${fmt(points[0].value)} ${metric.unit}`
              : ''
            : `첫 기록 대비 ${change > 0 ? '+' : ''}${fmt(change)} ${metric.unit}`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {segments
          .filter((s) => s.length > 1)
          .map((s, i) => (
            <polyline
              key={i}
              fill="none"
              points={s.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
            />
          ))}
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3.5">
            <title>{`${p.date} ${fmt(p.value)} ${metric.unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="body-trend-axis">
        <span>{from}</span>
        {points.length > 0 && (
          <span>
            {fmt(low)}–{fmt(high)} {metric.unit}
          </span>
        )}
        <span>{to}</span>
      </div>
      {!points.length && (
        <p className="chart-empty">이 기간에 입력한 {metric.label} 값이 없습니다</p>
      )}
    </figure>
  );
}
