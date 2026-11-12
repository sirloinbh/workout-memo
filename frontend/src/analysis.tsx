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
import { SkeletonCard } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { seoulDate } from './date';
import { bodyPartLabel, plural } from './labels';
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

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
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
  if (!response.ok) throw Error(data.error ?? 'The analysis request failed');
  return data;
}
// #125: one line per exercise in the list: best weight, estimated 1RM and the last date.
const summary = (x: Exercise) =>
  [
    x.prs.max_weight ? `Best ${fmt(x.prs.max_weight.value)}kg` : 'No weight recorded',
    x.prs.estimated_1rm ? `Est. 1RM ${fmt(x.prs.estimated_1rm.value)}kg` : null,
    x.last_date,
  ]
    .filter(Boolean)
    .join(' · ');
const record = (r: PersonalRecord | null, value: (r: PersonalRecord) => string, none: string) =>
  r ? `${value(r)} · ${r.date}${r.ties > 1 ? ` · ${r.ties} tied` : ''}` : none;

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
  const listButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfter = useRef<{ to: 'detail' } | { to: 'list'; key: string } | null>(null);
  useEffect(() => {
    // On phones the list and the detail replace each other, so focus follows the one shown:
    // the detail heading after a pick, the picked exercise's button after going back.
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target?.to === 'detail') {
      detailHeading.current?.focus();
      detailHeading.current?.scrollIntoView?.({ block: 'start' });
    } else if (target) listButtons.current.get(target.key)?.focus();
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
    if (key === selected) return;
    const previous = selected;
    setSelected(key);
    setEditing(null);
    // From 768px the list and the detail stay side by side, so focus stays on the list.
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    focusAfter.current = !narrow
      ? null
      : key !== null
        ? { to: 'detail' }
        : previous !== null
          ? { to: 'list', key: previous }
          : null;
  }
  return (
    <section data-slot="analysis-page">
      <h2 className="mb-3 text-body font-semibold">
        Exercise Analysis · PRs and weekly volume by body part
      </h2>
      {/* The long rules fold away so the exercise list fits the first phone screen (#125). */}
      <details className="mb-4 rounded-md border px-3">
        <summary className="cursor-pointer py-2 text-body-sm font-medium pointer-coarse:py-3">
          About the analysis basis
        </summary>
        <p className={hint}>
          Only records saved to the server up to today (Seoul time) are used. Future-dated records
          and unsaved browser drafts are not included, and editing or deleting a journal is
          reflected the next time you load. Like goal evaluation, the same exercise is grouped by
          ignoring leading and trailing spaces and letter case.
        </p>
        <p className={cn(hint, 'mt-2 mb-3')}>
          Est. 1RM = total weight kg × (1 + reps ÷ 30) (Epley formula). It applies only to sets of
          1-10 reps, and a 1-rep set is that weight. Sets at 0 kg (bodyweight, assisted, or no
          weight entered) and sets on machines with an unconfirmed base weight are excluded. An
          estimate is not a weight you actually lifted; the measured 1RM is the highest total weight
          of a set where you did 1 rep.
        </p>
      </details>
      {/* #224's period controls; like the dashboard, the date wraps under the tabs on phones. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label="Analysis period"
          options={[1, 4, 12].map((n) => ({ value: String(n), label: n === 1 ? '1 week' : `${n} weeks` }))}
          value={String(weeks)}
          onValueChange={(value) => setWeeks(Number(value))}
        />
        <DateStepper label="Analysis reference date" value={anchor} onValueChange={setAnchor} />
      </div>
      <RangeSummary from={from} to={to}>
        Monday-start weeks · Period trends and body part stats
      </RangeSummary>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Reconnect
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      {/* #173: placeholders in the shape of the two cards on the first load; a reload keeps the
          cards and shows a short status line instead. */}
      {loading && !data && (
        <div aria-busy="true" aria-label="Exercise Analysis" className="mt-4 flex flex-col gap-4">
          <p role="status" className="sr-only">
            Loading analysis…
          </p>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {loading && data && (
        <p
          role="status"
          className="mt-2 flex items-center gap-2 text-body-sm text-muted-foreground"
        >
          <Spinner size="sm" aria-hidden />
          Loading analysis…
        </p>
      )}
      {data && (
        <>
          <Card role="region" aria-label="PRs by exercise" className={card}>
            <CardHeader className={cardHeader}>
              <CardTitle asHeading="h2" className="text-body font-semibold">
                PRs by exercise{' '}
                <Badge variant="secondary" className="ml-1.5 align-middle">
                  {data.exercises.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-caption">
                Your best values across all records and the date you first reached them. Choose an
                exercise to see details.
              </CardDescription>
            </CardHeader>
            <CardContent className={cardContent}>
              {!shown ? (
                <EmptyState
                  className="my-2"
                  headingLevel="h3"
                  title="No records to analyze"
                  description="Save a workout journal to see PRs per exercise."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <ul
                    aria-label="Exercise list"
                    className={cn('flex flex-col gap-1 py-2', selected !== null && 'max-md:hidden')}
                  >
                    {data.exercises.map((x) => (
                      <li key={x.key}>
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) listButtons.current.set(x.key, el);
                            else listButtons.current.delete(x.key);
                          }}
                          // The first exercise is shown on wide screens before any pick; only
                          // a picked one is announced as current.
                          aria-current={x.key === selected ? 'true' : undefined}
                          data-shown={x.key === shown.key || undefined}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 md:data-shown:bg-accent pointer-coarse:min-h-11"
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
                      Exercise list
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
                        Body parts:{' '}
                        {shown.body_parts.length
                          ? shown.body_parts.map(bodyPartLabel).join(', ')
                          : bodyPartLabel('미분류')}{' '}
                        · {plural(shown.set_count, 'set')} total
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          aria-label={`Set body part for ${shown.exercise}`}
                          disabled={saving}
                          onClick={() =>
                            setEditing({
                              exercise: shown.exercise,
                              key: shown.key,
                              parts: [...shown.body_parts],
                            })
                          }
                        >
                          Set body part
                        </Button>
                      </p>
                      {editing?.key === shown.key && (
                        <div className="my-2 flex flex-wrap items-center gap-2">
                          <ToggleChips
                            label={`Body part for ${shown.exercise}`}
                            options={[
                              ...parts,
                              ...legacyParts.filter((p) => editing.parts.includes(p)),
                            ]}
                            renderOption={bodyPartLabel}
                            value={editing.parts}
                            onValueChange={(next) => setEditing({ ...editing, parts: next })}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={saving}
                            onClick={() => void saveParts()}
                          >
                            {saving && <Spinner size="sm" aria-hidden />}
                            Save body parts
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
                        <dt className="text-muted-foreground">Best weight</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_weight,
                            (r) => `${fmt(r.value)}kg × ${plural(r.reps, 'rep')}`,
                            'No weight recorded',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">Most reps</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_reps,
                            (r) => `${plural(r.value, 'rep')} · ${fmt(r.weight)}kg`,
                            'No records',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">Best set volume</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.max_set_volume,
                            (r) =>
                              `${fmt(r.value)}kg (${fmt(r.weight)}kg × ${plural(r.reps, 'rep')})`,
                            'No weight recorded',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">Measured 1RM</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.actual_1rm,
                            (r) => `${fmt(r.value)}kg`,
                            'No 1-rep set recorded',
                          )}
                        </dd>
                        <dt className="text-muted-foreground">Est. 1RM (Epley)</dt>
                        <dd className={value}>
                          {record(
                            shown.prs.estimated_1rm,
                            (r) =>
                              `${fmt(r.value)}kg est. (${fmt(r.weight)}kg × ${plural(r.reps, 'rep')})`,
                            'No sets to calculate',
                          )}
                        </dd>
                      </dl>
                      <p className="mt-2 text-meta text-muted-foreground">
                        Equal values are shown as ties.
                      </p>
                      {shown.unknown_base_sets > 0 && (
                        <p className={cn(hint, 'mt-2')}>
                          {plural(shown.unknown_base_sets, 'set')} on machines with unconfirmed base
                          weight {shown.unknown_base_sets === 1 ? 'is' : 'are'} excluded from the
                          1RM calculation.
                        </p>
                      )}
                      {shown.bodyweight_sets > 0 && (
                        <p className={cn(hint, 'mt-2')}>
                          {plural(shown.bodyweight_sets, 'set')} at 0kg{' '}
                          {shown.bodyweight_sets === 1 ? 'is' : 'are'} included only in rep PRs and
                          excluded from weight, volume, and 1RM.
                        </p>
                      )}
                      <Trend exercise={shown} />
                    </article>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card role="region" aria-label="Weekly volume by body part" className={card}>
            <CardHeader className={cardHeader}>
              <CardTitle asHeading="h2" className="text-body font-semibold">
                Weekly volume by body part
              </CardTitle>
              <CardDescription className="text-caption">
                Totals use the body parts you set for each exercise. Body parts are not guessed from
                the exercise name, and exercises you have not set are unclassified. A set from an
                exercise assigned to several body parts counts fully toward each, so the body part
                totals can be larger than the weekly total.
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
                      {w.week_start} — {w.week_end} · Total {plural(w.sets, 'set')} ·{' '}
                      {fmt(w.volume)}kg
                    </h3>
                    {done.length > 0 && <PartTable rows={done} />}
                    {/* #125: parts without a set this week fold away. */}
                    {empty.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer py-1 text-meta text-muted-foreground pointer-coarse:py-3">
                          Body parts with no records ({empty.length}) ·{' '}
                          {empty.map((p) => bodyPartLabel(p.body_part)).join(', ')}
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
          <th>Body part</th>
          <th>Sets</th>
          <th>Volume</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr className={cn(cell, 'text-muted-foreground')} key={p.body_part}>
            <td>{bodyPartLabel(p.body_part)}</td>
            <td>{plural(p.sets, 'set')}</td>
            <td>{fmt(p.volume)}kg</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Trend({ exercise }: { exercise: Exercise }) {
  if (!exercise.trend.length)
    return (
      <p className="mt-3 text-body-sm text-muted-foreground">No records in the selected period</p>
    );
  const max = Math.max(1, ...exercise.trend.map((t) => t.max_weight ?? 0));
  return (
    <div
      data-slot="trend"
      className="mt-3 flex min-h-[100px] items-end gap-1.5 overflow-x-auto"
      role="img"
      aria-label={`${exercise.exercise} period trend: ${exercise.trend
        .map(
          (t) =>
            `${t.date} best weight ${t.max_weight === null ? 'none' : fmt(t.max_weight) + 'kg'}, max reps ${t.max_reps}, est. 1RM ${t.estimated_1rm === null ? 'excluded' : fmt(t.estimated_1rm) + 'kg'}`,
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
