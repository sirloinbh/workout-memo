import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { days, type Plan, withSplitDefaults } from './model';
import { box, fieldLabel, hint, legend, nativeSelect, touchText } from './styles';

export function BasicsStep({ draft, setDraft }: { draft: Plan; setDraft: (plan: Plan) => void }) {
  return (
    <>
      <Label className={cn(fieldLabel, 'mb-3')}>
        Weekly goal mode
        <select
          className={nativeSelect}
          value={draft.progression ?? 'manual'}
          onChange={(e) => setDraft({ ...draft, progression: e.target.value as 'manual' | 'auto' })}
        >
          <option value="auto">Auto · double progressive overload</option>
          <option value="manual">Manual · Enter by week</option>
        </select>
      </Label>
      <Label className={cn(fieldLabel, 'mb-3')}>
        Routine name
        <Input
          className={touchText}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Label>
      <Label className={fieldLabel}>
        Start date
        <Input
          className={touchText}
          required
          type="date"
          value={draft.start_date}
          onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
        />
      </Label>
    </>
  );
}

export function ScheduleStep({ draft, setDraft }: { draft: Plan; setDraft: (plan: Plan) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
        <Label className={fieldLabel}>
          Split type
          <select
            className={nativeSelect}
            value={draft.split_count}
            onChange={(e) => setDraft(withSplitDefaults(draft, Number(e.target.value)))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'No split' : `${n}-day split`}
              </option>
            ))}
          </select>
        </Label>
        <Label className={fieldLabel}>
          Workout schedule type
          <select
            className={nativeSelect}
            value={draft.schedule_mode ?? 'weekday'}
            onChange={(e) =>
              setDraft({ ...draft, schedule_mode: e.target.value as 'weekday' | 'cycle' })
            }
          >
            <option value="cycle">Cycle · N days on, then M days off</option>
            <option value="weekday">Weekdays · Set rest weekdays</option>
          </select>
        </Label>
        {draft.schedule_mode === 'cycle' ? (
          <>
            <Label className={fieldLabel}>
              Consecutive workout days
              <Input
                className={touchText}
                required
                type="number"
                min={1}
                max={7}
                value={draft.cycle?.train_days ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cycle: { rest_days: 1, ...draft.cycle, train_days: e.target.value },
                  })
                }
              />
            </Label>
            <Label className={fieldLabel}>
              Consecutive rest days
              <Input
                className={touchText}
                required
                type="number"
                min={0}
                max={7}
                value={draft.cycle?.rest_days ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cycle: { train_days: 1, ...draft.cycle, rest_days: e.target.value },
                  })
                }
              />
            </Label>
          </>
        ) : (
          <Label className={fieldLabel}>
            Workouts per week
            <Input
              className={touchText}
              required
              type="number"
              min={1}
              max={7}
              value={draft.weekly_workouts || ''}
              onChange={(e) => setDraft({ ...draft, weekly_workouts: Number(e.target.value) })}
            />
          </Label>
        )}
      </div>
      {draft.schedule_mode === 'cycle' ? (
        <p className={cn(hint, 'mt-3')}>
          Workout days and rest days repeat from the start date. Choosing a split type fills in the
          default cycle and body parts, and you can change them.
        </p>
      ) : (
        <fieldset className={box}>
          <legend className={legend}>Rest weekdays · Workouts plus rest total 7 days</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {days.map((day, i) => (
              <Label key={day} className="min-h-9 gap-2 text-body-sm pointer-coarse:min-h-11">
                <Checkbox
                  id={`rest-day-${i}`}
                  // The box stays 16px against the legacy 44px button rule; the common
                  // Checkbox gives the 44px tap area (#271).
                  className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                  checked={draft.rest_days.includes(i)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      rest_days:
                        checked === true
                          ? [...draft.rest_days, i].sort()
                          : draft.rest_days.filter((d) => d !== i),
                    })
                  }
                />
                {day}
              </Label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

export function WeeklyGoals({ draft, setDraft }: { draft: Plan; setDraft: (plan: Plan) => void }) {
  return (
    <>
      {draft.weeks?.map((w, i) => (
        <fieldset key={w.week} className={cn(box, 'grid grid-cols-2 gap-3')}>
          <legend className={legend}>
            Week {w.week} {w.kind === 'deload' ? 'Deload' : 'Increase goal'}
          </legend>
          <Label className={fieldLabel}>
            {w.kind === 'deload' ? 'Decrease target' : 'Increase target'}
            <select
              className={nativeSelect}
              required
              value={w.kind === 'deload' ? (w.deload_metric ?? '') : w.kind}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  weeks: draft.weeks!.map((v, k) =>
                    k === i
                      ? {
                          ...v,
                          amount: '',
                          ...(v.kind === 'deload'
                            ? { deload_metric: e.target.value }
                            : { kind: e.target.value }),
                        }
                      : v,
                  ),
                })
              }
            >
              {w.kind === 'deload' ? (
                <>
                  <option value="" disabled>
                    Choose decrease target
                  </option>
                  <option value="weight">Total weight (kg)</option>
                  <option value="sets">Number of sets</option>
                  <option value="reps">Reps</option>
                </>
              ) : (
                <>
                  <option value="increase_weight">Total weight (kg)</option>
                  <option value="increase_reps">Reps</option>
                </>
              )}
            </select>
          </Label>
          <Label className={fieldLabel}>
            {w.kind === 'deload' ? 'Decrease amount' : 'Increase amount'}
            <Input
              className={touchText}
              required
              type="number"
              min={w.kind === 'increase_weight' || w.deload_metric === 'weight' ? '0.000001' : 1}
              max={
                w.deload_metric === 'sets'
                  ? 200
                  : w.kind === 'increase_reps' || w.deload_metric === 'reps'
                    ? 1000
                    : 99999
              }
              step={w.kind === 'increase_weight' || w.deload_metric === 'weight' ? 'any' : 1}
              value={w.amount}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  weeks: draft.weeks!.map((v, k) =>
                    k === i
                      ? {
                          ...v,
                          amount: e.target.value === '' ? '' : Number(e.target.value),
                        }
                      : v,
                  ),
                })
              }
            />
          </Label>
        </fieldset>
      ))}
    </>
  );
}
