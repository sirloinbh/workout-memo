import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { SkeletonText } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { plural } from './labels';
import {
  changeLabel,
  exerciseKey,
  exerciseText,
  kg,
  previousText,
  type Progress,
  sessionLabel,
  targetLabel,
} from './progress-data';

// `.legacy p` sets 12px muted text, so paragraphs in this card name their own size.
const text = 'text-sm text-muted-foreground';
const heading = 'mt-5 mb-1.5 text-sm font-semibold';
const list = 'my-1.5 space-y-1.5 pl-4 text-sm';
const cell =
  '[&>td]:border-t [&>td]:px-1.5 [&>td]:py-2 [&>td]:text-left [&>td]:align-top [&>th]:border-t [&>th]:px-1.5 [&>th]:py-2 [&>th]:text-left [&>th]:align-top';

export function RoutineProgress({
  progress,
  error,
  busy,
  confirming,
  draftDisabled,
  onQuick,
  onRestStart,
  onRestBack,
  onRestConfirm,
  onRestCancel,
  onReload,
}: {
  progress: Progress | null;
  error: string;
  busy: boolean;
  confirming: boolean;
  draftDisabled: boolean;
  onQuick: () => void;
  onRestStart: () => void;
  onRestBack: () => void;
  onRestConfirm: () => void;
  onRestCancel: () => void;
  onReload: () => void;
}) {
  const today = progress?.today_plan;
  const preview = progress?.rest_preview;
  const auto = progress?.progression === 'auto';
  return (
    <Card role="region" aria-label="Routine goals" className="mb-6 gap-0 py-0 shadow-none">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h2" className="text-body font-semibold">
          Routine goals
        </CardTitle>
        <CardDescription className="text-caption">
          A planned goal. Only saved workout journals count as actual records.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-2 pb-5 text-sm md:px-6 md:pb-6">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            {error}{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-destructive underline"
              onClick={onReload}
            >
              Reload routine goals
            </Button>
          </p>
        )}
        {!progress ? (
          // #173: text-line placeholders while the goals load; the hidden line keeps the status.
          // A failed load shows only the error banner above, not a placeholder that never ends.
          !error && (
            <div aria-busy="true" aria-label="Routine goal contents">
              <p role="status" className="sr-only">
                Loading routine goals…
              </p>
              <SkeletonText />
            </div>
          )
        ) : !progress.routine ? (
          <p className={text}>
            There is no routine in progress. Create a 12-week routine in Routine Builder with a
            start date of today or earlier to see today&apos;s, this week&apos;s, and the 12-week
            goals.
          </p>
        ) : (
          <>
            <p className={text}>
              <strong className="font-semibold text-foreground">{progress.routine.name}</strong> ·{' '}
              {progress.start_date} — {progress.end_date}
              {progress.current_week
                ? ` · Currently week ${progress.current_week}`
                : ' · Routine period ended'}
            </p>
            {progress.progression === 'auto' && (
              <p className="mt-2 rounded-md bg-muted p-3 text-meta">
                Auto goals (double progressive overload): advance on each session (workout day) of a
                split. If you perform every planned set at or above the target in the journal saved
                between the session&apos;s date and the next session of the same split, the next
                session advances; otherwise it keeps the same goal. Upcoming goals with no record
                yet are projections.
              </p>
            )}
            <h3 className={heading}>Today&apos;s goal · {progress.today}</h3>
            {!today ? (
              <p className={text}>Today is not a planned workout day.</p>
            ) : today.rest ? (
              <p role="status" className={text}>
                Today is set as a rest day. The remaining goals moved back one workout day each.{' '}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onRestCancel}
                >
                  Cancel rest
                </Button>
              </p>
            ) : today.target ? (
              <>
                <p className={text}>
                  {sessionLabel(today.target, auto)} ·{' '}
                  {changeLabel(today.target.change, today.target.is_deload)}
                </p>
                <ul data-slot="target-list" className={list}>
                  {today.target.exercises.map((e, i) => (
                    <li key={i}>
                      <strong className="font-semibold">{exerciseText(e)}</strong>
                      <small className="text-meta">
                        {' '}
                        (base {plural(e.base.sets, 'set')} · {kg(e.base.weight)} kg ·{' '}
                        {plural(e.base.reps, 'rep')}) ·{' '}
                        {previousText(progress.previous?.[exerciseKey(e.exercise)])}
                      </small>
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={draftDisabled || busy}
                    onClick={onQuick}
                  >
                    Log with today&apos;s routine
                  </Button>
                  {progress.can_rest && !confirming && (
                    <Button type="button" variant="ghost" disabled={busy} onClick={onRestStart}>
                      Rest today
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className={text}>No planned goals left for today.</p>
            )}
            {confirming && preview && (
              <div
                role="group"
                aria-label="Confirm before rest"
                className="mt-3.5 space-y-2 rounded-md bg-muted p-3.5 text-sm"
              >
                <p className="text-sm">
                  If you set today as a rest day, the goals below move back one workout day each.
                  The 12-week end date stays the same and saved journals do not change. You can only
                  cancel a rest on the same day.
                </p>
                <ol className="space-y-1 pl-4">
                  {preview.moves.map((m) => (
                    <li key={m.order}>
                      {targetLabel(m)} · {m.from} → {m.to ?? 'Excluded'}
                    </li>
                  ))}
                </ol>
                <p className="text-sm">
                  Last goal to be excluded:{' '}
                  {preview.excluded.map((t) => `${targetLabel(t)} (goal #${t.order})`).join(', ') ||
                    'None'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" disabled={busy} onClick={onRestConfirm}>
                    {busy && <Spinner size="sm" aria-hidden />}
                    {busy ? 'Processing…' : 'Confirm rest'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={onRestBack}>
                    Go back
                  </Button>
                </div>
              </div>
            )}
            <h3 className={heading}>This week&apos;s workout days</h3>
            {progress.this_week?.length ? (
              <ul data-slot="target-list" className={list}>
                {progress.this_week.map((d) => (
                  <li key={d.date}>
                    <strong className="font-semibold">{d.date}</strong> ·{' '}
                    {d.rest
                      ? 'Rest'
                      : d.target
                        ? `${sessionLabel(d.target, auto)} · ${d.target.exercises.map(exerciseText).join(' / ')}`
                        : 'No goal'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={text}>No workout days are planned this week.</p>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">12-week goals</summary>
              {/* Narrow screens scroll the table sideways instead of widening the page. The
                  box takes focus so keyboard users can scroll it too (axe scrollable-region-focusable). */}
              <div
                role="region"
                aria-label="12-week goals table"
                // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must be focusable.
                tabIndex={0}
                className="mt-2 overflow-x-auto rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className={cell}>
                      <th>Week</th>
                      <th>Planned change</th>
                      <th>Workout days · Goals by exercise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.weeks?.map((w) => (
                      <tr key={w.week} className={cell}>
                        <th className="whitespace-nowrap">Week {w.week}</th>
                        <td>{changeLabel(w.change, w.is_deload ?? w.week % 4 === 0)}</td>
                        <td>
                          <ul className="space-y-0.5 pl-4">
                            {w.entries.map((e) => (
                              <li
                                key={e.target.order}
                                data-excluded={e.excluded || undefined}
                                className={e.excluded ? 'text-muted-foreground' : undefined}
                              >
                                {e.excluded ? 'Excluded' : e.date} ·{' '}
                                {auto && e.target.session ? `Session ${e.target.session} · ` : ''}
                                {e.target.split_name} ·{' '}
                                {e.target.exercises.map(exerciseText).join(' / ')}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
