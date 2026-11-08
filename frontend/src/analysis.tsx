import { ChevronLeft } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import { DateStepper, RangeSummary } from './components/date-stepper';
import { SegmentedControl } from './components/segmented-control';
import { ToggleChips } from './components/toggle-chips';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { seoulDate } from './date';
import { cn } from './lib/utils';

// #102: the whole analysis page is on the common components: period controls from #224
// (DateStepper, RangeSummary), the load error from #223 (AlertBanner), cards and PR rows.
const card = 'mt-5 gap-0 py-0 shadow-none';
const cardHeader = 'px-4 pt-5 md:px-6 md:pt-6';
const cardContent = 'px-4 pt-2 pb-3 md:px-6 md:pb-4';
const hint = 'rounded-md bg-muted p-3 text-meta text-muted-foreground';
const value = '[overflow-wrap:anywhere]';
const cell =
  '[&>td]:px-2 [&>td]:py-1 [&>td]:text-left [&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium';

// #88: 이두·삼두 replace 팔 for new choices; a saved 팔 is still listed so it can be cleared.
const parts = ['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근'];
const legacyParts = ['팔'];
type PersonalRecord = { value: number; weight: number; reps: number; date: string; ties: number };
type Exercise = {
  key: string;
  exercise: string;
  body_parts: string[];
  set_count: number;
  last_date: string;
  unknown_base_sets: number;
  bodyweight_sets: number;
  prs: {
    max_weight: PersonalRecord | null;
    max_reps: PersonalRecord | null;
    max_set_volume: PersonalRecord | null;
    actual_1rm: PersonalRecord | null;
    estimated_1rm: PersonalRecord | null;
  };
  trend: {
    date: string;
    max_weight: number | null;
    max_reps: number;
    max_set_volume: number | null;
    estimated_1rm: number | null;
  }[];
};
type Week = {
  week_start: string;
  week_end: string;
  sets: number;
  volume: number;
  parts: { body_part: string; sets: number; volume: number }[];
};
type Result = { from: string; to: string; today: string; exercises: Exercise[]; weeks: Week[] };

const fmt = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n);
const shift = (date: string, days: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// Monday-start weeks ending with the week that contains the anchor date.
function analysisRange(anchor: string, weeks: number) {
  const day = new Date(anchor + 'T12:00:00Z').getUTCDay();
  const monday = shift(anchor, -((day + 6) % 7));
  return { from: shift(monday, -7 * (weeks - 1)), to: shift(monday, 6) };
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method: body ? 'PUT' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? '분석 요청에 실패했습니다');
  return data;
}
// #125: one line per exercise in the list: best weight, estimated 1RM and the last date.
const summary = (x: Exercise) =>
  [
    x.prs.max_weight ? `최고 ${fmt(x.prs.max_weight.value)}kg` : '중량 기록 없음',
    x.prs.estimated_1rm ? `추정 1RM ${fmt(x.prs.estimated_1rm.value)}kg` : null,
    x.last_date,
  ]
    .filter(Boolean)
    .join(' · ');
const record = (r: PersonalRecord | null, value: (r: PersonalRecord) => string, none: string) =>
  r ? `${value(r)} · ${r.date}${r.ties > 1 ? ` · 동률 ${r.ties}회` : ''}` : none;

