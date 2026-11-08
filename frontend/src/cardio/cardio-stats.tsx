import { BarChart3 } from 'lucide-react';
import { useState } from 'react';

import { SegmentedControl, type SegmentOption } from '../components/segmented-control';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import type { CardioKind } from '../contract';
import { rangeDays } from '../date-range';
import type { CardioSession } from './api';
import { CardioRecords } from './cardio-records';
import { cardioKindLabels, formatDistance, formatDuration, formatPace } from './format';
import {
  type Bucket,
  bucketsOf,
  kindsOf,
  runningPaces,
  type StatUnit,
  type Totals,
  totalsOf,
} from './stats';

// #115 PR ②: the statistics of the cardio tab, self-contained so the journal tab (PR ③) only
// places it next to CardioPanel with the same period and sessions. Totals, the weekly or monthly
// trend (all kinds and per kind) and the running pace come from `sessions`; the all-time
// personal records are loaded by CardioRecords.

type Metric = 'distance' | 'duration' | 'count';
const units: SegmentOption<StatUnit>[] = [
  { value: 'week', label: '주별' },
  { value: 'month', label: '월별' },
];
const metrics: SegmentOption<Metric>[] = [
  { value: 'distance', label: '거리' },
  { value: 'duration', label: '시간' },
  { value: 'count', label: '횟수' },
];

// Distance in km for a mix of kinds; swimming alone in m like everywhere else (format.ts).
const distanceText = (kind: CardioKind | null, km: number) =>
  formatDistance(kind ?? 'running', km)!;
const value = (t: Totals, metric: Metric) =>
  metric === 'distance' ? t.distance_km : metric === 'duration' ? t.duration_sec : t.count;
const text = (t: Totals, metric: Metric, kind: CardioKind | null) =>
  metric === 'distance'
    ? distanceText(kind, t.distance_km)
    : metric === 'duration'
      ? formatDuration(t.duration_sec)
      : `${t.count}회`;

