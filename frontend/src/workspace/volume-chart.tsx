import { rangeBuckets } from '../date-range';
import { cn } from '../lib/utils';
import { calendarDate, cleanDate, fmt, iso, vol, type Workout } from './model';

export function VolumeChart({
  workouts,
  from,
  to,
  custom = false,
}: {
  workouts: Workout[];
  from: string;
  to: string;
  custom?: boolean;
}) {
  const start = calendarDate(from),
    end = calendarDate(to);
  const count = Math.round((+end - +start) / 86400000) + 1;
  const buckets = count > 31 ? 12 : count > 7 ? Math.ceil(count / 7) : count;
  // #85: a directly chosen range groups by day, week or month by its length.
  const sum = (a: string, b: string) =>
    workouts
      .filter((w) => cleanDate(w.date) >= a && cleanDate(w.date) < b)
      .reduce((n, w) => n + vol(w), 0);
  const values = custom
    ? rangeBuckets(from, to).map((b) => ({ label: b.label, value: sum(b.start, b.end) }))
    : presetValues();
  // Up to 31 daily bars: only every few labels are drawn so they do not overlap.
  const labelStep = Math.ceil(values.length / 12);
  function presetValues() {
    return Array.from({ length: buckets }, (_, i) => {
      const a = new Date(start);
      a.setUTCDate(a.getUTCDate() + Math.floor((i * count) / buckets));
      const b = new Date(start);
      b.setUTCDate(b.getUTCDate() + Math.floor(((i + 1) * count) / buckets));
      return {
        label:
          count > 7
            ? `${a.getUTCMonth() + 1}/${a.getUTCDate()}`
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.getUTCDay()],
        value: workouts
          .filter((w) => cleanDate(w.date) >= iso(a) && cleanDate(w.date) < iso(b))
          .reduce((n, w) => n + vol(w), 0),
      };
    });
  }
  const max = Math.max(100, ...values.map((v) => v.value));
  // Past a week of bars the labels thin out by the plot's own width (the sidebar and the
  // side card make it independent of the screen width): every 4th, every 2nd, then all.
  const labelClass = (i: number) =>
    values.length <= 7 || i % (labelStep * 4) === 0
      ? undefined
      : i % (labelStep * 2) === 0
        ? 'hidden @min-[200px]:inline'
        : 'hidden @min-[480px]:inline';
  return (
    <div
      data-slot="volume-chart"
      className="flex h-56 gap-3 px-4 pt-6 pb-5 md:px-6 2xl:h-64"
      role="img"
      aria-label={`Volume by period: ${values.map((v) => v.label + ' ' + fmt(v.value) + 'kg').join(', ')}`}
    >
      <div className="flex shrink-0 flex-col justify-between pb-6 text-right text-meta tabular-nums">
        {[1, 0.75, 0.5, 0.25, 0].map((v) => (
          <span key={v} className="-my-2">
            {fmt(max * v)}
          </span>
        ))}
      </div>
      <div className="@container relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className="border-t border-dashed" />
          ))}
        </div>
        <div className="absolute inset-0 flex justify-around gap-px @sm:gap-1 @lg:gap-2.5">
          {/* min-w-0 and absolutely placed labels keep 31 bars inside a narrow plot (#101). */}
          {values.map((v, i) => (
            <div className="flex max-w-10 min-w-0 flex-1 flex-col items-center" key={i}>
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  data-slot="volume-bar"
                  className={cn(
                    'w-3/4 min-w-0.5 rounded-t-sm',
                    i === values.length - 1 ? 'bg-primary' : 'bg-foreground/20',
                  )}
                  style={{ height: `${(v.value / max) * 100}%`, minHeight: v.value ? 3 : 0 }}
                  title={`${v.label}: ${fmt(v.value)}kg`}
                />
              </div>
              <span className="relative h-6 w-full text-meta leading-6">
                {i % labelStep === 0 && (
                  <span
                    data-slot="volume-label"
                    className={cn(
                      'absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
                      labelClass(i),
                    )}
                  >
                    {v.label}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        {!workouts.length && (
          <div className="absolute inset-x-0 top-[30%] text-center text-caption">
            The chart fills in from your first record
          </div>
        )}
      </div>
    </div>
  );
}