export function Analysis() {
  const [anchor, setAnchor] = useState(seoulDate());
  const [weeks, setWeeks] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ exercise: string; key: string; parts: string[] } | null>(
    null,
  );
  // #125: the exercise picked from the list; null shows the list on phones.
  const [selected, setSelected] = useState<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  useEffect(() => {
    // Picking or leaving an exercise moves focus to the shown detail, so a phone user lands on it.
    if (!focusDetail.current) return;
    focusDetail.current = false;
    detailHeading.current?.focus();
    detailHeading.current?.scrollIntoView?.({ block: 'start' });
  }, [selected]);
  const { from, to } = analysisRange(anchor, weeks);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const result = await request<Result>(`/analysis?from=${from}&to=${to}`);
      // An older range's late response must not replace the latest one.
      if (current !== version.current) return;
      setData(result);
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
  async function saveParts() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await request('/exercise-body-parts', {
        exercise: editing.exercise,
        body_parts: [...legacyParts, ...parts].filter((p) => editing.parts.includes(p)),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  // #125: one exercise in detail at a time. Phones show the list first and the detail after a
  // tap; from 768px both sit side by side and the first exercise is shown until one is picked.
  const shown = data?.exercises.find((x) => x.key === selected) ?? data?.exercises[0];
  function pick(key: string | null) {
    setSelected(key);
    setEditing(null);
    focusDetail.current = key !== null;
  }
  return (
    <section data-slot="analysis-page">
      <h2 className="mb-3 text-body font-semibold">종목 분석 · PR과 부위별 주간 운동량</h2>
      {/* The long rules fold away so the exercise list fits the first phone screen (#125). */}
      <details className="mb-4 rounded-md border px-3">
        <summary className="cursor-pointer py-2 text-body-sm font-medium pointer-coarse:py-3">
          분석 기준 안내
        </summary>
        <p className={hint}>
          서울 기준 오늘까지 서버에 저장된 기록만 사용합니다. 미래 날짜 기록과 브라우저의 저장 전
          초안은 포함하지 않으며, 일지를 수정·삭제하면 다시 조회할 때 반영됩니다. 같은 종목은 목표
          판정과 같이 앞뒤 공백과 영문 대소문자를 무시해 묶습니다.
        </p>
        <p className={cn(hint, 'mt-2 mb-3')}>
          추정 1RM = 총중량 kg × (1 + 반복 수 ÷ 30) (Epley 공식). 1~10회 세트에만 적용하며 1회
          세트는 그 중량입니다. 0kg(맨몸·보조 등 중량 미입력) 세트와 기본중량 미확인 머신 세트는
          제외합니다. 추정값은 실제로 들어 올린 기록이 아니며, 실측 1RM은 1회를 수행한 세트의 최고
          총중량입니다.
        </p>
      </details>
      {/* #224's period controls; like the dashboard, the date wraps under the tabs on phones. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label="분석 기간"
          options={[1, 4, 12].map((n) => ({ value: String(n), label: `${n}주` }))}
          value={String(weeks)}
          onValueChange={(value) => setWeeks(Number(value))}
        />
        <DateStepper label="분석 기준 날짜" value={anchor} onValueChange={setAnchor} />
      </div>
      <RangeSummary from={from} to={to}>
        월요일 시작 주 · 기간 추이와 부위별 통계
      </RangeSummary>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              다시 연결
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      {loading && (
        <p role="status" className="text-body-sm text-muted-foreground">
          분석 불러오는 중…
        </p>
      )}
      {data && (
        <>
          <Card role="region" aria-label="종목별 PR" className={card}>
            <CardHeader className={cardHeader}>
              <CardTitle asHeading="h2" className="text-body font-semibold">
                종목별 PR{' '}
                <Badge variant="secondary" className="ml-1.5 align-middle">
                  {data.exercises.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-caption">
                전체 기록의 최고값과 처음 달성한 날짜입니다. 운동을 고르면 자세히 봅니다.
              </CardDescription>
            </CardHeader>
            <CardContent className={cardContent}>
              {!shown ? (
                <EmptyState
                  className="my-2"
                  headingLevel="h3"
                  title="분석할 기록이 없습니다"
                  description="운동 일지를 저장하면 종목별 PR이 표시됩니다."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <ul
                    aria-label="운동 목록"
                    className={cn('flex flex-col gap-1 py-2', selected !== null && 'max-md:hidden')}
                  >
                    {data.exercises.map((x) => (
                      <li key={x.key}>
                        <button
                          type="button"
                          aria-current={x.key === shown.key ? 'true' : undefined}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=true]:bg-accent pointer-coarse:min-h-11"
                          onClick={() => pick(x.key)}
                        >
                          <span className="text-body-sm font-medium [overflow-wrap:anywhere]">
                            {x.exercise}
                          </span>
                          <span className="text-meta text-muted-foreground">{summary(x)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={cn('min-w-0', selected === null && 'max-md:hidden')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 -ml-2 md:hidden"
                      onClick={() => pick(null)}
                    >
                      <ChevronLeft aria-hidden />
                      운동 목록
                    </Button>
                    <article data-slot="exercise-pr" className="py-2" key={shown.key}>
                      <h3
                        ref={detailHeading}
                        tabIndex={-1}
                        className="text-body font-semibold [overflow-wrap:anywhere] outline-none"
                      >
                        {shown.exercise}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-body-sm text-muted-foreground">
                        부위: {shown.body_parts.length ? shown.body_parts.join(', ') : '미분류'} ·
                        총 {shown.set_count}세트
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          aria-label={`${shown.exercise} 부위 지정`}
                          disabled={saving}
                          onClick={() =>
                            setEditing({
                              exercise: shown.exercise,
                              key: shown.key,
                              parts: [...shown.body_parts],
                            })
                          }
                        >
                          부위 지정
                        </Button>
                      </p>
                      {editing?.key === shown.key && (
                        <div className="my-2 flex flex-wrap items-center gap-2">
                          <ToggleChips
                            label={`${shown.exercise} 부위`}
                            options={[
                              ...parts,
                              ...legacyParts.filter((p) => editing.parts.includes(p)),
                            ]}
                            value={editing.parts}
                            onValueChange={(next) => setEditing({ ...editing, parts: next })}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={saving}
                            onClick={() => void saveParts()}
                          >
                            부위 저장
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            취소
                          </Button>
                        </div>
                      )}
                      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
                        <dt className="text-muted-foreground">최고 중량</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_weight,
                            (r) => `${fmt(r.value)}kg × ${r.reps}회`,
                            '중량 기록 없음',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">최다 반복</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_reps,
                            (r) => `${r.value}회 · ${fmt(r.weight)}kg`,
                            '기록 없음',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">최고 세트 볼륨</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_set_volume,
                            (r) => `${fmt(r.value)}kg (${fmt(r.weight)}kg × ${r.reps}회)`,
                            '중량 기록 없음',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">실측 1RM</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.actual_1rm,
                            (r) => `${fmt(r.value)}kg`,
                            '1회 세트 기록 없음',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">추정 1RM (Epley)</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.estimated_1rm,
                            (r) => `${fmt(r.value)}kg 추정 (${fmt(r.weight)}kg × ${r.reps}회)`,
                            '계산 대상 세트 없음',
                          )}
                        </dd>
                      </dl>
                      <p className="mt-2 text-meta text-muted-foreground">
                        같은 값은 동률로 표시합니다.
                      </p>
                      {shown.unknown_base_sets > 0 && (
                        <p className={cn(hint, 'mt-2')}>
                          기본중량 미확인 머신 세트 {shown.unknown_base_sets}개는 1RM 계산에서
                          제외했습니다.
                        </p>
                      )}
                      {shown.bodyweight_sets > 0 && (
                        <p className={cn(hint, 'mt-2')}>
                          0kg 세트 {shown.bodyweight_sets}개는 반복 PR에만 포함하고
                          중량·볼륨·1RM에서 제외했습니다.
                        </p>
                      )}
                      <Trend exercise={shown} />
                    </article>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card role="region" aria-label="부위별 주간 운동량" className={card}>
            <CardHeader className={cardHeader}>
              <CardTitle asHeading="h2" className="text-body font-semibold">
                부위별 주간 운동량
              </CardTitle>
              <CardDescription className="text-caption">
                운동마다 직접 지정한 부위로 집계합니다. 운동명으로 부위를 추측하지 않으며 지정하지
                않은 운동은 미분류입니다. 여러 부위에 지정한 운동의 세트는 각 부위에 모두 더하므로
                부위별 합계가 주간 전체보다 클 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className={cardContent}>
              {data.weeks.map((w) => {
                const done = w.parts.filter((p) => p.sets > 0);
                const empty = w.parts.filter((p) => p.sets === 0);
                return (
                  <article
                    data-slot="analysis-week"
                    className="border-b py-3 last:border-b-0"
                    key={w.week_start}
                  >
                    <h3 className="text-body-sm font-semibold">
                      {w.week_start} — {w.week_end} · 전체 {w.sets}세트 · {fmt(w.volume)}kg
                    </h3>
                    {done.length > 0 && <PartTable rows={done} />}
                    {/* #125: parts without a set this week fold away. */}
                    {empty.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer py-1 text-meta text-muted-foreground pointer-coarse:py-3">
                          기록 없는 부위 {empty.length}개 ·{' '}
                          {empty.map((p) => p.body_part).join(', ')}
                        </summary>
                        <PartTable rows={empty} />
                      </details>
                    )}
                  </article>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
function PartTable({ rows }: { rows: Week['parts'] }) {
  return (
    <table className="mt-1 w-full border-collapse text-body-sm">
      <thead>
        <tr className={cell}>
          <th>부위</th>
          <th>세트</th>
          <th>볼륨</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr className={cn(cell, 'text-muted-foreground')} key={p.body_part}>
            <td>{p.body_part}</td>
            <td>{p.sets}세트</td>
            <td>{fmt(p.volume)}kg</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Trend({ exercise }: { exercise: Exercise }) {
  if (!exercise.trend.length)
    return <p className="mt-3 text-body-sm text-muted-foreground">선택 기간 기록 없음</p>;
  const max = Math.max(1, ...exercise.trend.map((t) => t.max_weight ?? 0));
  return (
    <div
      data-slot="trend"
      className="mt-3 flex min-h-[100px] items-end gap-1.5 overflow-x-auto"
      role="img"
      aria-label={`${exercise.exercise} 기간 추이: ${exercise.trend
        .map(
          (t) =>
            `${t.date} 최고 중량 ${t.max_weight === null ? '없음' : fmt(t.max_weight) + 'kg'}, 최다 ${t.max_reps}회, 추정 1RM ${t.estimated_1rm === null ? '제외' : fmt(t.estimated_1rm) + 'kg'}`,
        )
        .join('; ')}`}
    >
      {exercise.trend.map((t) => (
        <div className="flex flex-col items-center text-meta text-muted-foreground" key={t.date}>
          <div
            className="w-3.5 rounded-t-sm bg-primary"
            style={{ height: Math.max(t.max_weight ? 3 : 0, ((t.max_weight ?? 0) / max) * 80) }}
            title={`${t.date}: ${fmt(t.max_weight ?? 0)}kg`}
          />
          <span>{t.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