export function CardioStats({
  from,
  to,
  sessions,
  refreshKey,
}: {
  from: string;
  to: string;
  // The sessions of from..to as CardioPanel loads them (listCardioSessions).
  sessions: readonly CardioSession[];
  // Passed to CardioRecords: change it after a save or delete to reload the records.
  refreshKey?: number;
}) {
  // Long periods start per month, like the volume chart's groups (rangeBuckets).
  const [unit, setUnit] = useState<StatUnit>(() => (rangeDays(from, to) > 92 ? 'month' : 'week'));
  const [metric, setMetric] = useState<Metric>('distance');
  const kinds = kindsOf(sessions);
  const total = totalsOf(sessions);
  const unitName = unit === 'week' ? '주별' : '월별';
  const metricName = metrics.find((m) => m.value === metric)!.label;

  return (
    <section aria-label="유산소 통계" className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
          <CardTitle asHeading="h2" className="text-body font-semibold">
            유산소 통계
          </CardTitle>
          <CardDescription className="text-caption">
            {from} ~ {to}
          </CardDescription>
        </CardHeader>
        {sessions.length === 0 ? (
          <EmptyState
            className="m-4 md:m-6"
            headingLevel="h3"
            icon={<BarChart3 />}
            title="선택한 기간에 통계를 낼 유산소 기록이 없습니다"
            description="기록을 남기면 주별·월별 거리, 시간, 횟수와 러닝 페이스 추이를 보여 줍니다."
          />
        ) : (
          <div className="flex flex-col gap-6 px-4 pt-4 pb-5 md:px-6 md:pb-6">
            <dl aria-label="기간 합계" className="grid grid-cols-3 gap-3">
              {(
                [
                  ['거리', distanceText(null, total.distance_km)],
                  ['시간', formatDuration(total.duration_sec)],
                  ['횟수', `${total.count}회`],
                ] as const
              ).map(([label, shown]) => (
                <div key={label} className="min-w-0 rounded-md bg-muted px-3 py-2.5">
                  <dt className="text-meta text-muted-foreground">{label}</dt>
                  <dd className="text-body font-semibold break-words tabular-nums">{shown}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              <SegmentedControl
                label="집계 단위"
                options={units}
                value={unit}
                onValueChange={setUnit}
              />
              <SegmentedControl
                label="지표"
                options={metrics}
                value={metric}
                onValueChange={setMetric}
              />
            </div>

            <Trend
              title={`전체 ${unitName} ${metricName}`}
              buckets={bucketsOf(sessions, from, to, unit)}
              unit={unit}
              metric={metric}
              kind={null}
            />

            {kinds.length > 1 && (
              <div>
                <h3 className="mb-3 text-body-sm font-semibold">
                  종류별 {unitName} {metricName}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {kinds.map((kind) => (
                    <Trend
                      key={kind}
                      title={`${cardioKindLabels[kind]} ${unitName} ${metricName}`}
                      buckets={bucketsOf(
                        sessions.filter((s) => s.kind === kind),
                        from,
                        to,
                        unit,
                      )}
                      unit={unit}
                      metric={metric}
                      kind={kind}
                      small
                    />
                  ))}
                </div>
              </div>
            )}

            <KindTable sessions={sessions} kinds={kinds} />
            <PaceTrend sessions={sessions} />
          </div>
        )}
      </Card>
      <CardioRecords refreshKey={refreshKey} />
    </section>
  );
}

// Bars in the volume chart's style (rounded top, bg-primary), with the values as the image's
// text alternative. Kinds share one monochrome palette, so each kind gets its own small chart
// instead of a coloured stack.
function Trend({
  title,
  buckets,
  unit,
  metric,
  kind,
  small = false,
}: {
  title: string;
  buckets: Bucket[];
  unit: StatUnit;
  metric: Metric;
  kind: CardioKind | null;
  small?: boolean;
}) {
  const Heading = small ? 'h4' : 'h3';
  const values = buckets.map((b) => value(b, metric));
  const max = Math.max(...values);
  // Up to a year of weeks: only every few labels are drawn so they do not overlap.
  const labelStep = Math.ceil(buckets.length / (small ? 6 : 12));
  const name = (b: Bucket) => (unit === 'week' ? `${b.label} 주` : b.label);
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex justify-between gap-2 text-meta text-muted-foreground">
        <Heading className="text-body-sm font-semibold text-foreground">{title}</Heading>
        {max > 0 && <span>최대 {text(buckets[values.indexOf(max)], metric, kind)}</span>}
      </figcaption>
      {max === 0 ? (
        // Only possible for distance: the sessions here have time but no distance.
        <p className="text-body-sm text-muted-foreground">거리를 입력한 기록이 없습니다</p>
      ) : (
        <div
          data-slot="cardio-trend"
          className={`flex gap-px border-b border-dashed sm:gap-1 ${small ? 'h-24' : 'h-36'}`}
          role="img"
          aria-label={`${title}: ${buckets.map((b) => `${name(b)} ${text(b, metric, kind)}`).join(', ')}`}
        >
          {buckets.map((b, i) => (
            <div key={b.start} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  data-slot="cardio-bar"
                  className="w-3/4 max-w-8 min-w-0.5 rounded-t-sm bg-primary"
                  style={{
                    height: `${(values[i] / max) * 100}%`,
                    minHeight: values[i] ? 3 : 0,
                  }}
                  title={`${name(b)}: ${text(b, metric, kind)}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {max > 0 && (
        <div className="flex gap-px text-meta text-muted-foreground sm:gap-1" aria-hidden="true">
          {buckets.map((b, i) => (
            <span key={b.start} className="relative h-5 min-w-0 flex-1 leading-5">
              {i % labelStep === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                  {b.label}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

// The period's totals per kind as text: the split the per-kind charts draw.
function KindTable({
  sessions,
  kinds,
}: {
  sessions: readonly CardioSession[];
  kinds: CardioKind[];
}) {
  const cell = '[&>*]:border-b [&>*]:py-2 [&>*]:pr-3 [&>*:last-child]:pr-0';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm tabular-nums">
        <caption className="mb-2 text-left text-body-sm font-semibold">종류별 합계</caption>
        <thead>
          <tr className={`${cell} text-meta text-muted-foreground`}>
            <th scope="col">종류</th>
            <th scope="col">횟수</th>
            <th scope="col">시간</th>
            <th scope="col">거리</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => {
            const own = sessions.filter((s) => s.kind === kind);
            const t = totalsOf(own);
            const measured = own.some((s) => s.distance_km !== null);
            return (
              <tr key={kind} className={cell}>
                <th scope="row" className="font-medium">
                  {cardioKindLabels[kind]}
                </th>
                <td>{t.count}회</td>
                <td>{formatDuration(t.duration_sec)}</td>
                <td>{measured ? distanceText(kind, t.distance_km) : '거리 미입력'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Running pace per session (m:ss/km), faster drawn higher. Sessions without distance have no
// pace and are left out; the line is drawn in the body trend's SVG style.
function PaceTrend({ sessions }: { sessions: readonly CardioSession[] }) {
  const points = runningPaces(sessions);
  const heading = <h3 className="text-body-sm font-semibold text-foreground">러닝 페이스 추이</h3>;
  if (!points.length)
    return (
      <div>
        {heading}
        <p className="mt-2 text-body-sm text-muted-foreground">
          거리를 입력한 러닝 기록이 없어 페이스를 계산할 수 없습니다
        </p>
      </div>
    );
  const width = 300,
    height = 120,
    pad = 10;
  const paces = points.map((p) => p.pace);
  const low = Math.min(...paces),
    high = Math.max(...paces);
  const [min, max] = low === high ? [low - 30, high + 30] : [low, high];
  const x = (i: number) =>
    points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2);
  // A lower pace (faster) sits higher.
  const y = (pace: number) => pad + ((pace - min) / (max - min)) * (height - pad * 2);
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex justify-between gap-2 text-meta text-muted-foreground">
        {heading}
        <span>가장 빠름 {formatPace(low)}</span>
      </figcaption>
      {/* The heading stays outside role="img", which would hide it from screen readers. */}
      <svg
        data-slot="cardio-pace"
        className="block h-30 w-full border-y border-dashed"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`러닝 페이스 추이(위가 빠름): ${points
          .map((p) => `${p.date} ${formatPace(p.pace)}`)
          .join(', ')}`}
      >
        {points.length > 1 && (
          <polyline
            className="stroke-primary stroke-2 [vector-effect:non-scaling-stroke]"
            fill="none"
            points={points.map((p, i) => `${x(i)},${y(p.pace)}`).join(' ')}
          />
        )}
        {points.map((p, i) => (
          <circle key={p.id} className="fill-primary" cx={x(i)} cy={y(p.pace)} r="3.5">
            <title>{`${p.date} ${formatPace(p.pace)}`}</title>
          </circle>
        ))}
      </svg>
      <div
        className="mt-1.5 flex justify-between gap-1.5 text-meta text-muted-foreground"
        aria-hidden="true"
      >
        <span>{points[0].date}</span>
        <span>
          {formatPace(low)}–{formatPace(high)}
        </span>
        <span>{points.at(-1)!.date}</span>
      </div>
    </figure>
  );
}
