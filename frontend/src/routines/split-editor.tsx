import { Plus } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Combobox } from '../components/ui/combobox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SimilarNameHint } from '../exercise-names';
import { bodyPartLabel } from '../labels';
import { cn } from '../lib/utils';
import { CardioEditor } from './cardio-editor';
import { type Exercise, exercise, type Machine, parts, type Plan, type Split } from './model';
import { box, fieldLabel, legend, nativeSelect, touchText } from './styles';

export function SplitEditor({
  split,
  index,
  progression,
  machines,
  exerciseNames,
  onChange,
}: {
  split: Split;
  index: number;
  progression: Plan['progression'];
  machines: Machine[];
  exerciseNames: readonly string[];
  onChange: (value: Split) => void;
}) {
  const setExercise = (j: number, value: Partial<Exercise>) =>
    onChange({
      ...split,
      exercises: split.exercises.map((v, k) => (k === j ? { ...v, ...value } : v)),
    });
  return (
    <fieldset className={box}>
      <legend className={legend}>Split {index + 1}</legend>
      <Label className={fieldLabel}>
        Split name
        <Input
          className={touchText}
          required
          value={split.name}
          maxLength={120}
          onChange={(e) => onChange({ ...split, name: e.target.value })}
        />
      </Label>
      <div className="flex flex-wrap gap-2">
        {parts.map((p) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            key={p}
            onClick={() => onChange({ ...split, body_parts: [...split.body_parts, p] })}
          >
            Add {bodyPartLabel(p)}
          </Button>
        ))}
      </div>
      <ol data-slot="split-parts" className="mt-2 flex flex-wrap gap-2">
        {split.body_parts.map((p, j) => (
          <li key={j} className="flex items-center gap-1 rounded-full border pl-3 text-body-sm">
            {bodyPartLabel(p)}{' '}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              aria-label={`Delete split ${index + 1} body part ${j + 1}`}
              onClick={() =>
                onChange({
                  ...split,
                  body_parts: split.body_parts.filter((_, k) => j !== k),
                })
              }
            >
              Delete
            </Button>
          </li>
        ))}
      </ol>
      {split.exercises.map((ex, j) => (
        <div
          data-slot="routine-exercise"
          className="mt-3 grid grid-cols-2 items-end gap-3 border-t pt-3 md:grid-cols-3"
          key={j}
        >
          {/* The hint stays in the name's grid cell. The row aligns cells at the bottom, so on
                          wide screens name and Machine (one-line labels) align at the top instead and a
                          shown hint does not lift the name field above Machine. */}
          <div className="col-span-2 md:col-span-1 md:self-start">
            <Label className={fieldLabel}>
              Exercise name
              {/* #124: the same suggestions as the journal and goals. */}
              <Combobox
                className={touchText}
                required
                maxLength={120}
                value={ex.exercise}
                options={exerciseNames}
                listLabel="Previously used names"
                onValueChange={(name) => setExercise(j, { exercise: name })}
              />
            </Label>
            <SimilarNameHint
              value={ex.exercise}
              names={exerciseNames}
              onReplace={(name) => setExercise(j, { exercise: name })}
            />
          </div>
          <Label className={cn(fieldLabel, 'col-span-2 md:self-start')}>
            Machine
            <select
              className={nativeSelect}
              value={ex.machine_id ?? ''}
              onChange={(e) =>
                setExercise(j, {
                  machine_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Free workout</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} · {m.name}
                </option>
              ))}
            </select>
          </Label>
          {(progression === 'auto'
            ? (['sets', 'weight', 'reps', 'rep_min', 'rep_max'] as const)
            : (['sets', 'weight', 'reps'] as const)
          ).map((key) => (
            <Label key={key} className={fieldLabel}>
              {progression === 'auto'
                ? {
                    sets: 'Number of sets',
                    weight: 'Current total weight (kg, including machine base weight)',
                    reps: 'Current reps',
                    rep_min: 'Lower reps',
                    rep_max: 'Upper reps',
                  }[key]
                : key === 'sets'
                  ? 'Reference sets'
                  : key === 'weight'
                    ? 'Reference total weight (kg, including machine base weight)'
                    : 'Reference reps'}
              <Input
                className={touchText}
                required
                type="number"
                min={key === 'weight' ? 0 : 1}
                max={key === 'weight' ? 99999 : key === 'sets' ? 200 : 1000}
                step={key === 'weight' ? 'any' : 1}
                value={ex[key] ?? ''}
                onChange={(e) =>
                  setExercise(j, {
                    [key]: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </Label>
          ))}
          <div className="col-span-2 flex items-end md:col-span-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={split.exercises.length === 1}
              onClick={() =>
                onChange({
                  ...split,
                  exercises: split.exercises.filter((_, k) => k !== j),
                })
              }
            >
              Delete exercise
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        onClick={() => onChange({ ...split, exercises: [...split.exercises, exercise()] })}
      >
        <Plus aria-hidden />
        Add exercise
      </Button>
      <CardioEditor split={split} index={index} onChange={onChange} />
    </fieldset>
  );
}
