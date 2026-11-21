import { Plus } from 'lucide-react';

import {
  type CardioKind,
  cardioKinds,
  routineCardioIntensities,
  type RoutineCardioIntensity,
} from '../../../shared/contract';
import { cardioKindLabels } from '../cardio/format';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { intensityLabels } from '../routine-cardio';
import { type Cardio, type Split } from './model';
import { fieldLabel, nativeSelect, touchText } from './styles';

export function CardioEditor({
  split,
  index,
  onChange,
}: {
  split: Split;
  index: number;
  onChange: (value: Split) => void;
}) {
  return (
    <>
      {/* #117: cardio done after this split's strength work. */}
      {(split.cardio ?? []).map((c, j) => {
        const setCardio = (value: Cardio) =>
          onChange({
            ...split,
            cardio: split.cardio!.map((v, k) => (k === j ? value : v)),
          });
        const number = (v: string) => (v === '' ? '' : Number(v));
        // The same names repeat per item and split; screen readers hear which one.
        // The space stays outside the hidden span, or the name reads "Intensity(split".
        const where = (
          <>
            {' '}
            <span className="sr-only">
              (split {index + 1}, cardio {j + 1})
            </span>
          </>
        );
        return (
          <div
            data-slot="routine-cardio"
            key={j}
            className="mt-3 grid grid-cols-2 items-end gap-3 border-t pt-3 md:grid-cols-3"
          >
            <Label className={fieldLabel}>
              Cardio type{where}
              <select
                className={nativeSelect}
                value={c.kind}
                onChange={(e) => setCardio({ ...c, kind: e.target.value as CardioKind })}
              >
                {cardioKinds.map((k) => (
                  <option key={k} value={k}>
                    {cardioKindLabels[k]}
                  </option>
                ))}
              </select>
            </Label>
            <Label className={fieldLabel}>
              Intensity{where}
              <select
                className={nativeSelect}
                value={c.intensity}
                onChange={(e) => {
                  const intensity = e.target.value as RoutineCardioIntensity;
                  // An interval item has repeats instead of a time or distance.
                  // The typed target stays in the form (not sent while it is an
                  // interval), so switching back does not lose it.
                  if (intensity === 'interval')
                    setCardio({
                      ...c,
                      intensity,
                      interval: c.interval ?? {
                        repeats: 6,
                        work_sec: 60,
                        recovery_sec: 60,
                      },
                    });
                  else {
                    const next: Cardio = { ...c, intensity };
                    delete next.interval;
                    if (next.minutes === undefined && next.distance_km === undefined)
                      next.minutes = '';
                    setCardio(next);
                  }
                }}
              >
                {routineCardioIntensities.map((v) => (
                  <option key={v} value={v}>
                    {intensityLabels[v]}
                  </option>
                ))}
              </select>
            </Label>
            {c.interval ? (
              (['repeats', 'work_sec', 'recovery_sec'] as const).map((key) => (
                <Label key={key} className={fieldLabel}>
                  {
                    {
                      repeats: 'Repeats',
                      work_sec: 'Work seconds',
                      recovery_sec: 'Recovery seconds',
                    }[key]
                  }
                  {where}
                  <Input
                    className={touchText}
                    required
                    type="number"
                    min={key === 'repeats' ? 1 : key === 'work_sec' ? 5 : 0}
                    max={key === 'repeats' ? 50 : 3600}
                    value={c.interval![key]}
                    onChange={(e) =>
                      setCardio({
                        ...c,
                        interval: { ...c.interval!, [key]: number(e.target.value) },
                      })
                    }
                  />
                </Label>
              ))
            ) : (
              <>
                <Label className={fieldLabel}>
                  Target{where}
                  <select
                    className={nativeSelect}
                    value={c.minutes !== undefined ? 'time' : 'distance'}
                    onChange={(e) =>
                      setCardio(
                        e.target.value === 'time'
                          ? { kind: c.kind, intensity: c.intensity, minutes: '' }
                          : { kind: c.kind, intensity: c.intensity, distance_km: '' },
                      )
                    }
                  >
                    <option value="time">Time</option>
                    <option value="distance">Distance</option>
                  </select>
                </Label>
                {c.minutes !== undefined ? (
                  <Label className={fieldLabel}>
                    Week 1 minutes{where}
                    <Input
                      className={touchText}
                      required
                      type="number"
                      min={1}
                      max={600}
                      value={c.minutes}
                      onChange={(e) => setCardio({ ...c, minutes: number(e.target.value) })}
                    />
                  </Label>
                ) : (
                  <Label className={fieldLabel}>
                    Week 1 km{where}
                    <Input
                      className={touchText}
                      required
                      type="number"
                      min={0.1}
                      max={500}
                      step={0.1}
                      value={c.distance_km}
                      onChange={(e) => setCardio({ ...c, distance_km: number(e.target.value) })}
                    />
                  </Label>
                )}
              </>
            )}
            <div className="col-span-2 flex items-end md:col-span-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Delete split ${index + 1} cardio ${j + 1}`}
                onClick={() =>
                  onChange({
                    ...split,
                    cardio: split.cardio!.filter((_, k) => k !== j),
                  })
                }
              >
                Delete cardio
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        // Beside Add exercise until cardio items come between them.
        className={cn('mt-3', !split.cardio?.length && 'ml-2')}
        disabled={(split.cardio?.length ?? 0) >= 10}
        onClick={() =>
          onChange({
            ...split,
            cardio: [...(split.cardio ?? []), { kind: 'running', intensity: 'zone2', minutes: '' }],
          })
        }
      >
        <Plus aria-hidden />
        Add cardio
      </Button>
    </>
  );
}
