import { Card, CardTitle } from '../components/ui/card';
import { bodyPartLabel, plural } from '../labels';
import { cn } from '../lib/utils';
import { cardioLabel } from '../routine-cardio';
import { days, goalLabel, type Machine, machineName, type Plan, stepOf, type Steps } from './model';
import { CardioPreview, Preview } from './previews';
import { list } from './styles';

export function PlanView({
  selected,
  machines,
  steps,
}: {
  selected: Plan;
  machines: Machine[];
  steps: Steps;
}) {
  return (
    <Card
      role="region"
      aria-labelledby="routine-plan-title"
      className="mt-5 gap-0 px-4 py-5 shadow-none md:px-6 md:py-6"
    >
      <article>
        <CardTitle
          id="routine-plan-title"
          asHeading="h3"
          className="text-body font-semibold [overflow-wrap:anywhere]"
        >
          {selected.name}
        </CardTitle>
        <p className="mt-1.5 text-body-sm text-muted-foreground">
          {selected.split_count === 1 ? 'No split' : `${selected.split_count}-day split`} · Start
          date {selected.start_date} ·{' '}
          {selected.schedule_mode === 'cycle' && selected.cycle
            ? `Repeats ${selected.cycle.train_days} days on, ${selected.cycle.rest_days} days off`
            : `${selected.weekly_workouts} workouts/week · Rest ${
                selected.rest_days.map((d) => days[d]).join(', ') || 'none'
              }`}
        </p>
        {selected.splits.map((s, i) => (
          <section key={i} className="mt-4 border-t pt-3">
            <h4 className="text-body-sm font-semibold [overflow-wrap:anywhere]">{s.name}</h4>
            <p className="mt-1 text-meta text-muted-foreground">
              {s.body_parts.map(bodyPartLabel).join(' → ')}
            </p>
            <ul className={list}>
              {s.exercises.map((ex, j) => (
                <li key={j} className="[overflow-wrap:anywhere]">
                  {ex.exercise}
                  {machineName(machines, ex.machine_id) &&
                    ` (${machineName(machines, ex.machine_id)})`}{' '}
                  · {plural(Number(ex.sets), 'set')} · total weight {ex.weight} kg ·{' '}
                  {plural(Number(ex.reps), 'rep')}
                  {selected.progression === 'auto' &&
                    ` · Rep range ${ex.rep_min}–${ex.rep_max} · Increase step ${stepOf(steps, ex.exercise)} kg`}
                </li>
              ))}
              {s.cardio?.map((c, j) => (
                <li key={`cardio-${j}`} className="[overflow-wrap:anywhere]">
                  Cardio · {cardioLabel(c)}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <CardioPreview splits={selected.splits} />
        {selected.progression === 'auto' ? (
          <>
            <Preview plan={selected} steps={steps} />
          </>
        ) : (
          <section className="mt-4 border-t pt-3">
            <h4 className="text-body-sm font-semibold">Goals by week</h4>
            <ol className={list}>
              {selected.weeks?.map((w) => (
                <li
                  key={w.week}
                  data-deload={w.kind === 'deload' || undefined}
                  className="text-muted-foreground data-deload:font-medium data-deload:text-foreground"
                >
                  Week {w.week} · {goalLabel(w)}
                </li>
              ))}
            </ol>
          </section>
        )}
        <section className="mt-4 border-t pt-3">
          <h4 className="text-body-sm font-semibold">
            Workout schedule · 12 weeks from the start date (Asia/Seoul)
          </h4>
          <ul className={cn(list, 'md:columns-2 md:gap-6')}>
            {selected.schedule?.map((day) => (
              <li
                key={day.date}
                data-deload={day.is_deload || undefined}
                className="break-inside-avoid [overflow-wrap:anywhere] text-muted-foreground data-deload:text-foreground"
              >
                {day.date} · Week {day.week} · {selected.splits[day.split_index].name}
                {day.is_deload ? ' · Deload' : ''}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </Card>
  );
}
